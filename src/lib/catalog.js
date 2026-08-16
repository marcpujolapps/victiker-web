import { addDoc, collection, deleteDoc, doc, getCountFromServer, getDocs, limit, orderBy, query, serverTimestamp, setDoc, startAfter, updateDoc, where } from 'firebase/firestore'
import { db, requireFirebase } from './firebase'

export const PAGE_SIZE = 24
export const VEHICLE_TYPES = [{ id: 'moto', label: 'Moto' }, { id: 'barco', label: 'Barco' }, { id: 'unclassified', label: 'Sin clasificar' }]

export function normalize(value = '') {
  return value.toString().trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
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

export function catalogPayload(input, uid) {
  const reference = input.reference?.trim()
  const description = input.description?.trim()
  if (!reference || !description) throw new Error('Referencia y descripción son obligatorias.')
  const price = Number(input.price)
  const discount = Number(input.discount || 0)
  if (!Number.isFinite(price) || price < 0 || !Number.isFinite(discount) || discount < 0 || discount > 100) throw new Error('Revisa el precio y el descuento.')
  return {
    reference, referenceNormalized: normalize(reference), description, descriptionNormalized: normalize(description),
    searchPrefixes: searchPrefixes(reference, description), price, currency: 'EUR', discount,
    vehicleType: input.vehicleType || 'unclassified', categoryId: input.categoryId || null, subcategoryId: input.subcategoryId || null,
    status: input.status || 'active', updatedAt: serverTimestamp(), updatedBy: uid,
  }
}

export async function getCatalogPage({ vehicleType, categoryId, subcategoryId, term, cursor, admin = false } = {}) {
  requireFirebase()
  const constraints = []
  if (!admin) constraints.push(where('status', '==', 'active'))
  else if (admin.status) constraints.push(where('status', '==', admin.status))
  if (vehicleType && vehicleType !== 'all') constraints.push(where('vehicleType', '==', vehicleType))
  if (categoryId) constraints.push(where('categoryId', '==', categoryId))
  if (subcategoryId) constraints.push(where('subcategoryId', '==', subcategoryId))
  const normalizedTerm = normalize(term).split(' ').at(-1)
  if (normalizedTerm?.length >= 2) constraints.push(where('searchPrefixes', 'array-contains', normalizedTerm))
  constraints.push(orderBy('referenceNormalized'), limit(PAGE_SIZE + 1))
  if (cursor) constraints.push(startAfter(cursor))
  const snapshot = await getDocs(query(collection(db, 'catalog'), ...constraints))
  const docs = snapshot.docs.slice(0, PAGE_SIZE)
  return { items: docs.map((entry) => ({ id: entry.id, ...entry.data() })), nextCursor: snapshot.docs.length > PAGE_SIZE ? docs.at(-1) : null }
}

export async function getCatalogCount(filters = {}) {
  requireFirebase()
  const constraints = [where('status', '==', filters.status || 'active')]
  if (filters.vehicleType && filters.vehicleType !== 'all') constraints.push(where('vehicleType', '==', filters.vehicleType))
  if (filters.categoryId) constraints.push(where('categoryId', '==', filters.categoryId))
  return (await getCountFromServer(query(collection(db, 'catalog'), ...constraints))).data().count
}

export async function saveCatalogItem(id, input, uid) {
  requireFirebase()
  const payload = catalogPayload(input, uid)
  if (id) { await updateDoc(doc(db, 'catalog', id), payload); return id }
  const target = doc(db, 'catalog', payload.referenceNormalized)
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
  return addDoc(collection(db, 'taxonomies'), { ...payload, createdAt: serverTimestamp() })
}
export async function setTaxonomyActive(id, active, uid) { requireFirebase(); return updateDoc(doc(db, 'taxonomies', id), { active, updatedAt: serverTimestamp(), updatedBy: uid }) }
