import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupEnv } from './helpers';
import { doc, setDoc, getDoc } from 'firebase/firestore';

let env: Awaited<ReturnType<typeof setupEnv>>;

describe('shipments read by clientIds', () => {
    beforeAll(async () => {
        env = await setupEnv();
      
        // Si querés mantener el token/admin para otras operaciones:
        const admin = env.authenticatedContext('admin-1', { token: { role: 'admin', admin: true, clientId: 'ADMIN' } });
        const db = admin.firestore();
      
        // Seed sin reglas (recomendado por @firebase/rules-unit-testing)
        await env.withSecurityRulesDisabled(async (ctx) => {
          const adb = ctx.firestore();
      
          // users necesarios para role()/clientId()
          await setDoc(doc(adb, 'users/admin-1'), { uid: 'admin-1', role: 'admin', clientId: 'ADMIN', email: 'admin@lem-box.com' });
          await setDoc(doc(adb, 'users/user-c1'), { uid: 'user-c1', role: null, clientId: 'C1', email: 'c1@lem-box.com' });
          await setDoc(doc(adb, 'users/user-c2'), { uid: 'user-c2', role: null, clientId: 'C2', email: 'c2@lem-box.com' });
      
          // shipment creado sin reglas; luego lo validamos con lecturas que sí pasan por reglas
          await setDoc(doc(adb, 'shipments/S1'), {
            code: 'SHP-1',
            clientIds: ['C1', 'C9'],
            status: 'open',
            boxIds: []
          });
        });
      });

  afterAll(async () => { if (env) await env.cleanup(); });

  it('cliente C1 puede leer', async () => {
    const c1 = env.authenticatedContext('user-c1', { token: { clientId: 'C1' } });
    const snap = await getDoc(doc(c1.firestore(), 'shipments/S1'));
    expect(snap.exists()).toBe(true);
  });

  it('cliente C2 NO puede leer', async () => {
    const c2 = env.authenticatedContext('user-c2', { token: { clientId: 'C2' } });
    await expect(getDoc(doc(c2.firestore(), 'shipments/S1'))).rejects.toThrowError();
  });
});