function normalize(value = '') {
  return String(value).toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

const STOP_WORDS = new Set(['a', 'al', 'con', 'de', 'del', 'el', 'en', 'la', 'las', 'lo', 'los', 'para', 'por', 'un', 'una', 'y'])

function textRelevance(term, product) {
  const reference = normalize(product.reference)
  const description = normalize(product.description)
  const text = normalize([product.reference, product.description, product.brand, product.sourceCategory].filter(Boolean).join(' '))
  if (reference === term) return 1
  if (reference.startsWith(term)) return 0.94
  if (description === term) return 0.9
  if (description.includes(term)) return 0.82
  const words = term.split(' ').filter((word) => word && !STOP_WORDS.has(word))
  if (!words.length) return 0
  const matches = words.filter((word) => text.split(' ').some((part) => part.startsWith(word))).length
  return (matches / words.length) * 0.65
}

export function rankCatalogResults(term, direct = [], semantic = [], limit = Infinity) {
  const normalizedTerm = normalize(term)
  const byId = new Map()
  for (const item of direct) byId.set(item.id, { ...item, _searchDirect: true })
  semantic.forEach((item, index) => byId.set(item.id, { ...byId.get(item.id), ...item, _searchDirect: byId.has(item.id), _semanticRank: index }))
  return [...byId.values()].map((item) => {
    const textScore = textRelevance(normalizedTerm, item)
    const similarity = Number.isFinite(item._searchDistance) ? Math.max(0, Math.min(1, 1 - item._searchDistance))
      : Number.isFinite(item._semanticRank) ? Math.max(0, 0.78 - item._semanticRank * 0.012) : null
    const score = normalize(item.reference) === normalizedTerm ? 2
      : similarity === null ? 0.12 + 0.45 * textScore
        : 0.75 * similarity + 0.25 * textScore
    return { ...item, _searchScore: score }
  }).sort((a, b) => b._searchScore - a._searchScore || String(a.reference || '').localeCompare(String(b.reference || ''), 'es')).slice(0, limit)
}
