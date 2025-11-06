import { getAuth } from 'firebase/auth'

export const getCurrentUid = () => {
  const auth = getAuth()
  return auth.currentUser?.uid ?? null
}