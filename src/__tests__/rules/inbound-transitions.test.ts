import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupEnv } from './helpers';
import { doc, setDoc, updateDoc, getDoc } from 'firebase/firestore';

let env: Awaited<ReturnType<typeof setupEnv>>;
const BASE = {
  tracking: '1Z-ABC',
  carrier: 'UPS',
  clientId: 'C1',
  weightLb: 2,
  status: 'received' as const,
  receivedAt: Date.now(),
  boxedAt: null as number | null,
};

describe('inboundPackages transitions', () => {
  beforeAll(async () => {
    env = await setupEnv();
    const admin = env.authenticatedContext('admin-1', { token: { role: 'admin', clientId: 'ADMIN' } });
    const db = admin.firestore();
    await setDoc(doc(db, 'inboundPackages/INB-T1'), { ...BASE });
  });

  afterAll(async () => { if (env) await env.cleanup(); });

  it('received → boxed permitido (con boxedAt)', async () => {
    const admin = env.authenticatedContext('admin-1', { token: { role: 'admin', clientId: 'ADMIN' } });
    const db = admin.firestore();

    // Enviamos TODOS los campos esperados por las reglas, + boxedAt nuevo
    await expect(updateDoc(doc(db, 'inboundPackages/INB-T1'), {
      tracking: BASE.tracking,
      carrier: BASE.carrier,
      clientId: BASE.clientId,
      weightLb: BASE.weightLb,
      receivedAt: BASE.receivedAt,
      status: 'boxed',
      boxedAt: Date.now(),
    })).resolves.toBeUndefined();

    const snap = await getDoc(doc(db, 'inboundPackages/INB-T1'));
    expect(snap.data()?.status).toBe('boxed');
    expect(snap.data()?.boxedAt).not.toBeNull();
  });

  it('boxed → received prohibido', async () => {
    const admin = env.authenticatedContext('admin-1', { token: { role: 'admin', clientId: 'ADMIN' } });
    const db = admin.firestore();
    const current = (await getDoc(doc(db, 'inboundPackages/INB-T1'))).data()!;

    await expect(updateDoc(doc(db, 'inboundPackages/INB-T1'), {
      tracking: current.tracking,
      carrier: current.carrier,
      clientId: current.clientId,
      weightLb: current.weightLb,
      receivedAt: current.receivedAt,
      status: 'received',
      boxedAt: current.boxedAt, // mantenerlo para no romper validación
    })).rejects.toThrowError();
  });

  it('boxed → void requiere voidReason', async () => {
    const admin = env.authenticatedContext('admin-1', { token: { role: 'admin', clientId: 'ADMIN' } });
    const db = admin.firestore();
    const current = (await getDoc(doc(db, 'inboundPackages/INB-T1'))).data()!;

    // sin voidReason → debe fallar
    await expect(updateDoc(doc(db, 'inboundPackages/INB-T1'), {
      tracking: current.tracking,
      carrier: current.carrier,
      clientId: current.clientId,
      weightLb: current.weightLb,
      receivedAt: current.receivedAt,
      status: 'void',
      boxedAt: current.boxedAt,
    })).rejects.toThrowError();

    // con voidReason → debe pasar
    await expect(updateDoc(doc(db, 'inboundPackages/INB-T1'), {
      tracking: current.tracking,
      carrier: current.carrier,
      clientId: current.clientId,
      weightLb: current.weightLb,
      receivedAt: current.receivedAt,
      status: 'void',
      boxedAt: current.boxedAt,
      voidReason: 'damaged',
    })).resolves.toBeUndefined();
  });
});