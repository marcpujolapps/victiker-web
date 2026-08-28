import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onObjectFinalized } from 'firebase-functions/v2/storage'
import * as XLSX from 'xlsx'
import { BihrClient, extractCatalogRows, toBihrCatalogItem } from './bihr.js'

initializeApp()
const db = getFirestore()
const allowedExtensions = new Set(['csv', 'xls', 'xlsx'])

export const startCatalogImport = onCall({ region: 'europe-west1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Inicia sesión para importar.')
  const admin = await db.doc(`admins/${request.auth.uid}`).get()
  if (!admin.exists || admin.data().active !== true) throw new HttpsError('permission-denied', 'No tienes permisos de administración.')
  const fileName = String(request.data?.fileName || '')
  const extension = fileName.split('.').pop()?.toLowerCase()
  if (!allowedExtensions.has(extension)) throw new HttpsError('invalid-argument', 'El archivo debe ser CSV, XLS o XLSX.')
  const job = await db.collection('importJobs').add({
    status: 'awaiting_upload', fileName, createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp(),
    processed: 0, created: 0, updated: 0, rejected: 0,
  })
  return { importId: job.id, path: `catalog-imports/${request.auth.uid}/${job.id}.${extension}` }
})

export const processCatalogImport = onObjectFinalized({
  region: 'europe-west1',
  bucket: 'victiker-taller.firebasestorage.app',
}, async (event) => {
  const object = event.data
  if (!object.name?.startsWith('catalog-imports/')) return
  const importId = object.metadata?.importId
  if (!importId) return
  const job = db.doc(`importJobs/${importId}`)
  const jobSnapshot = await job.get()
  if (!jobSnapshot.exists || ['processing', 'completed'].includes(jobSnapshot.data().status)) return
  await job.update({ status: 'processing', storagePath: object.name, startedAt: FieldValue.serverTimestamp() })
  try {
    const [buffer] = await getStorage().bucket(object.bucket).file(object.name).download()
    const rows = readRows(buffer, object.name)
    const result = await importRows(rows, jobSnapshot.data().createdBy, job)
    await job.update({ status: 'completed', ...result, finishedAt: FieldValue.serverTimestamp() })
  } catch (error) {
    console.error('Catalog import failed', importId, error)
    await job.update({ status: 'failed', error: error.message || 'No se ha podido procesar el archivo.', finishedAt: FieldValue.serverTimestamp() })
  }
})

function readRows(buffer, fileName) {
  // Los CSV exportados en UTF-8 suelen llegar sin BOM; indicar el codepage
  // evita que encabezados como "Descripción" se lean como "DescripciÃ³n".
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false, codepage: 65001 })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  if (!rows.length) throw new Error('El archivo no contiene filas.')
  return rows
}

async function importRows(rows, uid, job) {
  const writer = db.bulkWriter()
  const rejected = []
  let created = 0; let updated = 0; let processed = 0
  for (let offset = 0; offset < rows.length; offset += 250) {
    const valid = rows.slice(offset, offset + 250).flatMap((row, index) => {
      try { return [{ item: toCatalogItem(row, uid) }] } catch (error) { rejected.push({ row: offset + index + 2, message: error.message }); return [] }
    })
    if (!valid.length) {
      await job.update({ processed, created, updated, rejected: rejected.length })
      continue
    }
    const refs = valid.map(({ item }) => db.collection('catalog').doc(item.referenceNormalized))
    const existing = await db.getAll(...refs)
    valid.forEach(({ item }, index) => {
      const target = refs[index]
      if (existing[index].exists) { updated += 1; writer.set(target, item, { merge: true }) }
      else { created += 1; writer.create(target, { ...item, createdAt: FieldValue.serverTimestamp(), createdBy: uid }) }
      processed += 1
    })
    await job.update({ processed, created, updated, rejected: rejected.length })
  }
  await writer.close()
  if (rejected.length) await job.update({ rejectedRows: rejected.slice(0, 500) })
  return { processed, created, updated, rejected: rejected.length, total: rows.length }
}

function toCatalogItem(row, uid) {
  const value = (keys) => keys.map((key) => row[key]).find((entry) => entry !== undefined && String(entry).trim() !== '')
  const reference = String(value(['Referencia', 'reference']) || '').trim()
  const description = String(value(['Descripción', 'Descripcion', 'description']) || reference).trim()
  const rawPrice = value(['Precio', 'price'])
  const rawDiscount = value(['Descuento', 'discount'])
  const price = rawPrice === undefined || String(rawPrice).trim() === '' ? 0 : parseNumber(rawPrice)
  const discount = rawDiscount === undefined || String(rawDiscount).trim() === '' ? 0 : parseNumber(rawDiscount)
  if (!reference) throw new Error('La referencia es obligatoria.')
  if (!Number.isFinite(price) || price < 0) throw new Error('Precio inválido.')
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) throw new Error('Descuento inválido.')
  const vehicleType = normalizeVehicle(value(['TipoVehículo', 'tipoVehiculo', 'vehicleType']))
  const categoryId = normalize(value(['Categoría', 'Categoria', 'categoryId'])) || null
  const subcategoryId = normalize(value(['Subcategoría', 'Subcategoria', 'subcategoryId'])) || null
  return {
    reference, referenceNormalized: normalize(reference), description, descriptionNormalized: normalize(description), searchPrefixes: searchPrefixes(reference, description),
    price, currency: 'EUR', discount, vehicleType, categoryId, subcategoryId, status: 'active', updatedAt: FieldValue.serverTimestamp(), updatedBy: uid,
  }
}
function parseNumber(value) { return Number(String(value).replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')) }
function normalize(value = '') { return String(value).trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() }
function normalizeVehicle(value) { const normalized = normalize(value); return ['moto', 'barco'].includes(normalized) ? normalized : 'unclassified' }
function searchPrefixes(...values) { const prefixes = new Set(); values.map(normalize).filter(Boolean).forEach((value) => value.split(' ').forEach((word) => { for (let size = 2; size <= Math.min(word.length, 32); size += 1) prefixes.add(word.slice(0, size)) })); return [...prefixes] }

async function assertAdmin(uid) {
  if (!uid) throw new HttpsError('unauthenticated', 'Inicia sesión para sincronizar Bihr.')
  const admin = await db.doc(`admins/${uid}`).get()
  if (!admin.exists || admin.data().active !== true) throw new HttpsError('permission-denied', 'No tienes permisos de administración.')
}

async function startBihrJob(trigger, uid = null) {
  const job = db.collection('bihrSyncJobs').doc()
  const integration = db.doc('integrations/bihr')
  const startedAt = Timestamp.now()
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(integration)
    const data = current.data()
    const runningSince = data?.startedAt?.toMillis?.() || 0
    if (data?.status === 'running' && runningSince > Date.now() - 45 * 60 * 1000) throw new Error('BIHR_SYNC_RUNNING')
    transaction.set(integration, { status: 'running', jobId: job.id, trigger, startedAt, startedBy: uid }, { merge: true })
    transaction.create(job, { status: 'downloading', trigger, createdAt: startedAt, startedAt, createdBy: uid, processed: 0, archived: 0, images: 0 })
  })
  return { job, integration }
}

async function writeBihrRows(rows, syncId, job) {
  const categories = new Map()
  let processed = 0
  let rejected = 0
  let images = 0

  for (let offset = 0; offset < rows.length; offset += 400) {
    const writer = db.bulkWriter()
    const writes = []
    for (const row of rows.slice(offset, offset + 400)) {
      try {
        const item = toBihrCatalogItem(row, { syncId, serverTimestamp: FieldValue.serverTimestamp() })
        if (item.imageUrl) images += 1
        if (item.categoryId && item.sourceCategory) categories.set(item.categoryId, item.sourceCategory)
        const documentId = item.referenceNormalized || `bihr-${Buffer.from(item.reference).toString('base64url')}`
        writes.push(writer.set(db.collection('catalog').doc(documentId), item, { merge: true }))
        processed += 1
      } catch {
        rejected += 1
      }
    }
    await Promise.all(writes)
    await writer.close()
    await job.update({ status: 'processing', processed, rejected, images, total: rows.length })
  }

  const taxonomyWriter = db.bulkWriter()
  const taxonomyWrites = [...categories].map(([id, name]) => taxonomyWriter.set(db.collection('taxonomies').doc(id), {
    name, vehicleType: 'moto', parentId: null, active: true, source: 'bihr', updatedAt: FieldValue.serverTimestamp(), updatedBy: 'bihr-sync',
  }, { merge: true }))
  await Promise.all(taxonomyWrites)
  await taxonomyWriter.close()
  return { processed, rejected, images, categories: categories.size }
}

async function archiveMissingBihrRows(syncId, job) {
  let lastDocument = null
  let archived = 0
  while (true) {
    let catalogQuery = db.collection('catalog').where('source', '==', 'bihr').orderBy(FieldPath.documentId()).limit(500)
    if (lastDocument) catalogQuery = catalogQuery.startAfter(lastDocument)
    const snapshot = await catalogQuery.get()
    if (snapshot.empty) break
    const writer = db.bulkWriter()
    const writes = snapshot.docs.flatMap((entry) => entry.data().bihr?.syncId === syncId ? [] : [writer.update(entry.ref, {
      status: 'archived', updatedAt: FieldValue.serverTimestamp(), updatedBy: 'bihr-sync', 'bihr.available': false,
    })])
    archived += writes.length
    if (writes.length) {
      await Promise.all(writes)
      await writer.close()
    }
    await job.update({ archived })
    lastDocument = snapshot.docs.at(-1)
  }
  return archived
}

async function executeBihrSync({ trigger, uid = null }) {
  let refs
  try {
    refs = await startBihrJob(trigger, uid)
  } catch (error) {
    if (error.message === 'BIHR_SYNC_RUNNING') throw new Error('Ya hay una sincronización de Bihr en curso.')
    throw error
  }

  const { job, integration } = refs
  try {
    const username = process.env.BIHR_USERNAME
    const password = process.env.BIHR_PASSWORD
    if (!username || !password) throw new Error('Faltan BIHR_USERNAME y BIHR_PASSWORD en functions/.env.')
    const client = new BihrClient({ username, password })
    const archive = await client.downloadEssentialHardPartCatalog()
    const rows = extractCatalogRows(archive)
    if (!rows.length) throw new Error('El catálogo de Bihr está vacío.')
    await job.update({ status: 'processing', total: rows.length, downloadedAt: FieldValue.serverTimestamp() })
    const result = await writeBihrRows(rows, job.id, job)
    const archived = await archiveMissingBihrRows(job.id, job)
    const completed = { status: 'completed', ...result, archived, finishedAt: FieldValue.serverTimestamp() }
    await job.update(completed)
    await integration.set({ ...completed, jobId: job.id, lastSuccessfulJobId: job.id, lastSuccessfulSyncAt: FieldValue.serverTimestamp() }, { merge: true })
    return { jobId: job.id, ...result, archived }
  } catch (error) {
    console.error('Bihr catalog sync failed', job.id, error)
    const failure = { status: 'failed', error: error.message || 'No se ha podido sincronizar Bihr.', finishedAt: FieldValue.serverTimestamp() }
    await Promise.all([job.update(failure), integration.set({ ...failure, jobId: job.id }, { merge: true })])
    throw error
  }
}

export const startBihrCatalogSync = onCall({
  region: 'europe-west1', timeoutSeconds: 1800, memory: '1GiB', maxInstances: 1,
}, async (request) => {
  await assertAdmin(request.auth?.uid)
  try { return await executeBihrSync({ trigger: 'manual', uid: request.auth.uid }) }
  catch (error) { throw new HttpsError(error.message.includes('en curso') ? 'already-exists' : 'internal', error.message) }
})

export const syncBihrCatalogDaily = onSchedule({
  region: 'europe-west1', schedule: '30 5 * * *', timeZone: 'Europe/Madrid', timeoutSeconds: 1800, memory: '1GiB', maxInstances: 1,
}, async () => executeBihrSync({ trigger: 'scheduled' }))
