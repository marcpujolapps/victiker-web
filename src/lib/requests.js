import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { db, requireFirebase } from './firebase'

export async function createRequest(payload) {
  requireFirebase()
  return addDoc(collection(db, 'requests'), { ...payload, status: 'new', notes: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
}

export function watchRequests(type, callback) {
  requireFirebase()
  return onSnapshot(query(collection(db, 'requests'), where('type', '==', type), orderBy('createdAt', 'desc')), (snapshot) => callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))), (error) => callback([], error))
}

export async function updateRequest(id, changes) {
  requireFirebase()
  return updateDoc(doc(db, 'requests', id), { ...changes, updatedAt: serverTimestamp() })
}
