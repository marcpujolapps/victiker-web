import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, deleteUser, getAuth } from 'firebase/auth'
import { collection, connectFirestoreEmulator, deleteDoc, deleteField, doc, getDoc, getDocs, getFirestore, query, serverTimestamp, setDoc, setLogLevel, terminate, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore'
import { connectStorageEmulator, deleteObject, getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage'
import { validateOffer } from '../src/lib/offerValidation.js'

// Opt in only against local emulators; no credentials or production data are used.
const enabled = process.env.RUN_FIREBASE_EMULATOR_TESTS === '1'
const projectId = 'demo-victiker-offers'
const firestoreOrigin = 'http://127.0.0.1:8080'
const runId = randomUUID()

async function client(label, authenticated = true) {
  const app = initializeApp({ apiKey: 'demo-key', projectId, storageBucket: projectId + '.appspot.com' }, 'offer-rules-' + runId + '-' + label)
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  const db = getFirestore(app)
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  const storage = getStorage(app)
  connectStorageEmulator(storage, '127.0.0.1', 9199)
  storage.maxUploadRetryTime = 3000
  storage.maxOperationRetryTime = 3000
  const user = authenticated ? (await createUserWithEmailAndPassword(auth, label + '-' + runId + '@victiker.test', 'Offer-rules-123!')).user : null
  return { app, auth, db, storage, user }
}

async function adminWrite(path, fields) {
  const response = await fetch(firestoreOrigin + '/v1/projects/' + projectId + '/databases/(default)/documents/' + path, {
    method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
  })
  assert.equal(response.status, 200, await response.text())
}

async function adminDelete(path) {
  const response = await fetch(firestoreOrigin + '/v1/projects/' + projectId + '/databases/(default)/documents/' + path, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } })
  assert.ok(response.ok || response.status === 404)
}

function firestoreDenied(promise) { return assert.rejects(promise, (error) => error.code === 'permission-denied') }
function storageDenied(promise) { return assert.rejects(promise, (error) => error.code === 'storage/unauthorized') }

test('offer Firestore and Storage rules enforce public visibility, admin writes and upload restrictions', { skip: !enabled, timeout: 90_000 }, async (t) => {
  setLogLevel('silent')
  const clients = []
  const ids = ['active', 'draft', 'invalid', 'outsider', 'legacy'].map((name) => 'rules-' + runId + '-' + name)
  let admin
  let imageRef
  try {
    admin = await client('admin'); clients.push(admin)
    const outsider = await client('outsider'); clients.push(outsider)
    const publicClient = await client('public', false); clients.push(publicClient)
    const uid = admin.user.uid
    await adminWrite('admins/' + uid, { active: { booleanValue: true } })
    const offer = (extra = {}) => ({
      ...validateOffer({ title: 'Prueba de reglas', ...extra }),
      createdAt: serverTimestamp(), createdBy: uid, updatedAt: serverTimestamp(), updatedBy: uid,
    })
    const active = doc(admin.db, 'offers', ids[0])
    const draft = doc(admin.db, 'offers', ids[1])
    await setDoc(active, offer())
    await setDoc(draft, offer({ active: false, order: 1 }))

    await t.test('public reads active offers and cannot retrieve drafts or list without active filter', async () => {
      assert.equal((await getDoc(doc(publicClient.db, 'offers', ids[0]))).exists(), true)
      const visible = await getDocs(query(collection(publicClient.db, 'offers'), where('active', '==', true)))
      assert.equal(visible.docs.some((entry) => entry.id === ids[0]), true)
      assert.equal(visible.docs.some((entry) => entry.id === ids[1]), false)
      await firestoreDenied(getDoc(doc(publicClient.db, 'offers', ids[1])))
      await firestoreDenied(getDocs(collection(publicClient.db, 'offers')))
      assert.ok((await getDocs(collection(admin.db, 'offers'))).size >= 2)
    })

    await t.test('unauthenticated and ordinary signed-in users cannot create, edit or delete offers or grant admin roles', async () => {
      for (const current of [publicClient, outsider]) {
        await firestoreDenied(setDoc(doc(current.db, 'offers', ids[3]), offer()))
        await firestoreDenied(updateDoc(doc(current.db, 'offers', ids[0]), { title: 'Sobrescrito', updatedAt: serverTimestamp(), updatedBy: current.user?.uid || '' }))
        await firestoreDenied(deleteDoc(doc(current.db, 'offers', ids[0])))
      }
      await firestoreDenied(setDoc(doc(outsider.db, 'admins', outsider.user.uid), { active: true }))
    })

    await t.test('admin can edit, atomically reorder and change visibility', async () => {
      await updateDoc(active, { title: 'Título editado', updatedAt: serverTimestamp(), updatedBy: uid })
      const batch = writeBatch(admin.db)
      batch.update(active, { order: 1, updatedAt: serverTimestamp(), updatedBy: uid })
      batch.update(draft, { order: 0, updatedAt: serverTimestamp(), updatedBy: uid })
      await batch.commit()
      assert.equal((await getDoc(active)).data().title, 'Título editado')
      assert.equal((await getDoc(active)).data().order, 1)
      await updateDoc(active, { active: false, updatedAt: serverTimestamp(), updatedBy: uid })
      await firestoreDenied(getDoc(doc(publicClient.db, 'offers', ids[0])))
      await updateDoc(active, { active: true, updatedAt: serverTimestamp(), updatedBy: uid })
    })

    await t.test('custom hex colors persist and legacy offers remain editable without migration', async () => {
      const legacy = offer()
      delete legacy.backgroundColor
      delete legacy.textColor
      const target = doc(admin.db, 'offers', ids[4])
      await setDoc(target, legacy)
      await updateDoc(target, { active: false, order: 3, updatedAt: serverTimestamp(), updatedBy: uid })
      assert.equal((await getDoc(target)).data().backgroundColor, undefined)
      await updateDoc(target, { backgroundColor: '#ABCDEF', textColor: '#123456', updatedAt: serverTimestamp(), updatedBy: uid })
      assert.equal((await getDoc(target)).data().backgroundColor, '#ABCDEF')
      assert.equal((await getDoc(target)).data().textColor, '#123456')
    })

    await t.test('create and update validate complete schema, safe links, types, limits and immutable creation metadata', async () => {
      const invalid = doc(admin.db, 'offers', ids[2])
      for (const fields of [
        { title: '' }, { title: 'x'.repeat(121) }, { description: 'x'.repeat(281) },
        { linkLabel: 'x'.repeat(41) }, { linkUrl: 'javascript:alert(1)' }, { linkUrl: 'data:text/html,abc' },
        { linkUrl: '//example.com' }, { linkUrl: '/\\example.com' }, { linkUrl: 'https://example.com/back\\slash' },
        { linkUrl: 'https://example.com/bad space' }, { active: 'true' }, { order: -1 }, { order: 0.5 }, { order: 10000 },
        { unexpected: 'extra' }, { imageUrl: 'https://example.com/image.webp' },
        { imagePath: 'catalog-images/elsewhere/file.webp', imageUrl: 'https://example.com/file.webp' },
        { imagePath: 'offer-images/admin/file.webp', imageUrl: 'data:image/webp,abc' },
        { updatedBy: outsider.user.uid }, { updatedAt: Timestamp.fromMillis(0) },
        { backgroundColor: '#fff' }, { textColor: 'red' }, { backgroundColor: null }, { textColor: 123456 },
      ]) {
        await firestoreDenied(setDoc(invalid, { ...offer(), ...fields }))
        await firestoreDenied(updateDoc(active, { ...fields, ...(Object.hasOwn(fields, 'updatedAt') ? {} : { updatedAt: serverTimestamp() }) }))
      }
      const missingTitle = offer()
      delete missingTitle.title
      await firestoreDenied(setDoc(invalid, missingTitle))
      await firestoreDenied(updateDoc(active, { title: deleteField(), updatedAt: serverTimestamp() }))
      await firestoreDenied(setDoc(invalid, { ...offer(), createdBy: outsider.user.uid }))
      await firestoreDenied(setDoc(invalid, { ...offer(), createdAt: Timestamp.fromMillis(0) }))
      await firestoreDenied(updateDoc(active, { createdBy: outsider.user.uid, updatedAt: serverTimestamp() }))
      await firestoreDenied(updateDoc(active, { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
      assert.equal((await getDoc(active)).data().title, 'Título editado')
    })

    await t.test('image assets require admin, own path, WebP, size limit and immutable object paths', async () => {
      const imagePath = 'offer-images/' + uid + '/' + runId + '.webp'
      imageRef = ref(admin.storage, imagePath)
      const bytes = new Uint8Array([82, 73, 70, 70])
      await uploadBytes(imageRef, bytes, { contentType: 'image/webp' })
      assert.match(await getDownloadURL(ref(publicClient.storage, imagePath)), /^http:/)
      await storageDenied(uploadBytes(imageRef, bytes, { contentType: 'image/webp' }))
      await storageDenied(uploadBytes(ref(outsider.storage, 'offer-images/' + outsider.user.uid + '/' + runId + '.webp'), bytes, { contentType: 'image/webp' }))
      await storageDenied(uploadBytes(ref(publicClient.storage, 'offer-images/public/' + runId + '.webp'), bytes, { contentType: 'image/webp' }))
      await storageDenied(uploadBytes(ref(admin.storage, 'offer-images/' + outsider.user.uid + '/' + runId + '.webp'), bytes, { contentType: 'image/webp' }))
      await storageDenied(uploadBytes(ref(admin.storage, 'offer-images/' + uid + '/wrong-' + runId + '.svg'), bytes, { contentType: 'image/svg+xml' }))
      await storageDenied(uploadBytes(ref(admin.storage, 'offer-images/' + uid + '/type-' + runId + '.webp'), bytes, { contentType: 'image/png' }))
      await storageDenied(uploadBytes(ref(admin.storage, 'offer-images/' + uid + '/large-' + runId + '.webp'), new Uint8Array(900 * 1024 + 1), { contentType: 'image/webp' }))
      await storageDenied(deleteObject(ref(outsider.storage, imagePath)))
      await deleteObject(imageRef)
      imageRef = null
    })

    await t.test('admin can delete an offer', async () => {
      await deleteDoc(draft)
      assert.equal((await getDoc(draft)).exists(), false)
    })
  } finally {
    if (imageRef) await deleteObject(imageRef).catch(() => {})
    for (const id of ids) await adminDelete('offers/' + id)
    if (admin?.user) await adminDelete('admins/' + admin.user.uid)
    for (const current of clients) {
      if (current.user) await deleteUser(current.user).catch(() => {})
      await terminate(current.db)
      await deleteApp(current.app)
    }
  }
})
