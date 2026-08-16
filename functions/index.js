import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onObjectFinalized } from 'firebase-functions/v2/storage'
import * as XLSX from 'xlsx'

initializeApp()
const db = getFirestore()
const allowedExtensions = new Set(['csv', 'xls', 'xlsx'])

export const startCatalogImport = onCall({ region: 'europe-west1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Inicia sesión para importar.')
  const admin = await db.doc(`admins/${request.auth.uid}`).get()
  if (!admin.exists || admin.data().active !== true) throw new HttpsError('permission-denied', 'No tienes permisos de administración.')
  const fileName = String(request.data?.fileName || '')
  const extension = fileName.split('.').pop()?.toLowerCase()
  if (!allowedExtensions.has(extension)) throw new HttpsError('invalid-argument', 'El archivo debe ser CSV, XLS o XLSX.')
  const job = await db.collection('importJobs').add({
    status: 'awaiting_upload', fileName, createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp(),
    processed: 0, created: 0, updated: 0, rejected: 0,
  })
  return { importId: job.id, path: `catalog-imports/${request.auth.uid}/${job.id}.${extension}` }
})

export const processCatalogImport = onObjectFinalized({
  region: 'europe-west1',
  bucket: 'victiker-taller.firebasestorage.app',
}, async (event) => {
  const object = event.data
  if (!object.name?.startsWith('catalog-imports/')) return
  const importId = object.metadata?.importId
  if (!importId) return
  const job = db.doc(`importJobs/${importId}`)
  const jobSnapshot = await job.get()
  if (!jobSnapshot.exists || ['processing', 'completed'].includes(jobSnapshot.data().status)) return
  await job.update({ status: 'processing', storagePath: object.name, startedAt: FieldValue.serverTimestamp() })
  try {
    const [buffer] = await getStorage().bucket(object.bucket).file(object.name).download()
    const rows = readRows(buffer, object.name)
    const result = await importRows(rows, jobSnapshot.data().createdBy, job)
    await job.update({ status: 'completed', ...result, finishedAt: FieldValue.serverTimestamp() })
  } catch (error) {
    console.error('Catalog import failed', importId, error)
    await job.update({ status: 'failed', error: error.message || 'No se ha podido procesar el archivo.', finishedAt: FieldValue.serverTimestamp() })
  }
})

function readRows(buffer, fileName) {
  // Los CSV exportados en UTF-8 suelen llegar sin BOM; indicar el codepage
  // evita que encabezados como "Descripción" se lean como "DescripciÃ³n".
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false, codepage: 65001 })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  if (!rows.length) throw new Error('El archivo no contiene filas.')
  return rows
}

async function importRows(rows, uid, job) {
  const writer = db.bulkWriter()
  const rejected = []
  let created = 0; let updated = 0; let processed = 0
  for (let offset = 0; offset < rows.length; offset += 250) {
    const valid = rows.slice(offset, offset + 250).flatMap((row, index) => {
      try { return [{ item: toCatalogItem(row, uid) }] } catch (error) { rejected.push({ row: offset + index + 2, message: error.message }); return [] }
    })
    if (!valid.length) {
      await job.update({ processed, created, updated, rejected: rejected.length })
      continue
    }
    const refs = valid.map(({ item }) => db.collection('catalog').doc(item.referenceNormalized))
    const existing = await db.getAll(...refs)
    valid.forEach(({ item }, index) => {
      const target = refs[index]
      if (existing[index].exists) { updated += 1; writer.set(target, item, { merge: true }) }
      else { created += 1; writer.create(target, { ...item, createdAt: FieldValue.serverTimestamp(), createdBy: uid }) }
      processed += 1
    })
    await job.update({ processed, created, updated, rejected: rejected.length })
  }
  await writer.close()
  if (rejected.length) await job.update({ rejectedRows: rejected.slice(0, 500) })
  return { processed, created, updated, rejected: rejected.length, total: rows.length }
}

function toCatalogItem(row, uid) {
  const value = (keys) => keys.map((key) => row[key]).find((entry) => entry !== undefined && String(entry).trim() !== '')
  const reference = String(value(['Referencia', 'reference']) || '').trim()
  const description = String(value(['Descripción', 'Descripcion', 'description']) || reference).trim()
  const rawPrice = value(['Precio', 'price'])
  const rawDiscount = value(['Descuento', 'discount'])
  const price = rawPrice === undefined || String(rawPrice).trim() === '' ? 0 : parseNumber(rawPrice)
  const discount = rawDiscount === undefined || String(rawDiscount).trim() === '' ? 0 : parseNumber(rawDiscount)
  if (!reference) throw new Error('La referencia es obligatoria.')
  if (!Number.isFinite(price) || price < 0) throw new Error('Precio inválido.')
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) throw new Error('Descuento inválido.')
  const vehicleType = normalizeVehicle(value(['TipoVehículo', 'tipoVehiculo', 'vehicleType']))
  const categoryId = normalize(value(['Categoría', 'Categoria', 'categoryId'])) || null
  const subcategoryId = normalize(value(['Subcategoría', 'Subcategoria', 'subcategoryId'])) || null
  return {
    reference, referenceNormalized: normalize(reference), description, descriptionNormalized: normalize(description), searchPrefixes: searchPrefixes(reference, description),
    price, currency: 'EUR', discount, vehicleType, categoryId, subcategoryId, status: 'active', updatedAt: FieldValue.serverTimestamp(), updatedBy: uid,
  }
}
function parseNumber(value) { return Number(String(value).replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')) }
function normalize(value = '') { return String(value).trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() }
function normalizeVehicle(value) { const normalized = normalize(value); return ['moto', 'barco'].includes(normalized) ? normalized : 'unclassified' }
function searchPrefixes(...values) { const prefixes = new Set(); values.map(normalize).filter(Boolean).forEach((value) => value.split(' ').forEach((word) => { for (let size = 2; size <= Math.min(word.length, 32); size += 1) prefixes.add(word.slice(0, size)) })); return [...prefixes] }
