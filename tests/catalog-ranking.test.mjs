import assert from 'node:assert/strict'
import test from 'node:test'
import { rankCatalogResults } from '../src/lib/catalogRanking.js'

test('a strong semantic match can outrank a weak text match', () => {
  const direct = [{ id: 'direct', reference: 'A-1', description: 'Kit de taller con luz' }]
  const semantic = [{ id: 'similar', reference: 'B-2', description: 'Chaleco reflectante', _searchDistance: 0.08 }]
  assert.deepEqual(rankCatalogResults('luz de emergencia', direct, semantic).map((item) => item.id), ['similar', 'direct'])
})

test('exact references stay first and duplicates retain their semantic score', () => {
  const direct = [{ id: 'exact', reference: 'FM01013', description: 'Filtro de aire' }, { id: 'overlap', reference: 'F-2', description: 'Filtro de aire' }]
  const semantic = [{ id: 'overlap', reference: 'F-2', description: 'Filtro de aire', _searchDistance: 0.12 }]
  const ranked = rankCatalogResults('FM01013', direct, semantic)
  assert.deepEqual(ranked.map((item) => item.id), ['exact', 'overlap'])
  assert.equal(ranked[1]._searchDirect, true)
  assert.equal(ranked[1]._searchDistance, 0.12)
})
