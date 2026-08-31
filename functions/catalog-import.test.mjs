import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { parseCatalogNumber, readCatalogRows } from './catalog-csv.js'

test('el CSV de muestra usa exactamente las columnas aceptadas para barco', async () => {
  const buffer = await readFile(new URL('../public/muestra-catalogo-barco.csv', import.meta.url))
  const rows = readCatalogRows(buffer)

  assert.deepEqual(Object.keys(rows[0]), ['Referencia', 'Descripción', 'Precio', 'Descuento', 'Categoría', 'Subcategoría'])
  assert.equal(rows.length, 2)
  assert.equal(rows[0].Referencia, 'BAR-0001')
  assert.equal(rows[0].Categoría, 'Motor y propulsión')
})

test('conserva la coma decimal del CSV antes de convertir el precio', async () => {
  const buffer = await readFile(new URL('../../catalogo-primeros-10.csv', import.meta.url))
  const rows = readCatalogRows(buffer)

  assert.equal(rows[0].Referencia, 'A/P1774')
  assert.equal(rows[0].Precio, '16,1100006103516')
  assert.ok(Math.abs(parseCatalogNumber(rows[0].Precio) - 16.1100006103516) < Number.EPSILON)
})

test('interpreta precios con formatos españoles e internacionales', () => {
  assert.equal(parseCatalogNumber('16,11'), 16.11)
  assert.equal(parseCatalogNumber('1.234,56'), 1234.56)
  assert.equal(parseCatalogNumber('1,234.56'), 1234.56)
  assert.equal(parseCatalogNumber('1,234,567'), 1234567)
  assert.equal(parseCatalogNumber('39.90'), 39.9)
})
