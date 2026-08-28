import assert from 'node:assert/strict'
import test from 'node:test'
import AdmZip from 'adm-zip'
import { BihrClient, extractCatalogRows, toBihrCatalogItem } from './bihr.js'

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
