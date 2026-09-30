import { createHash } from 'node:crypto'

export function embeddingText(product) {
  return [product.reference, product.brand, product.productName, product.description, product.sourceCategory, product.categoryName, product.subcategoryName, product.vehicleType]
    .map((value) => String(value || '').trim()).filter(Boolean).join('. ').slice(0, 4000)
}

export function embeddingHash(text) { return createHash('sha256').update(text).digest('hex') }

export function planCatalogEmbedding(productId, product, currentEmbedding, model) {
  if (!product) return { type: currentEmbedding ? 'delete' : 'none' }

  const metadata = {
    productId,
    reference: product.reference || '',
    status: product.status || 'active',
    vehicleType: product.vehicleType || 'unclassified',
  }
  const metadataChanged = Object.entries(metadata).some(([key, value]) => currentEmbedding?.[key] !== value)

  if (metadata.status !== 'active') return currentEmbedding && metadataChanged ? { type: 'sync', metadata } : { type: 'none' }

  const text = embeddingText(product)
  const hash = embeddingHash(text)
  if (currentEmbedding?.contentHash === hash && currentEmbedding?.model === model) {
    return metadataChanged ? { type: 'sync', metadata } : { type: 'none' }
  }
  return { type: 'generate', metadata, text, hash }
}

export function normalizeCatalogSearch(value) {
  return String(value).trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}
