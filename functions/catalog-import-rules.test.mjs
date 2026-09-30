import assert from 'node:assert/strict'
import test from 'node:test'
import { importConflict, manualCatalogExtras, preserveManualExtras } from './catalog-import-rules.js'

test('permite importar piezas propias para moto y barco', () => {
  assert.equal(importConflict(null, 'moto'), null)
  assert.equal(importConflict(null, 'barco'), null)
  assert.equal(importConflict({ source: 'manual-csv', vehicleType: 'moto' }, 'moto'), null)
  assert.equal(importConflict({ source: 'manual-csv', vehicleType: 'barco' }, 'barco'), null)
})

test('protege las referencias Bihr y las del otro vehículo', () => {
  assert.equal(importConflict({ source: 'bihr', vehicleType: 'moto' }, 'moto'), 'Bihr')
  assert.equal(importConflict({ source: 'manual-csv', vehicleType: 'barco' }, 'moto'), 'otro tipo de vehículo')
  assert.equal(importConflict({ source: 'manual-csv', vehicleType: 'moto' }, 'barco'), 'otro tipo de vehículo')
})

test('lee campos opcionales de proveedor sin perder ceros del código de barras', () => {
  assert.deepEqual(manualCatalogExtras({
    Marca: ' Acme ', 'Referencia proveedor': ' P-10 ', 'Referencia sustituta': ' P-11 ', 'Código de barras': '0843000000001',
    'Múltiplo de venta': '2', 'Categoría de origen': 'Recambios', 'Imagen URL': 'https://example.com/pieza.jpg',
  }), {
    brand: 'Acme', supplierReference: 'P-10', replacementReference: 'P-11', barcode: '0843000000001', salesMultiple: 2,
    sourceCategory: 'Recambios', imageUrl: 'https://example.com/pieza.jpg',
  })
})

test('admite el CSV antiguo y valida múltiplo e imagen', () => {
  assert.deepEqual(manualCatalogExtras({ Referencia: 'A-1' }), {
    brand: null, supplierReference: null, replacementReference: null, barcode: null, sourceCategory: null, salesMultiple: null, imageUrl: null,
  })
  assert.throws(() => manualCatalogExtras({ 'Múltiplo de venta': '0' }), /Múltiplo/)
  assert.throws(() => manualCatalogExtras({ 'Múltiplo de venta': '1.5' }), /Múltiplo/)
  assert.throws(() => manualCatalogExtras({ 'Imagen URL': 'javascript:alert(1)' }), /URL/)
})

test('una reimportación conserva los datos opcionales ausentes y la foto subida', () => {
  const previous = { brand: 'Acme', supplierReference: 'P-1', barcode: '0843', replacementReference: 'P-2', sourceCategory: 'Recambios', salesMultiple: 2, imageUrl: 'https://storage.example/foto.webp', imagePath: 'catalog-images/foto.webp' }
  const incoming = { brand: null, supplierReference: 'P-3', barcode: null, replacementReference: null, sourceCategory: null, salesMultiple: null, imageUrl: 'https://example.com/otra.jpg' }
  const merged = preserveManualExtras(incoming, previous)
  assert.equal(merged.brand, 'Acme')
  assert.equal(merged.supplierReference, 'P-3')
  assert.equal(merged.barcode, '0843')
  assert.equal(merged.replacementReference, 'P-2')
  assert.equal(merged.salesMultiple, 2)
  assert.equal(merged.imageUrl, previous.imageUrl)
})
