import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupEnv } from './helpers';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

let env: Awaited<ReturnType<typeof setupEnv>>;

describe('boxes rules', () => {
  beforeAll(async () => { env = await setupEnv(); });
  afterAll(async () => { if (env) await env.cleanup(); });

  it('crear requiere code, clientId, itemIds(list), status válido', async () => {
    const admin = env.authenticatedContext('admin-1', { token: { role: 'admin', clientId: 'ADMIN' } });
    const db = admin.firestore();
    await expect(setDoc(doc(db, 'boxes/B1'), {
      code: 'BX-1',
      clientId: 'C1',
      itemIds: ['PKG-1'],
      status: 'open'
    })).resolves.toBeUndefined();
  });

  it('no permite cambiar clientId en update', async () => {
    const admin = env.authenticatedContext('admin-1', { token: { role: 'admin', clientId: 'ADMIN' } });
    const db = admin.firestore();
    await setDoc(doc(db, 'boxes/B2'), { code: 'BX-2', clientId: 'C1', itemIds: [], status: 'open' });
    await expect(updateDoc(doc(db, 'boxes/B2'), { clientId: 'C2' })).rejects.toThrowError();
  });
});