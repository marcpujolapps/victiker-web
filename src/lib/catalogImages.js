import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage'
import { requireFirebase, storage } from './firebase'

export const MAX_SOURCE_IMAGE_BYTES = 5_000_000
export const MAX_CATALOG_IMAGE_BYTES = 900 * 1024
const MAX_IMAGE_SIDE = 1600
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function validateCatalogImage(file) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) throw new Error('Selecciona una imagen JPG, PNG o WebP.')
  if (file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error('La imagen original no puede superar los 5 MB.')
  if (!file.size) throw new Error('El archivo de imagen está vacío.')
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se ha podido leer la imagen.')) }
    image.src = url
  })
}

function toWebp(canvas, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (!blob || blob.type !== 'image/webp') reject(new Error('Este navegador no puede optimizar imágenes WebP.'))
    else resolve(blob)
  }, 'image/webp', quality))
}

export async function optimizeCatalogImage(file) {
  validateCatalogImage(file)
  const image = await loadImage(file)
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('La imagen no tiene dimensiones válidas.')
  if (image.naturalWidth * image.naturalHeight > 50_000_000) throw new Error('La imagen tiene demasiados píxeles. Usa una foto más pequeña.')
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight))
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No se ha podido optimizar la imagen.')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const blob = await toWebp(canvas, Math.max(0.48, 0.8 - attempt * 0.07))
    if (blob.size <= MAX_CATALOG_IMAGE_BYTES) return blob
    if (attempt >= 2 && attempt < 7) {
      const smaller = document.createElement('canvas')
      smaller.width = Math.max(1, Math.round(canvas.width * 0.8))
      smaller.height = Math.max(1, Math.round(canvas.height * 0.8))
      smaller.getContext('2d').drawImage(canvas, 0, 0, smaller.width, smaller.height)
      canvas.width = smaller.width
      canvas.height = smaller.height
      context.drawImage(smaller, 0, 0)
    }
  }
  throw new Error('No se ha podido reducir la imagen por debajo de 900 KB. Prueba con otra foto.')
}

export async function uploadCatalogImage(blob, uid, onProgress = () => {}) {
  requireFirebase()
  const path = `catalog-images/${uid}/${crypto.randomUUID()}.webp`
  const imageRef = ref(storage, path)
  const task = uploadBytesResumable(imageRef, blob, { contentType: 'image/webp', cacheControl: 'public,max-age=31536000,immutable' })
  await new Promise((resolve, reject) => task.on('state_changed',
    (snapshot) => onProgress(Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100)), reject, resolve))
  try { return { path, url: await getDownloadURL(imageRef) } }
  catch (error) { await deleteObject(imageRef).catch(() => {}); throw error }
}

export async function removeCatalogImage(path) {
  if (path?.startsWith('catalog-images/')) await deleteObject(ref(storage, path))
}
