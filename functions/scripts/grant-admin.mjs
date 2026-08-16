import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { readFile } from 'node:fs/promises'

const [email, serviceAccountPath] = process.argv.slice(2)
if (!email || !serviceAccountPath) throw new Error('Uso: npm run firebase:grant-admin -- correo@empresa.com /ruta/service-account.json')
const serviceAccount = JSON.parse(await readFile(serviceAccountPath, 'utf8'))
if (!getApps().length) initializeApp({ credential: cert(serviceAccount) })
const user = await getAuth().getUserByEmail(email)
await getFirestore().doc(`admins/${user.uid}`).set({ email: user.email, active: true, grantedAt: FieldValue.serverTimestamp(), grantedBy: 'bootstrap-script' }, { merge: true })
console.log(`Administrador habilitado: ${user.email} (${user.uid})`)
