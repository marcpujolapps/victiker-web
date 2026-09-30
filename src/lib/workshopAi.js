import { httpsCallable } from 'firebase/functions'
import { functions, requireFirebase } from './firebase'

export async function consultWorkshopAi(issue) {
  requireFirebase()
  const consult = httpsCallable(functions, 'consultWorkshopAi', { timeout: 40000 })
  const { data } = await consult({ issue })
  return data
}
