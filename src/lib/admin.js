import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, doc, getDoc, onSnapshot, orderBy, query } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { ref, uploadBytesResumable } from 'firebase/storage'
import { auth, db, functions, requireFirebase, storage } from './firebase'

export function watchAdmin(callback) {
  requireFirebase()
  return onAuthStateChanged(auth, async (user) => {
    if (!user) return callback({ user: null, isAdmin: false })
    const role = await getDoc(doc(db, 'admins', user.uid))
    callback({ user, isAdmin: role.exists() && role.data().active === true })
  })
}
export async function login(email, password) { requireFirebase(); return signInWithEmailAndPassword(auth, email, password) }
export async function logout() { requireFirebase(); return signOut(auth) }
export async function startImport(file, onProgress = () => {}) {
  requireFirebase()
  const extension = file.name.split('.').pop().toLowerCase()
  if (!['csv', 'xls', 'xlsx'].includes(extension)) throw new Error('Selecciona un CSV, XLS o XLSX.')
  const create = httpsCallable(functions, 'startCatalogImport')
  const response = await create({ fileName: file.name, contentType: file.type || 'application/octet-stream' })
  const { importId, path } = response.data
  const upload = uploadBytesResumable(ref(storage, path), file, { contentType: file.type, customMetadata: { importId } })
  return new Promise((resolve, reject) => upload.on('state_changed', (snap) => onProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)), reject, () => resolve({ importId, progress: 100 })))
}
export function watchImportJobs(callback) { requireFirebase(); return onSnapshot(query(collection(db, 'importJobs'), orderBy('createdAt', 'desc')), (snapshot) => callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })))) }
