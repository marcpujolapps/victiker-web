export const OFFER_LIMITS = Object.freeze({ title: 120, description: 280, linkLabel: 40, linkUrl: 1000, imageUrl: 2000, imagePath: 300, order: 9999 })
export const DEFAULT_OFFER_COLORS = Object.freeze({ backgroundColor: '#153866', textColor: '#ffffff' })

function validColor(value) { return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/u.test(value) }

export function offerColors(input) {
  return Object.fromEntries(Object.entries(DEFAULT_OFFER_COLORS).map(([key, fallback]) => [key, validColor(input?.[key]) ? input[key].toLowerCase() : fallback]))
}

function textValue(value, label, maximum) {
  if (value == null) return ''
  if (typeof value !== 'string') throw new Error(`${label} no es válido.`)
  const text = value.trim()
  if (text.length > maximum) throw new Error(`${label} no puede superar los ${maximum} caracteres.`)
  return text
}

export function safeOfferLink(value) {
  if (typeof value !== 'string') return ''
  const link = value.trim()
  if (!link || link.length > OFFER_LIMITS.linkUrl || /[\s\\\u0000-\u001f\u007f]/u.test(link)) return ''
  if (link.startsWith('/')) return link.startsWith('//') ? '' : link
  if (!/^https?:\/\/[^/]/iu.test(link)) return ''
  try {
    const url = new URL(link)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return ''
    return url.href.length <= OFFER_LIMITS.linkUrl ? url.href : ''
  } catch { return '' }
}

export function validateOffer(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('La oferta no es válida.')
  const title = textValue(input.title, 'El título', OFFER_LIMITS.title)
  if (!title) throw new Error('Escribe un título para la oferta.')
  const description = textValue(input.description, 'El texto', OFFER_LIMITS.description)
  const linkLabel = textValue(input.linkLabel, 'El texto del enlace', OFFER_LIMITS.linkLabel)
  const rawLink = textValue(input.linkUrl, 'El enlace', OFFER_LIMITS.linkUrl)
  const linkUrl = safeOfferLink(rawLink)
  if (rawLink && !linkUrl) throw new Error('Usa una ruta de la web que empiece por / o un enlace completo http:// o https://, sin espacios.')
  const imageUrl = textValue(input.imageUrl, 'La dirección de la imagen', OFFER_LIMITS.imageUrl)
  const imagePath = textValue(input.imagePath, 'La ruta de la imagen', OFFER_LIMITS.imagePath)
  if (Boolean(imageUrl) !== Boolean(imagePath)) throw new Error('La imagen de la oferta no se ha guardado correctamente. Vuelve a subirla.')
  if (imagePath && !/^offer-images\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9-]+\.webp$/u.test(imagePath)) throw new Error('La ruta de la imagen no es válida.')
  if (imageUrl && (!/^https?:\/\//u.test(imageUrl) || /[\s\\\u0000-\u001f\u007f]/u.test(imageUrl))) throw new Error('La dirección de la imagen no es válida.')
  if (imageUrl) {
    try {
      const url = new URL(imageUrl)
      if (!url.hostname || url.username || url.password) throw new Error()
    } catch { throw new Error('La dirección de la imagen no es válida.') }
  }
  if (input.active != null && typeof input.active !== 'boolean') throw new Error('Selecciona si la oferta está visible.')
  if (input.order != null && !['string', 'number'].includes(typeof input.order)) throw new Error('El orden de la oferta no es válido.')
  const order = Number(input.order ?? 0)
  if (!Number.isInteger(order) || order < 0 || order > OFFER_LIMITS.order) throw new Error('El orden debe ser un número entero entre 0 y 9999.')
  for (const key of Object.keys(DEFAULT_OFFER_COLORS)) {
    if (input[key] !== undefined && !validColor(input[key])) throw new Error('Usa un color hexadecimal completo, por ejemplo #153866.')
  }
  return { title, description, imageUrl, imagePath, linkUrl, linkLabel, active: input.active !== false, order, ...offerColors(input) }
}

export function sortOffers(offers) {
  return [...offers].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.id).localeCompare(String(b.id)))
}

export function validateOfferOrder(orderedIds) {
  if (!Array.isArray(orderedIds) || !orderedIds.length || orderedIds.length > 500 || orderedIds.some((id) => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(id)) || new Set(orderedIds).size !== orderedIds.length) {
    throw new Error('No se ha podido ordenar las ofertas. Actualiza la página e inténtalo de nuevo.')
  }
  return orderedIds
}
