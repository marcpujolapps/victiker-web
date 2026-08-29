import assert from 'node:assert/strict'
import test from 'node:test'
import AdmZip from 'adm-zip'
import { BihrClient, bihrProductHash, bihrProductWrites, buildBihrSyncPlan, canArchiveBihrPlan, extractCatalogRows, runWithConcurrency, toBihrCatalogItem } from './bihr.js'

function catalogArchive() {
  const archive = new AdmZip()
  archive.addFile('HardPart.csv', Buffer.from('ProductCode,Brand,MainCategory,ProductName,Designation,RetailPriceIncludingTax,StockValue,StockLevel,DefaultPicture\n010046,ELECTROSPORT,Electrical,STATOR YAMAHA,"Stator Yamaha, modelo YFM350","219,00",2,Short,https://static.bihr.net/v2/xlarge/image.jpg\n'))
  return archive.toBuffer()
}

test('convierte una fila HardPart al modelo del catálogo', () => {
  const item = toBihrCatalogItem({
    ProductCode: '010046', Brand: 'ELECTROSPORT', MainCategory: 'Electrical', ProductName: 'STATOR YAMAHA',
    Designation: 'ELECTROSPORT Stator Yamaha', RetailPriceIncludingTax: '219,00', StockValue: '2', StockLevel: 'Short',
    DefaultPicture: 'https://static.bihr.net/v2/xlarge/image.jpg', SupplierProductCode: 'ESG432',
  }, { syncId: 'sync-1', serverTimestamp: 'timestamp' })

  assert.equal(item.reference, '010046')
  assert.equal(item.price, 219)
  assert.equal(item.categoryId, 'bihr-electrical')
  assert.equal(item.imageUrl, 'https://static.bihr.net/v2/xlarge/image.jpg')
  assert.equal(item.stockValue, 2)
  assert.equal(item.source, 'bihr')
  assert.equal(item.bihr.available, true)
  assert.ok(item.searchPrefixes.includes('elec'))
})

test('extrae las filas CSV del ZIP de Bihr', () => {
  const rows = extractCatalogRows(catalogArchive())
  assert.equal(rows.length, 1)
  assert.equal(rows[0].ProductCode, '010046')
  assert.equal(rows[0].RetailPriceIncludingTax, '219,00')
})

test('descarga inmediatamente un catálogo ya generado', async () => {
  const archive = catalogArchive()
  const calls = []
  const client = new BihrClient({ username: 'customer', password: 'secret', fetchImpl: async (url) => {
    calls.push(url)
    if (url.endsWith('/Authentication/Token')) return Response.json({ access_token: 'token' })
    return new Response(archive, { status: 200 })
  } })

  assert.deepEqual(await client.downloadEssentialHardPartCatalog(), archive)
  assert.equal(calls.length, 2)
})

test('espera la generación asíncrona y descarga el resultado', async () => {
  const archive = catalogArchive()
  const client = new BihrClient({ username: 'customer', password: 'secret', sleep: async () => {}, fetchImpl: async (url) => {
    if (url.endsWith('/Authentication/Token')) return Response.json({ access_token: 'token' })
    if (url.endsWith('/Catalog/EssentialHardPart')) return Response.json({ TicketId: 'ticket-1' }, { status: 202 })
    if (url.includes('/Catalog/GenerationStatus')) return Response.json({ RequestStatus: 'DONE', DownloadId: 'download-1' })
    if (url.includes('/Catalog/GeneratedFile')) return new Response(archive, { status: 200 })
    throw new Error(`Petición no esperada: ${url}`)
  } })

  assert.deepEqual(await client.downloadEssentialHardPartCatalog(), archive)
})

function sampleRow(overrides = {}) {
  return {
    ProductCode: '010046', Brand: 'ELECTROSPORT', MainCategory: 'Electrical', ProductName: 'STATOR YAMAHA',
    Designation: 'ELECTROSPORT Stator Yamaha', RetailPriceIncludingTax: '219,00', StockValue: '2', StockLevel: 'Short',
    DefaultPicture: 'https://static.bihr.net/v2/xlarge/image.jpg', SupplierProductCode: 'ESG432', ...overrides,
  }
}

function planFor(rows, manifest = null, syncId = 'sync-1') {
  return buildBihrSyncPlan(rows, { manifest, syncId, serverTimestamp: `server-${syncId}` })
}

test('el hash es determinista y excluye metadatos volátiles de sincronización', () => {
  const first = toBihrCatalogItem(sampleRow(), { syncId: 'one', serverTimestamp: 'now-1' })
  const second = toBihrCatalogItem(sampleRow(), { syncId: 'two', serverTimestamp: 'now-2' })
  assert.equal(bihrProductHash(first), bihrProductHash(first))
  assert.equal(bihrProductHash(first), bihrProductHash(second))
  assert.notEqual(bihrProductHash(first), bihrProductHash({ ...first, price: 220 }))
  assert.notEqual(bihrProductHash(first), bihrProductHash({ ...first, imageUrl: 'https://static.bihr.net/new.jpg' }))
})

test('una segunda sincronización idéntica no programa escrituras de productos', () => {
  const initial = planFor([sampleRow()])
  const repeated = planFor([sampleRow()], initial.manifest, 'sync-2')
  assert.equal(initial.newProducts.length, 1)
  assert.equal(repeated.unchangedProducts.length, 1)
  assert.equal(repeated.newProducts.length, 0)
  assert.equal(repeated.modifiedProducts.length, 0)
  assert.equal(bihrProductWrites(repeated).length, 0)
})

test('clasifica referencias nuevas, modificadas y ausentes', () => {
  const initial = planFor([sampleRow(), sampleRow({ ProductCode: '010047' })])
  const next = planFor([sampleRow({ RetailPriceIncludingTax: '229,00' }), sampleRow({ ProductCode: '010048' })], initial.manifest, 'sync-2')
  assert.equal(next.modifiedProducts.length, 1)
  assert.equal(next.newProducts.length, 1)
  assert.equal(next.unchangedProducts.length, 0)
  assert.equal(next.removedProducts.length, 1)
  assert.equal(next.removedProducts[0].reference, '010047')
  assert.equal(bihrProductWrites(next).length, 2)
})

test('la importación inicial sigue planificando todas las referencias y conserva URLs de imagen', () => {
  const initial = planFor([sampleRow(), sampleRow({ ProductCode: '010047', DefaultPicture: '' })])
  assert.equal(bihrProductWrites(initial, { initialManifest: true }).length, 2)
  assert.equal(initial.images, 1)
  assert.equal(initial.products[0].item.imageUrl, 'https://static.bihr.net/v2/xlarge/image.jpg')
})

test('un catálogo vacío, incompleto o anómalo nunca permite archivar referencias', () => {
  const baseline = planFor([sampleRow(), sampleRow({ ProductCode: '010047' })])
  const empty = planFor([], baseline.manifest, 'sync-2')
  const partial = planFor([sampleRow()], baseline.manifest, 'sync-3')
  assert.equal(canArchiveBihrPlan(empty, baseline.manifest, { minRows: 1 }), false)
  assert.equal(canArchiveBihrPlan(partial, baseline.manifest, { minRows: 1, maxRemovalRatio: 0.2 }), false)
})

test('el pool de escritura respeta la concurrencia máxima y procesa todas las páginas', async () => {
  let active = 0
  let peak = 0
  const completed = []
  await runWithConcurrency([0, 1, 2, 3, 4, 5, 6], 3, async (value) => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise((resolve) => setTimeout(resolve, 2))
    completed.push(value)
    active -= 1
  })
  assert.equal(peak, 3)
  assert.deepEqual(completed.sort((left, right) => left - right), [0, 1, 2, 3, 4, 5, 6])
})

test('el pool deja de asignar páginas nuevas tras un error', async () => {
  const started = []
  await assert.rejects(runWithConcurrency([0, 1, 2, 3, 4, 5], 2, async (value) => {
    started.push(value)
    if (value === 0) throw new Error('fallo controlado')
    await new Promise((resolve) => setTimeout(resolve, 4))
  }), /fallo controlado/)
  assert.ok(started.length <= 2)
})
