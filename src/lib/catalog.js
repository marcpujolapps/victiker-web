import { collection, deleteDoc, doc, getCountFromServer, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, startAfter, updateDoc, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions, requireFirebase } from './firebase'

export const PAGE_SIZE = 24
export const VEHICLE_TYPES = [{ id: 'moto', label: 'Moto' }, { id: 'barco', label: 'Barco' }, { id: 'unclassified', label: 'Sin clasificar' }]

export function normalize(value = '') {
  return value.toString().trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

export function slugifyCatalogCategory(value = '') {
  return normalize(value).replaceAll(' ', '-')
}

export function searchPrefixes(...values) {
  const prefixes = new Set()
  values.map(normalize).filter(Boolean).forEach((value) => {
    value.split(' ').forEach((word) => {
      for (let size = 2; size <= Math.min(word.length, 32); size += 1) prefixes.add(word.slice(0, size))
    })
  })
  return [...prefixes]
}

function optionalImageUrl(value) {
  if (!value?.trim()) return null
  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
    return url.toString()
  } catch {
    throw new Error('La imagen debe ser una URL web válida.')
  }
}

export function catalogPayload(input, uid) {
  const reference = input.reference?.trim()
  const description = input.description?.trim()
  if (!reference || !description) throw new Error('Referencia y descripción son obligatorias.')
  const price = Number(input.price)
  const discount = Number(input.discount || 0)
  if (!Number.isFinite(price) || price < 0 || !Number.isFinite(discount) || discount < 0 || discount > 100) throw new Error('Revisa el precio y el descuento.')
  const salesMultiple = Number(input.salesMultiple === '' || input.salesMultiple == null ? 1 : input.salesMultiple)
  if (!Number.isInteger(salesMultiple) || salesMultiple < 1) throw new Error('El múltiplo de venta debe ser un número entero mayor que cero.')
  const brand = String(input.brand || '').trim()
  const supplierReference = String(input.supplierReference || '').trim()
  const barcode = String(input.barcode || '').trim()
  const sourceCategory = String(input.sourceCategory || '').trim()
  const replacementReference = String(input.replacementReference || '').trim()
  if ([brand, supplierReference, barcode, sourceCategory, replacementReference].some((field) => field.length > 160)) throw new Error('Los datos de proveedor no pueden superar los 160 caracteres por campo.')
  return {
    reference, referenceNormalized: normalize(reference), description, descriptionNormalized: normalize(description),
    searchPrefixes: searchPrefixes(reference, description, brand, supplierReference, barcode, sourceCategory, replacementReference), price, currency: 'EUR', discount,
    vehicleType: input.vehicleType || 'unclassified', categoryId: input.categoryId || null, subcategoryId: input.subcategoryId || null,
    brand: brand || null, supplierReference: supplierReference || null, barcode: barcode || null, sourceCategory: sourceCategory || null, replacementReference: replacementReference || null, salesMultiple,
    status: input.status || 'active', imageUrl: optionalImageUrl(input.imageUrl), imagePath: input.imagePath || null, updatedAt: serverTimestamp(), updatedBy: uid,
  }
}

export async function getCatalogPage({ vehicleType, categoryId, subcategoryId, term, cursor, admin = false, sort = 'reference', direction = 'asc' } = {}) {
  requireFirebase()
  const constraints = []
  if (!admin) constraints.push(where('status', '==', 'active'))
  else if (admin.status) constraints.push(where('status', '==', admin.status))
  if (vehicleType && vehicleType !== 'all') constraints.push(where('vehicleType', '==', vehicleType))
  if (categoryId) constraints.push(where('categoryId', '==', categoryId))
  if (subcategoryId) constraints.push(where('subcategoryId', '==', subcategoryId))
  const normalizedTerm = normalize(term).split(' ').at(-1)
  if (normalizedTerm?.length >= 2) constraints.push(where('searchPrefixes', 'array-contains', normalizedTerm))
  const sortField = ({ reference: 'referenceNormalized', name: 'descriptionNormalized', price: 'price' })[sort] || 'referenceNormalized'
  constraints.push(orderBy(sortField, direction === 'desc' ? 'desc' : 'asc'), limit(PAGE_SIZE + 1))
  if (cursor) constraints.push(startAfter(cursor))
  const snapshot = await getDocs(query(collection(db, 'catalog'), ...constraints))
  const docs = snapshot.docs.slice(0, PAGE_SIZE)
  return { items: docs.map((entry) => ({ id: entry.id, ...entry.data() })), nextCursor: snapshot.docs.length > PAGE_SIZE ? docs.at(-1) : null }
}

export async function getCatalogSuggestions(term) {
  requireFirebase()
  const prefix = normalize(term).split(' ').at(-1)
  if (!prefix || prefix.length < 2) return []
  const snapshot = await getDocs(query(collection(db, 'catalog'),
    where('status', '==', 'active'),
    where('searchPrefixes', 'array-contains', prefix),
    orderBy('referenceNormalized'),
    limit(8)))
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })).slice(0, 5)
}

export async function getCatalogCount(filters = {}) {
  requireFirebase()
  const constraints = [where('status', '==', filters.status || 'active')]
  if (filters.vehicleType && filters.vehicleType !== 'all') constraints.push(where('vehicleType', '==', filters.vehicleType))
  if (filters.categoryId) constraints.push(where('categoryId', '==', filters.categoryId))
  const normalizedTerm = normalize(filters.term).split(' ').at(-1)
  if (normalizedTerm?.length >= 2) constraints.push(where('searchPrefixes', 'array-contains', normalizedTerm))
  return (await getCountFromServer(query(collection(db, 'catalog'), ...constraints))).data().count
}

export async function getCatalogItem(id) {
  requireFirebase()
  const snapshot = await getDoc(doc(db, 'catalog', id))
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
}

const semanticSearchCache = new Map()

export function searchCatalogByEmbedding(term, limit = 40) {
  requireFirebase()
  const normalizedTerm = term.trim().toLocaleLowerCase('es')
  const key = `${normalizedTerm}:${limit}`
  const cached = semanticSearchCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.promise
  const search = httpsCallable(functions, 'searchCatalogByEmbedding', { timeout: 30000 })
  const promise = search({ term: normalizedTerm, limit }).then(({ data }) => data)
  semanticSearchCache.set(key, { promise, expiresAt: Date.now() + 30_000 })
  promise.catch(() => { if (semanticSearchCache.get(key)?.promise === promise) semanticSearchCache.delete(key) })
  if (semanticSearchCache.size > 50) semanticSearchCache.delete(semanticSearchCache.keys().next().value)
  return promise
}

export async function saveCatalogItem(id, input, uid) {
  requireFirebase()
  if (id && input.source === 'bihr') throw new Error('Las referencias de Bihr se actualizan automáticamente y no se pueden editar.')
  const payload = catalogPayload(input, uid)
  if (id) { await updateDoc(doc(db, 'catalog', id), payload); return id }
  const target = doc(db, 'catalog', payload.referenceNormalized)
  if ((await getDoc(target)).exists()) throw new Error('Ya existe un producto con esta referencia. Ábrelo desde el catálogo para editarlo.')
  await setDoc(target, { ...payload, createdAt: serverTimestamp(), createdBy: uid }, { merge: true })
  return target.id
}
export async function archiveCatalogItem(id, uid) { requireFirebase(); await updateDoc(doc(db, 'catalog', id), { status: 'archived', updatedAt: serverTimestamp(), updatedBy: uid }) }
export async function restoreCatalogItem(id, uid) { requireFirebase(); await updateDoc(doc(db, 'catalog', id), { status: 'active', updatedAt: serverTimestamp(), updatedBy: uid }) }
export async function removeCatalogItem(id) { requireFirebase(); await deleteDoc(doc(db, 'catalog', id)) }

export async function getTaxonomies() {
  requireFirebase(); const snapshot = await getDocs(query(collection(db, 'taxonomies'), orderBy('name')))
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))
}
export async function saveTaxonomy(id, value, uid) {
  requireFirebase(); const payload = { name: value.name.trim(), vehicleType: value.vehicleType, parentId: value.parentId || null, active: value.active !== false, updatedAt: serverTimestamp(), updatedBy: uid }
  if (id) return updateDoc(doc(db, 'taxonomies', id), payload)
  const slug = slugifyCatalogCategory(payload.name)
  if (!slug) throw new Error('Escribe un nombre de categoría válido.')
  const target = doc(db, 'taxonomies', payload.parentId ? `${payload.parentId}-${slug}` : `${payload.vehicleType}-${slug}`)
  await setDoc(target, { ...payload, source: 'manual', createdAt: serverTimestamp() }, { merge: true })
  return target
}
export async function setTaxonomyActive(id, active, uid) { requireFirebase(); return updateDoc(doc(db, 'taxonomies', id), { active, updatedAt: serverTimestamp(), updatedBy: uid }) }
