import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import * as XLSX from 'xlsx'

test('el CSV de muestra usa exactamente las columnas aceptadas para barco', async () => {
  const buffer = await readFile(new URL('../public/muestra-catalogo-barco.csv', import.meta.url))
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false, codepage: 65001 })
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' })

  assert.deepEqual(Object.keys(rows[0]), ['Referencia', 'Descripción', 'Precio', 'Descuento', 'Categoría', 'Subcategoría'])
  assert.equal(rows.length, 2)
  assert.equal(rows[0].Referencia, 'BAR-0001')
  assert.equal(rows[0].Categoría, 'Motor y propulsión')
})
