import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage'
import { db, requireFirebase, storage } from './firebase'
import { MAX_SOURCE_IMAGE_BYTES, optimizeCatalogImage, validateCatalogImage } from './catalogImages'
import { sortOffers, validateOffer, validateOfferOrder } from './offerValidation.js'

export { DEFAULT_OFFER_COLORS, OFFER_LIMITS, offerColors, safeOfferLink, sortOffers, validateOffer, validateOfferOrder } from './offerValidation.js'
export { MAX_SOURCE_IMAGE_BYTES }
export const MAX_OFFER_IMAGE_BYTES = 900 * 1024
export const validateOfferImage = validateCatalogImage
export const optimizeOfferImage = optimizeCatalogImage

function requireUid(uid) {
  if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(uid)) throw new Error('Inicia sesión de nuevo para guardar la oferta.')
}

export function watchOffers(callback, { admin = false } = {}) {
  requireFirebase()
  const offers = collection(db, 'offers')
  const source = admin ? offers : query(offers, where('active', '==', true))
  return onSnapshot(source,
    (snapshot) => callback(sortOffers(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })))),
    (error) => callback([], error))
}

export async function saveOffer(id, input, uid) {
  requireFirebase()
  requireUid(uid)
  const payload = { ...validateOffer(input), updatedAt: serverTimestamp(), updatedBy: uid }
  if (id) {
    await updateDoc(doc(db, 'offers', id), payload)
    return id
  }
  const target = doc(collection(db, 'offers'))
  await setDoc(target, { ...payload, createdAt: serverTimestamp(), createdBy: uid })
  return target.id
}

export async function setOfferActive(id, active, uid) {
  requireFirebase()
  requireUid(uid)
  if (typeof active !== 'boolean') throw new Error('Selecciona si la oferta está visible.')
  return updateDoc(doc(db, 'offers', id), { active, updatedAt: serverTimestamp(), updatedBy: uid })
}

export async function reorderOffers(orderedIds, uid) {
  requireFirebase()
  requireUid(uid)
  validateOfferOrder(orderedIds)
  const batch = writeBatch(db)
  orderedIds.forEach((id, order) => batch.update(doc(db, 'offers', id), { order, updatedAt: serverTimestamp(), updatedBy: uid }))
  return batch.commit()
}

export async function removeOffer(id) {
  requireFirebase()
  return deleteDoc(doc(db, 'offers', id))
}

export async function uploadOfferImage(blob, uid, onProgress = () => {}) {
  requireFirebase()
  requireUid(uid)
  if (blob?.type !== 'image/webp' || !blob.size || blob.size > MAX_OFFER_IMAGE_BYTES) throw new Error('Optimiza la imagen antes de subirla; debe ser WebP y ocupar como máximo 900 KB.')
  const path = `offer-images/${uid}/${crypto.randomUUID()}.webp`
  const imageRef = ref(storage, path)
  const task = uploadBytesResumable(imageRef, blob, { contentType: 'image/webp', cacheControl: 'public,max-age=31536000,immutable' })
  await new Promise((resolve, reject) => task.on('state_changed',
    (snapshot) => onProgress(Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100)), reject, resolve))
  try { return { path, url: await getDownloadURL(imageRef) } }
  catch (error) { await deleteObject(imageRef).catch(() => {}); throw error }
}

export async function removeOfferImage(path) {
  requireFirebase()
  if (/^offer-images\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9-]+\.webp$/u.test(path || '')) await deleteObject(ref(storage, path))
}
