import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_OFFER_COLORS, offerColors, safeOfferLink, sortOffers, validateOffer, validateOfferOrder } from '../src/lib/offerValidation.js'

test('offer links accept local paths and complete web URLs', () => {
  assert.equal(safeOfferLink('/repuestos/moto?buscar=aceite#productos'), '/repuestos/moto?buscar=aceite#productos')
  assert.equal(safeOfferLink('/'), '/')
  assert.equal(safeOfferLink(' HTTPS://example.com/oferta '), 'https://example.com/oferta')
})

test('offer links reject executable schemes, protocol-relative URLs, credentials and ambiguous separators', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,abc', '//example.com', '/\\example.com', '\\\\example.com', 'https:\\example.com', 'https:example.com', 'https:///example.com', 'https://user:pass@example.com', 'https://exam ple.com', '/oferta\nexterna', '/oferta\u0000externa', 'mailto:owner@example.com']) {
    assert.equal(safeOfferLink(value), '', value)
    assert.throws(() => validateOffer({ title: 'Oferta', linkUrl: value }), /enlace/, value)
  }
})

test('offer validation trims editable fields, supplies optional values and preserves draft visibility', () => {
  assert.deepEqual(validateOffer({ title: '  Cambio de aceite  ', description: '  Revisión incluida  ', active: false, order: '2' }), {
    title: 'Cambio de aceite', description: 'Revisión incluida', imageUrl: '', imagePath: '', linkUrl: '', linkLabel: '', active: false, order: 2, ...DEFAULT_OFFER_COLORS,
  })
  assert.equal(validateOffer({ title: 'Oferta' }).active, true)
})

test('legacy offers receive safe color defaults and valid custom colors are normalized', () => {
  for (const input of [undefined, null, {}, { backgroundColor: null, textColor: 'red' }]) assert.deepEqual(offerColors(input), DEFAULT_OFFER_COLORS)
  assert.deepEqual(offerColors({ backgroundColor: '#AABBCC', textColor: '#123456' }), { backgroundColor: '#aabbcc', textColor: '#123456' })
  const offer = validateOffer({ title: 'Oferta sin enlace', backgroundColor: '#AABBCC', textColor: '#123456' })
  assert.equal(offer.linkUrl, '')
  assert.equal(offer.backgroundColor, '#aabbcc')
  assert.equal(offer.textColor, '#123456')
  for (const key of ['backgroundColor', 'textColor']) {
    for (const value of ['', null, 123456, '#fff', '#12345678', 'red', '#12345g', 'url(example.com)']) assert.throws(() => validateOffer({ title: 'Oferta', [key]: value }), /color hexadecimal/)
  }
})

test('offer validation enforces field limits and image upload pairing', () => {
  for (const input of [
    { title: '' }, { title: ' '.repeat(10) }, { title: 'a'.repeat(121) },
    { description: 'a'.repeat(281) }, { linkLabel: 'a'.repeat(41) }, { active: 'false' },
    { order: -1 }, { order: 0.5 }, { order: 10_000 }, { order: true },
    { imageUrl: 'https://example.com/image.webp' }, { imagePath: 'offer-images/admin/image.webp' },
    { imagePath: 'catalog-images/admin/image.webp', imageUrl: 'https://example.com/image.webp' },
    { imagePath: 'offer-images/admin/image.webp', imageUrl: 'data:image/webp,abc' },
  ]) assert.throws(() => validateOffer({ title: 'Oferta', ...input }))
  assert.equal(validateOffer({ title: 'Oferta', imagePath: 'offer-images/admin/image.webp', imageUrl: 'https://example.com/image.webp' }).imagePath, 'offer-images/admin/image.webp')
})

test('sorting does not mutate the source and breaks matching positions consistently', () => {
  const offers = [{ id: 'b', order: 1 }, { id: 'z', order: 0 }, { id: 'a', order: 1 }]
  assert.deepEqual(sortOffers(offers).map(({ id }) => id), ['z', 'a', 'b'])
  assert.deepEqual(offers.map(({ id }) => id), ['b', 'z', 'a'])
})

test('atomic reorder input rejects duplicates, invalid IDs and oversized batches', () => {
  assert.deepEqual(validateOfferOrder(['offer-a', 'offer-b']), ['offer-a', 'offer-b'])
  for (const value of [[], ['same', 'same'], ['path/traversal'], [''], Array.from({ length: 501 }, (_, index) => 'offer-' + index)]) assert.throws(() => validateOfferOrder(value))
})
