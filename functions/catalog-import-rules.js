import { parseCatalogNumber } from './catalog-csv.js'

export function importConflict(previous, vehicleType) {
  if (previous?.source === 'bihr') return 'Bihr'
  if (previous?.vehicleType && previous.vehicleType !== vehicleType) return 'otro tipo de vehículo'
  return null
}

export function manualCatalogExtras(row) {
  const value = (keys) => keys.map((key) => row[key]).find((entry) => entry !== undefined && String(entry).trim() !== '')
  const text = (keys) => String(value(keys) ?? '').trim() || null
  const rawMultiple = value(['Múltiplo de venta', 'Multiplo de venta', 'SalesMultiple', 'salesMultiple'])
  const salesMultiple = rawMultiple === undefined ? null : parseCatalogNumber(rawMultiple)
  if (salesMultiple !== null && (!Number.isInteger(salesMultiple) || salesMultiple < 1)) throw new Error('Múltiplo de venta inválido.')
  const imageUrlInput = text(['Imagen URL', 'URL de imagen', 'ImageUrl', 'imageUrl', 'DefaultPicture'])
  let imageUrl = null
  if (imageUrlInput) {
    try {
      const url = new URL(imageUrlInput)
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
      imageUrl = url.toString()
    } catch { throw new Error('La URL de imagen no es válida.') }
  }
  const fields = {
    brand: text(['Marca', 'Brand', 'brand']),
    supplierReference: text(['Referencia proveedor', 'Referencia del proveedor', 'Ref. proveedor', 'SupplierProductCode', 'supplierReference']),
    barcode: text(['Código de barras', 'Código de Barras', 'Codigo de barras', 'BarCode', 'barcode']),
    replacementReference: text(['Referencia sustituta', 'Nueva referencia', 'NewPartNumber', 'replacementReference']),
    sourceCategory: text(['Categoría de origen', 'Categoria de origen', 'SourceCategory', 'sourceCategory', 'MainCategory', 'Category1']),
    salesMultiple,
    imageUrl,
  }
  if ([fields.brand, fields.supplierReference, fields.barcode, fields.sourceCategory, fields.replacementReference].some((field) => field && field.length > 160)) throw new Error('Un dato de proveedor supera los 160 caracteres.')
  return fields
}

export function preserveManualExtras(item, previous) {
  const merged = { ...item }
  for (const field of ['brand', 'supplierReference', 'barcode', 'sourceCategory', 'replacementReference', 'imageUrl', 'salesMultiple']) {
    if (merged[field] == null) merged[field] = previous[field] ?? (field === 'salesMultiple' ? 1 : null)
  }
  if (previous.imagePath) merged.imageUrl = previous.imageUrl || null
  return merged
}
