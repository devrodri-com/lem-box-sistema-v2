import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEnv } from './helpers'
import { doc, setDoc, getDoc } from 'firebase/firestore'

let env: Awaited<ReturnType<typeof setupEnv>>

describe('Firestore rules (multi-tenant por role/clientId)', () => {
  beforeAll(async () => {
    env = await setupEnv()

    // Seed de usuarios en la colección /users para que las reglas lean role/clientId desde userDoc()
    const adminCtx = env.authenticatedContext('admin-1', { token: { role: 'admin', clientId: 'ADMIN' } })
    const dbAdmin = adminCtx.firestore()
    await setDoc(doc(dbAdmin, 'users/admin-1'), { uid: 'admin-1', role: 'admin', clientId: 'ADMIN' })

    const userACtx = env.authenticatedContext('user-a', { token: { role: null, clientId: 'C1', email: 'a@lem-box.com' } })
    const dbA = userACtx.firestore()
    await setDoc(doc(dbA, 'users/user-a'), { uid: 'user-a', role: null, clientId: 'C1' })

    const userBCtx = env.authenticatedContext('user-b', { token: { role: null, clientId: 'C2', email: 'b@lem-box.com' } })
    const dbB = userBCtx.firestore()
    await setDoc(doc(dbB, 'users/user-b'), { uid: 'user-b', role: null, clientId: 'C2' })

    // Seed de un inboundPackage para C1 (pertenece al cliente C1)
    await setDoc(doc(dbAdmin, 'inboundPackages/INB1'), {
      tracking: '1Z-ABC',
      carrier: 'UPS',
      clientId: 'C1',
      weightLb: 5,
      status: 'received',
      receivedAt: Date.now()
    })
  })

  afterAll(async () => {
    if (env) await env.cleanup()
  })

  it('cliente C2 NO puede leer inbound de cliente C1', async () => {
    const ctx = env.authenticatedContext('user-b', { token: { clientId: 'C2' } })
    const db = ctx.firestore()
    await expect(getDoc(doc(db, 'inboundPackages/INB1'))).rejects.toThrowError()
  })

  it('admin SÍ puede leer inbound de cualquier cliente', async () => {
    const ctx = env.authenticatedContext('admin-1', { token: { role: 'admin', clientId: 'ADMIN' } })
    const db = ctx.firestore()
    const snap = await getDoc(doc(db, 'inboundPackages/INB1'))
    expect(snap.exists()).toBe(true)
  })
})