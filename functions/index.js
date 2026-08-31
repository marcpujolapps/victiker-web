import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onObjectFinalized } from 'firebase-functions/v2/storage'
import { gzipSync, gunzipSync } from 'node:zlib'
import { BihrClient, bihrProductWrites, buildBihrSyncPlan, canArchiveBihrPlan, extractCatalogRows, runWithConcurrency } from './bihr.js'
import { parseCatalogNumber, readCatalogRows } from './catalog-csv.js'

initializeApp()
const db = getFirestore()
const allowedExtensions = new Set(['csv'])
const BIHR_MANIFEST_PATH = 'bihr-sync/manifests/essential-hard-part-v1.json.gz'
const MIN_BIHR_CATALOG_ROWS = 1000
const MAX_BIHR_REMOVAL_RATIO = 0.2
const BIHR_WRITE_PAGE_SIZE = 250
const BIHR_WRITE_CONCURRENCY = 4
const BIHR_ARCHIVE_CONCURRENCY = 2
const BIHR_INITIAL_WRITE_ATTEMPTS = 5
const BIHR_JOB_LEASE_MS = 35 * 60 * 1000

export const startCatalogImport = onCall({ region: 'europe-west1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Inicia sesión para importar.')
  const admin = await db.doc(`admins/${request.auth.uid}`).get()
  if (!admin.exists || admin.data().active !== true) throw new HttpsError('permission-denied', 'No tienes permisos de administración.')
  const fileName = String(request.data?.fileName || '')
  const extension = fileName.split('.').pop()?.toLowerCase()
  if (!allowedExtensions.has(extension)) throw new HttpsError('invalid-argument', 'El archivo debe ser CSV.')
  const job = await db.collection('importJobs').add({
    status: 'awaiting_upload', fileName, catalogType: 'barco', createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp(),
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
    const rows = readCatalogRows(buffer)
    const result = await importRows(rows, jobSnapshot.data().createdBy, job, { vehicleType: 'barco' })
    await job.update({ status: 'completed', ...result, finishedAt: FieldValue.serverTimestamp() })
  } catch (error) {
    console.error('Catalog import failed', importId, error)
    await job.update({ status: 'failed', error: error.message || 'No se ha podido procesar el archivo.', finishedAt: FieldValue.serverTimestamp() })
  }
})

async function importRows(rows, uid, job, { vehicleType = 'barco' } = {}) {
  // CSV files often arrive ordered by reference. Keep BulkWriter throttled so
  // sequential document IDs do not create a short Firestore hotspot.
  const writer = db.bulkWriter({ throttling: { initialOpsPerSecond: 50, maxOpsPerSecond: 100 } })
  const rejected = []
  const taxonomies = new Map()
  let created = 0; let updated = 0; let processed = 0
  for (let offset = 0; offset < rows.length; offset += 250) {
    const valid = rows.slice(offset, offset + 250).flatMap((row, index) => {
      try { return [{ item: toCatalogItem(row, uid, vehicleType) }] } catch (error) { rejected.push({ row: offset + index + 2, message: error.message }); return [] }
    })
    if (!valid.length) {
      await job.update({ processed, created, updated, rejected: rejected.length })
      continue
    }
    const refs = valid.map(({ item }) => db.collection('catalog').doc(item.referenceNormalized))
    const existing = await db.getAll(...refs)
    valid.forEach(({ item }, index) => {
      collectManualTaxonomies(taxonomies, item)
      const target = refs[index]
      if (existing[index].exists) { updated += 1; writer.set(target, item, { merge: true }) }
      else { created += 1; writer.create(target, { ...item, createdAt: FieldValue.serverTimestamp(), createdBy: uid }) }
      processed += 1
    })
    await job.update({ processed, created, updated, rejected: rejected.length })
  }
  await writer.close()
  await writeManualTaxonomies(taxonomies, uid)
  if (rejected.length) await job.update({ rejectedRows: rejected.slice(0, 500) })
  return { processed, created, updated, rejected: rejected.length, total: rows.length, taxonomies: taxonomies.size }
}

function toCatalogItem(row, uid, vehicleType) {
  const value = (keys) => keys.map((key) => row[key]).find((entry) => entry !== undefined && String(entry).trim() !== '')
  const reference = String(value(['Referencia', 'reference']) || '').trim()
  const description = String(value(['Descripción', 'Descripcion', 'description']) || reference).trim()
  const rawPrice = value(['Precio', 'price'])
  const rawDiscount = value(['Descuento', 'discount'])
  const price = rawPrice === undefined || String(rawPrice).trim() === '' ? 0 : parseCatalogNumber(rawPrice)
  const discount = rawDiscount === undefined || String(rawDiscount).trim() === '' ? 0 : parseCatalogNumber(rawDiscount)
  if (!reference) throw new Error('La referencia es obligatoria.')
  if (!Number.isFinite(price) || price < 0) throw new Error('Precio inválido.')
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) throw new Error('Descuento inválido.')
  const categoryName = String(value(['Categoría', 'Categoria', 'categoryId']) || '').trim()
  const subcategoryName = String(value(['Subcategoría', 'Subcategoria', 'subcategoryId']) || '').trim()
  const categorySlug = normalize(categoryName).replaceAll(' ', '-')
  const subcategorySlug = normalize(subcategoryName).replaceAll(' ', '-')
  const categoryId = categorySlug ? `${vehicleType}-${categorySlug}` : null
  const subcategoryId = categoryId && subcategorySlug ? `${categoryId}-${subcategorySlug}` : null
  return {
    reference, referenceNormalized: normalize(reference), description, descriptionNormalized: normalize(description), searchPrefixes: searchPrefixes(reference, description),
    price, currency: 'EUR', discount, vehicleType, categoryId, subcategoryId, categoryName: categoryName || null, subcategoryName: subcategoryName || null,
    status: 'active', source: 'manual-csv', updatedAt: FieldValue.serverTimestamp(), updatedBy: uid,
  }
}
function normalize(value = '') { return String(value).trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() }
function searchPrefixes(...values) { const prefixes = new Set(); values.map(normalize).filter(Boolean).forEach((value) => value.split(' ').forEach((word) => { for (let size = 2; size <= Math.min(word.length, 32); size += 1) prefixes.add(word.slice(0, size)) })); return [...prefixes] }

function collectManualTaxonomies(taxonomies, item) {
  if (item.categoryId && item.categoryName) taxonomies.set(item.categoryId, { name: item.categoryName, vehicleType: item.vehicleType, parentId: null })
  if (item.subcategoryId && item.subcategoryName) taxonomies.set(item.subcategoryId, { name: item.subcategoryName, vehicleType: item.vehicleType, parentId: item.categoryId })
}

async function writeManualTaxonomies(taxonomies, uid) {
  const entries = [...taxonomies]
  for (let offset = 0; offset < entries.length; offset += BIHR_WRITE_PAGE_SIZE) {
    const batch = db.batch()
    entries.slice(offset, offset + BIHR_WRITE_PAGE_SIZE).forEach(([id, entry]) => batch.set(db.collection('taxonomies').doc(id), {
      ...entry, active: true, source: 'manual-csv', updatedAt: FieldValue.serverTimestamp(), updatedBy: uid,
    }, { merge: true }))
    await batch.commit()
  }
}

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
    if (data?.status === 'running' && runningSince > Date.now() - BIHR_JOB_LEASE_MS) throw new Error('BIHR_SYNC_RUNNING')
    if (data?.status === 'running' && data.jobId) transaction.set(db.doc(`bihrSyncJobs/${data.jobId}`), {
      status: 'failed', error: 'La ejecución anterior se interrumpió y se ha liberado automáticamente.', finishedAt: startedAt,
    }, { merge: true })
    transaction.set(integration, { status: 'running', jobId: job.id, trigger, startedAt, startedBy: uid }, { merge: true })
    transaction.create(job, { status: 'downloading', trigger, createdAt: startedAt, startedAt, createdBy: uid, processed: 0, archived: 0, images: 0 })
  })
  return { job, integration }
}

async function readBihrManifest(bucket) {
  const file = bucket.file(BIHR_MANIFEST_PATH)
  const [exists] = await file.exists()
  if (!exists) return null
  const [compressed] = await file.download()
  const manifest = JSON.parse(gunzipSync(compressed).toString('utf8'))
  if (manifest.schemaVersion !== 1 || manifest.catalog !== 'EssentialHardPart' || !manifest.products) throw new Error('La manifest de Bihr no tiene un formato válido.')
  return manifest
}

async function saveBihrManifest(bucket, manifest) {
  await bucket.file(BIHR_MANIFEST_PATH).save(gzipSync(JSON.stringify(manifest)), {
    resumable: false,
    contentType: 'application/gzip',
    metadata: { cacheControl: 'no-store', metadata: { schemaVersion: String(manifest.schemaVersion), catalog: manifest.catalog } },
  })
}

async function findLegacyBihrProducts(currentProducts) {
  // One-time migration only: a manifest did not exist before this deployment.
  // Subsequent runs use the manifest and do not read catalog documents.
  let lastDocument = null
  const absent = []
  while (true) {
    let catalogQuery = db.collection('catalog').where('source', '==', 'bihr').orderBy(FieldPath.documentId()).limit(500)
    if (lastDocument) catalogQuery = catalogQuery.startAfter(lastDocument)
    const snapshot = await catalogQuery.get()
    if (snapshot.empty) break
    snapshot.docs.forEach((entry) => {
      if (!currentProducts[entry.id]) absent.push({ documentId: entry.id })
    })
    lastDocument = snapshot.docs.at(-1)
  }
  return absent
}

function assertValidBihrPlan(plan, previousManifest) {
  if (plan.rejected) throw new Error(`El catálogo de Bihr contiene ${plan.rejected} filas no válidas; no se ha aplicado ningún cambio.`)
  if (plan.products.length < MIN_BIHR_CATALOG_ROWS) throw new Error(`El catálogo de Bihr parece incompleto (${plan.products.length} referencias).`)
  const previousCount = Object.keys(previousManifest?.products || {}).length
  if (!canArchiveBihrPlan(plan, previousManifest, { minRows: MIN_BIHR_CATALOG_ROWS, maxRemovalRatio: MAX_BIHR_REMOVAL_RATIO })) {
    throw new Error(`El catálogo de Bihr eliminaría ${plan.removedProducts.length} de ${previousCount} referencias; se ha detenido por seguridad.`)
  }
}

async function writeBihrPlan(plan, { job, forceFull, initialManifest }) {
  const toWrite = bihrProductWrites(plan, { forceFull, initialManifest })
  // Taxonomies stay a small first phase. Product pages then run in a bounded
  // pool: fast enough for a full bootstrap without saturating Firestore.
  const taxonomyWrites = await writeBihrTaxonomies(plan)
  let writes = 0
  let reportedWrites = 0
  let progressUpdates = Promise.resolve()
  const pages = chunk(toWrite, BIHR_WRITE_PAGE_SIZE)
  await job.update({
    status: 'processing', writes: 0, writesTotal: toWrite.length, writeConcurrency: BIHR_WRITE_CONCURRENCY,
    processed: plan.products.length, new: plan.newProducts.length, modified: plan.modifiedProducts.length, unchanged: plan.unchangedProducts.length,
  })
  await runWithConcurrency(pages, BIHR_WRITE_CONCURRENCY, async (page) => {
    await commitBihrWritePage(page)
    writes += page.length
    if (writes - reportedWrites >= BIHR_WRITE_PAGE_SIZE * BIHR_WRITE_CONCURRENCY || writes === toWrite.length) {
      const currentWrites = writes
      reportedWrites = currentWrites
      progressUpdates = progressUpdates.then(() => job.update({ writes: currentWrites }))
    }
  })
  await progressUpdates

  return { writes, taxonomyWrites }
}

async function writeBihrTaxonomies(plan) {
  let taxonomyWrites = 0
  const pages = chunk(plan.changedTaxonomies, BIHR_WRITE_PAGE_SIZE)
  await runWithConcurrency(pages, Math.min(2, BIHR_WRITE_CONCURRENCY), async (page) => {
    await commitBihrTaxonomyPage(page)
    taxonomyWrites += page.length
  })
  return taxonomyWrites
}

function chunk(items, size) {
  const pages = []
  for (let offset = 0; offset < items.length; offset += size) pages.push(items.slice(offset, offset + size))
  return pages
}

async function commitWithRetry(label, createBatch) {
  let lastError
  for (let attempt = 1; attempt <= BIHR_INITIAL_WRITE_ATTEMPTS; attempt += 1) {
    try {
      await createBatch().commit()
      return
    } catch (error) {
      lastError = error
      const retryable = [4, 8, 10, 13, 14].includes(error.code)
      if (!retryable || attempt === BIHR_INITIAL_WRITE_ATTEMPTS) break
      const delayMs = Math.min(4000, 400 * (2 ** (attempt - 1))) + Math.floor(Math.random() * 250)
      console.warn(`${label}; reintento ${attempt + 1}/${BIHR_INITIAL_WRITE_ATTEMPTS} en ${delayMs} ms`, { code: error.code })
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  throw lastError
}

async function commitBihrWritePage(page) {
  await commitWithRetry('Error escribiendo una página del catálogo Bihr', () => {
    const batch = db.batch()
    page.forEach(({ item, documentId, previous }) => batch.set(
      db.collection('catalog').doc(documentId),
      !previous ? { ...item, createdAt: FieldValue.serverTimestamp(), createdBy: 'bihr-sync' } : item,
      { merge: true },
    ))
    return batch
  })
}

async function commitBihrTaxonomyPage(page) {
  await commitWithRetry('Error escribiendo taxonomías Bihr', () => {
    const batch = db.batch()
    page.forEach(([id, entry]) => batch.set(db.collection('taxonomies').doc(id), {
      name: entry.name, vehicleType: 'moto', parentId: null, active: true, source: 'bihr', updatedAt: FieldValue.serverTimestamp(), updatedBy: 'bihr-sync',
    }, { merge: true }))
    return batch
  })
}

async function archiveBihrProducts(products, job) {
  let archived = 0
  let progressUpdates = Promise.resolve()
  const pages = chunk(products, BIHR_WRITE_PAGE_SIZE)
  await runWithConcurrency(pages, BIHR_ARCHIVE_CONCURRENCY, async (page) => {
    await commitBihrArchivePage(page)
    archived += page.length
    const currentArchived = archived
    progressUpdates = progressUpdates.then(() => job.update({ archived: currentArchived }))
  })
  await progressUpdates
  return archived
}

async function commitBihrArchivePage(page) {
  await commitWithRetry('Error archivando referencias Bihr', () => {
    const batch = db.batch()
    page.forEach(({ documentId }) => batch.update(db.collection('catalog').doc(documentId), {
      status: 'archived', updatedAt: FieldValue.serverTimestamp(), updatedBy: 'bihr-sync', 'bihr.available': false,
    }))
    return batch
  })
}

async function executeBihrSync({ trigger, uid = null, forceFull = false }) {
  let refs
  try {
    refs = await startBihrJob(trigger, uid)
  } catch (error) {
    if (error.message === 'BIHR_SYNC_RUNNING') throw new Error('Ya hay una sincronización de Bihr en curso.')
    throw error
  }

  const { job, integration } = refs
  const startedAtMs = Date.now()
  try {
    const username = process.env.BIHR_USERNAME
    const password = process.env.BIHR_PASSWORD
    if (!username || !password) throw new Error('Faltan BIHR_USERNAME y BIHR_PASSWORD en functions/.env.')
    const client = new BihrClient({ username, password })
    const archive = await client.downloadEssentialHardPartCatalog()
    const rows = extractCatalogRows(archive)
    if (!rows.length) throw new Error('El catálogo de Bihr está vacío.')
    const bucket = getStorage().bucket()
    const previousManifest = await readBihrManifest(bucket)
    const plan = buildBihrSyncPlan(rows, { syncId: job.id, manifest: previousManifest, serverTimestamp: FieldValue.serverTimestamp() })
    assertValidBihrPlan(plan, previousManifest)
    // Scanning Firestore is deliberately limited to the one-time manifest migration.
    const removedProducts = previousManifest ? plan.removedProducts : await findLegacyBihrProducts(plan.manifest.products)
    await job.update({ status: 'processing', total: rows.length, downloaded: plan.products.length, images: plan.images, forceFull, initialManifest: !previousManifest, downloadedAt: FieldValue.serverTimestamp() })
    const writeResult = await writeBihrPlan(plan, { job, forceFull, initialManifest: !previousManifest })
    const archived = await archiveBihrProducts(removedProducts, job)
    const manifest = { ...plan.manifest, generatedAt: new Date().toISOString(), lastSuccessfulJobId: job.id }
    // The last side effect: failed writes can never replace the valid snapshot.
    await saveBihrManifest(bucket, manifest)
    const result = { processed: plan.products.length, downloaded: plan.products.length, new: plan.newProducts.length, modified: plan.modifiedProducts.length, unchanged: plan.unchangedProducts.length, deleted: removedProducts.length, images: plan.images, rejected: plan.rejected, categories: Object.keys(plan.taxonomy).length, ...writeResult }
    const completed = { status: 'completed', ...result, archived, durationMs: Date.now() - startedAtMs, finishedAt: FieldValue.serverTimestamp() }
    await job.update(completed)
    await integration.set({ ...completed, jobId: job.id, lastSuccessfulJobId: job.id, lastSuccessfulSyncAt: FieldValue.serverTimestamp() }, { merge: true })
    return { jobId: job.id, ...result, archived }
  } catch (error) {
    console.error('Bihr catalog sync failed', job.id, error)
    const failure = { status: 'failed', error: error.message || 'No se ha podido sincronizar Bihr.', durationMs: Date.now() - startedAtMs, finishedAt: FieldValue.serverTimestamp() }
    await Promise.all([job.update(failure), integration.set({ ...failure, jobId: job.id }, { merge: true })])
    throw error
  }
}

export const startBihrCatalogSync = onCall({
  region: 'europe-west1', timeoutSeconds: 1800, memory: '1GiB', maxInstances: 1, concurrency: 1,
}, async (request) => {
  await assertAdmin(request.auth?.uid)
  try { return await executeBihrSync({ trigger: 'manual', uid: request.auth.uid, forceFull: request.data?.forceFull === true }) }
  catch (error) { throw new HttpsError(error.message.includes('en curso') ? 'already-exists' : 'internal', error.message) }
})

// Preserve the deployed function identity: changing the cron updates the
// existing scheduler instead of briefly creating a second scheduled job.
export const syncBihrCatalogDaily = onSchedule({
  region: 'europe-west1', schedule: '30 5 * * 1', timeZone: 'Europe/Madrid', timeoutSeconds: 1800, memory: '1GiB', maxInstances: 1, concurrency: 1,
}, async () => executeBihrSync({ trigger: 'scheduled' }))
