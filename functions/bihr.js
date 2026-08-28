import AdmZip from 'adm-zip'
import { parse as parseCsv } from 'csv-parse/sync'
import * as XLSX from 'xlsx'

const DEFAULT_API_BASE_URL = 'https://api.bihr.net/api/v2.1'
const CATALOG_POLL_INTERVAL_MS = 5000
const CATALOG_POLL_TIMEOUT_MS = 25 * 60 * 1000

export function normalizeCatalogValue(value = '') {
  return String(value).trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

export function catalogSearchPrefixes(...values) {
  const prefixes = new Set()
  values.map(normalizeCatalogValue).filter(Boolean).forEach((value) => {
    value.split(' ').forEach((word) => {
      for (let size = 2; size <= Math.min(word.length, 32); size += 1) prefixes.add(word.slice(0, size))
    })
  })
  return [...prefixes]
}

function normalizedRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeCatalogValue(key).replaceAll(' ', ''), value]))
}

function firstValue(row, keys) {
  const normalized = normalizedRow(row)
  return keys.map((key) => normalized[normalizeCatalogValue(key).replaceAll(' ', '')]).find((value) => value !== undefined && String(value).trim() !== '')
}

function parseNumber(value, fallback = 0) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback
  const parsed = Number(String(value).replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

function safeImageUrl(value) {
  if (!value) return null
  try {
    const url = new URL(String(value).trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

export function toBihrCatalogItem(row, { syncId, serverTimestamp }) {
  const reference = String(firstValue(row, ['ProductCode', 'PartNumber', 'ProductId']) || '').trim()
  if (!reference) throw new Error('La fila de Bihr no contiene ProductCode.')

  const productName = String(firstValue(row, ['ProductName', 'ShortDescription1']) || '').trim()
  const designation = String(firstValue(row, ['Designation', 'Description', 'FurtherDescription']) || '').trim()
  const description = designation || productName || reference
  const brand = String(firstValue(row, ['Brand']) || '').trim()
  const sourceCategory = String(firstValue(row, ['MainCategory', 'Category1']) || '').trim()
  const stockLevel = String(firstValue(row, ['StockLevel', 'StockLevelDescription']) || '').trim()
  const imageUrl = safeImageUrl(firstValue(row, ['DefaultPicture', 'ImageUrl']))
  const categorySlug = normalizeCatalogValue(sourceCategory).replaceAll(' ', '-')

  return {
    reference,
    referenceNormalized: normalizeCatalogValue(reference),
    description,
    descriptionNormalized: normalizeCatalogValue(description),
    searchPrefixes: catalogSearchPrefixes(reference, description, productName, brand, sourceCategory),
    price: parseNumber(firstValue(row, ['RetailPriceIncludingTax', 'PublicPriceTTC'])),
    currency: 'EUR',
    discount: 0,
    vehicleType: 'moto',
    categoryId: categorySlug ? `bihr-${categorySlug}` : null,
    subcategoryId: null,
    status: 'active',
    imageUrl,
    brand: brand || null,
    sourceCategory: sourceCategory || null,
    stockLevel: stockLevel || null,
    stockValue: parseNumber(firstValue(row, ['StockValue']), null),
    supplierReference: String(firstValue(row, ['SupplierProductCode']) || '').trim() || null,
    barcode: String(firstValue(row, ['BarCode']) || '').trim() || null,
    salesMultiple: parseNumber(firstValue(row, ['SalesMultiple']), 1),
    source: 'bihr',
    updatedAt: serverTimestamp,
    updatedBy: 'bihr-sync',
    bihr: {
      syncId,
      productCode: reference,
      newPartNumber: String(firstValue(row, ['NewPartNumber']) || '').trim() || null,
      available: true,
      syncedAt: serverTimestamp,
    },
  }
}

export function extractCatalogRows(zipBuffer) {
  const archive = new AdmZip(Buffer.from(zipBuffer))
  const entries = archive.getEntries().filter((entry) => !entry.isDirectory && /\.(csv|xls|xlsx)$/i.test(entry.entryName))
  if (!entries.length) throw new Error('El catálogo de Bihr no contiene ningún CSV, XLS o XLSX.')

  return entries.flatMap((entry) => {
    if (/\.csv$/i.test(entry.entryName)) return parseCsv(entry.getData(), { bom: true, columns: true, delimiter: [',', ';'], skip_empty_lines: true, relax_column_count: true })
    const workbook = XLSX.read(entry.getData(), { type: 'buffer', raw: false, codepage: 65001 })
    return workbook.SheetNames.flatMap((sheetName) => XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' }))
  })
}

async function readJson(response) {
  const text = await response.text()
  try { return JSON.parse(text) } catch { throw new Error(`Bihr ha devuelto una respuesta no válida (${response.status}).`) }
}

async function expectOk(response, context) {
  if (response.ok) return response
  const details = await response.text().catch(() => '')
  throw new Error(`${context} (${response.status})${details ? `: ${details.slice(0, 300)}` : ''}`)
}

export class BihrClient {
  constructor({ username, password, fetchImpl = fetch, apiBaseUrl = DEFAULT_API_BASE_URL, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
    this.username = username
    this.password = password
    this.fetch = fetchImpl
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, '')
    this.sleep = sleep
    this.token = null
  }

  async authenticate() {
    const body = new FormData()
    body.set('UserName', this.username)
    body.set('PassWord', this.password)
    const response = await expectOk(await this.fetch(`${this.apiBaseUrl}/Authentication/Token`, { method: 'POST', body }), 'No se ha podido autenticar con Bihr')
    const result = await readJson(response)
    if (!result.access_token) throw new Error('Bihr no ha devuelto un token de acceso.')
    this.token = result.access_token
    return this.token
  }

  async authorizedFetch(path, init = {}, retryAuthentication = true) {
    if (!this.token) await this.authenticate()
    const response = await this.fetch(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${this.token}` },
    })
    if (response.status === 401 && retryAuthentication) {
      await this.authenticate()
      return this.authorizedFetch(path, init, false)
    }
    return response
  }

  async downloadEssentialHardPartCatalog() {
    const request = await this.authorizedFetch('/Catalog/EssentialHardPart', { method: 'POST' })
    if (request.status === 200) return Buffer.from(await request.arrayBuffer())
    await expectOk(request, 'No se ha podido solicitar el catálogo de Bihr')
    if (request.status !== 202) throw new Error(`Bihr ha respondido con un estado inesperado (${request.status}).`)

    const ticket = await readJson(request)
    if (!ticket.TicketId) throw new Error('Bihr no ha devuelto el identificador de generación del catálogo.')
    const startedAt = Date.now()

    while (Date.now() - startedAt < CATALOG_POLL_TIMEOUT_MS) {
      await this.sleep(CATALOG_POLL_INTERVAL_MS)
      const statusResponse = await expectOk(await this.authorizedFetch(`/Catalog/GenerationStatus?ticketId=${encodeURIComponent(ticket.TicketId)}`), 'No se ha podido consultar la generación del catálogo')
      const status = await readJson(statusResponse)
      if (status.RequestStatus === 'ERROR') throw new Error('Bihr no ha podido generar el catálogo.')
      if (status.RequestStatus === 'DONE') {
        if (!status.DownloadId) throw new Error('Bihr ha terminado el catálogo sin devolver el identificador de descarga.')
        const download = await expectOk(await this.authorizedFetch(`/Catalog/GeneratedFile?downloadId=${encodeURIComponent(status.DownloadId)}`), 'No se ha podido descargar el catálogo de Bihr')
        return Buffer.from(await download.arrayBuffer())
      }
    }
    throw new Error('Bihr ha tardado demasiado en generar el catálogo.')
  }
}
