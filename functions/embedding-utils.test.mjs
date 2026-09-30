import test from 'node:test'
import assert from 'node:assert/strict'
import { embeddingHash, embeddingText, normalizeCatalogSearch, planCatalogEmbedding } from './embedding-utils.js'

test('embedding text covers searchable catalog attributes and is bounded', () => {
  const value = embeddingText({ reference: 'AB-12', brand: 'Marca', description: 'Filtro de aceite', sourceCategory: 'Motor', vehicleType: 'moto' })
  assert.match(value, /AB-12.*Marca.*Filtro de aceite.*Motor.*moto/)
  assert.equal(embeddingText({ description: 'x'.repeat(5000) }).length, 4000)
})

test('embedding hashes are stable and change when product text changes', () => {
  assert.equal(embeddingHash('filtro'), embeddingHash('filtro'))
  assert.notEqual(embeddingHash('filtro'), embeddingHash('aceite'))
})

test('plans incremental catalog embedding maintenance without unnecessary generations', () => {
  const product = { reference: 'AB-12', description: 'Filtro de aceite', status: 'active', vehicleType: 'moto' }
  const contentHash = embeddingHash(embeddingText(product))
  const current = { productId: 'ab-12', reference: 'AB-12', status: 'active', vehicleType: 'moto', contentHash, model: 'test-model' }

  assert.deepEqual(planCatalogEmbedding('ab-12', product, current, 'test-model'), { type: 'none' })
  assert.equal(planCatalogEmbedding('ab-12', { ...product, price: 12 }, current, 'test-model').type, 'none')
  assert.equal(planCatalogEmbedding('ab-12', { ...product, description: 'Filtro de aire' }, current, 'test-model').type, 'generate')
  assert.deepEqual(planCatalogEmbedding('ab-12', { ...product, status: 'archived' }, current, 'test-model'), {
    type: 'sync', metadata: { productId: 'ab-12', reference: 'AB-12', status: 'archived', vehicleType: 'moto' },
  })
  assert.deepEqual(planCatalogEmbedding('ab-12', null, current, 'test-model'), { type: 'delete' })
  assert.deepEqual(planCatalogEmbedding('ab-12', null, null, 'test-model'), { type: 'none' })
})

test('catalog query normalization removes accents and punctuation', () => {
  assert.equal(normalizeCatalogSearch('FILTRO-áceite / Yamaha'), 'filtro aceite yamaha')
})
