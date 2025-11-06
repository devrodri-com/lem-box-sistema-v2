// src/app/admin/clientes/[id]/page.tsx
"use client";
import RequireAuth from "@/components/RequireAuth";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Client, Inbound, Box } from "@/types/lem";
import { auth } from "@/lib/firebase";
import { getIdTokenResult } from "firebase/auth";

const COUNTRIES: string[] = [
  'Uruguay','Argentina','United States'
];

const STATES_BY_COUNTRY: Record<string, string[]> = {
  Uruguay: [
    'Artigas','Canelones','Cerro Largo','Colonia','Durazno','Flores','Florida','Lavalleja','Maldonado','Montevideo','Paysandú','Río Negro','Rivera','Rocha','Salto','San José','Soriano','Tacuarembó','Treinta y Tres'
  ],
  'United States': [
    'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'
  ]
};

const DOC_TYPES: string[] = ["Cédula", "DNI", "Pasaporte", "RUT", "Otro"];

export default function ClientDetailPage() {
  return (
    <RequireAuth requireAdmin>
      <PageInner />
    </RequireAuth>
  );
}

function PageInner() {
  const params = useParams();
  const id = params?.id as string;
  const [client, setClient] = useState<Client | null>(null);
  const [form, setForm] = useState<Partial<Client> & { state?: string; city?: string }>({});
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"datos" | "trackings" | "cajas">("datos");
  const [inbounds, setInbounds] = useState<Inbound[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [boxDetailOpen, setBoxDetailOpen] = useState(false);
  const [detailBox, setDetailBox] = useState<Box | null>(null);
  type DetailItem = { id: string; tracking: string; weightLb: number; photoUrl?: string };
  const [detailItems, setDetailItems] = useState<DetailItem[]>([]);

  const boxByInbound = useMemo(() => {
    const map: Record<string, Box> = {};
    for (const b of boxes) {
      for (const iid of (b.itemIds || [])) map[iid] = b;
    }
    return map;
  }, [boxes]);

  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [pw1, setPw1] = useState<string>("");
  const [pw2, setPw2] = useState<string>("");
  const [pwSaving, setPwSaving] = useState<boolean>(false);
  const [pwMsg, setPwMsg] = useState<string>("");

  // Unified styles
  const inputCls = "h-11 border border-slate-300 rounded-md px-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#005f40]";
  const labelCls = "text-xs font-medium text-neutral-600";
  const cardCls = "rounded-lg border bg-white p-4";

  // Button utility classes
  const btnPrimaryCls = "inline-flex items-center justify-center h-11 px-5 rounded-md bg-[#eb6619] text-white font-medium shadow-md hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
  const btnSecondaryCls = "inline-flex items-center justify-center h-11 px-5 rounded-md border border-slate-300 bg-white text-slate-800 font-medium shadow-sm hover:bg-slate-50 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed";
  const tabBtn = (active: boolean) =>
    `px-3 h-9 text-sm font-semibold rounded-full ${active ? 'bg-[#005f40] !text-white font-bold shadow' : 'text-slate-800 hover:bg-white'}`;

  // cargar cliente y movimientos
  useEffect(() => {
    if (!id) return;
    (async () => {
      const snap = await getDoc(doc(db, "clients", id));
      const data = snap.data() as (Omit<Client, "id"> | undefined);
      if (data) {
        const c: Client = { id: snap.id, ...data };
        setClient(c);
        setForm(c);
      }
      // Inbounds: try with index; fallback w/o orderBy and sort in-memory
      try {
        const qIn = query(
          collection(db, "inboundPackages"),
          where("clientId", "==", id),
          orderBy("receivedAt", "desc")
        );
        const inSn = await getDocs(qIn);
        setInbounds(
          inSn.docs.map((docSnap) => {
            const d = docSnap.data() as Omit<Inbound, "id">;
            return { id: docSnap.id, ...d } as Inbound;
          })
        );
      } catch {
        const qIn2 = query(
          collection(db, "inboundPackages"),
          where("clientId", "==", id)
        );
        const inSn2 = await getDocs(qIn2);
        const list = inSn2.docs.map((s) => ({ id: s.id, ...(s.data() as Omit<Inbound, "id">) })) as Inbound[];
        list.sort((a, b) => (Number(b.receivedAt || 0) - Number(a.receivedAt || 0)));
        setInbounds(list);
      }

      // Boxes: try with index; fallback w/o orderBy and sort in-memory
      try {
        const qBox = query(
          collection(db, "boxes"),
          where("clientId", "==", id),
          orderBy("createdAt", "desc")
        );
        const bxSn = await getDocs(qBox);
        setBoxes(
          bxSn.docs.map((docSnap) => {
            const d = docSnap.data() as Omit<Box, "id">;
            return { id: docSnap.id, ...d } as Box;
          })
        );
      } catch {
        const qBox2 = query(
          collection(db, "boxes"),
          where("clientId", "==", id)
        );
        const bxSn2 = await getDocs(qBox2);
        const listB = bxSn2.docs.map((s) => ({ id: s.id, ...(s.data() as Omit<Box, "id">) })) as Box[];
        listB.sort((a, b) => (Number(b.createdAt || 0) - Number(a.createdAt || 0)));
        setBoxes(listB);
      }
    })();
  }, [id]);

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) { setIsSuperAdmin(false); return; }
    getIdTokenResult(u).then(r => {
      const claims = r.claims as Record<string, unknown>;
      const ok = claims["role"] === "superadmin" || claims["superadmin"] === true || claims["admin"] === true;
      setIsSuperAdmin(Boolean(ok));
    }).catch(() => setIsSuperAdmin(false));
  }, []);

  const canSave = useMemo(() => !!form?.name && !!form?.code && !!form?.country, [form]);

  const canSetPassword = useMemo(() => isSuperAdmin && pw1.length >= 8 && pw1 === pw2, [isSuperAdmin, pw1, pw2]);

  async function save() {
    if (!client || !canSave) return;
    setSaving(true);
    try {
      const payload: Partial<Client> & { state?: string; city?: string } = {
        code: form.code!,
        name: form.name!,
        email: form.email || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
        country: form.country!,
        state: form.state || undefined,
        city: form.city || undefined,
        contact: (form as any).contact || undefined,
        docType: (form as any).docType || undefined,
        docNumber: (form as any).docNumber || undefined,
        postalCode: (form as any).postalCode || undefined,
        emailAlt: (form as any).emailAlt || undefined,
        activo: form.activo !== false,
      };
      const sanitized = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined)) as Partial<Client>;
      await updateDoc(doc(db, "clients", String(client.id)), sanitized as any);
      setClient({ ...(client as Client), ...(payload as Partial<Client>) });
    } finally {
      setSaving(false);
    }
  }

  async function setNewPassword() {
    if (!client || !canSetPassword) return;
    setPwSaving(true);
    setPwMsg("");
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/update-client-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ clientId: client.id, newPassword: pw1 })
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      setPwMsg("Contraseña actualizada");
      setPw1("");
      setPw2("");
    } catch (e: any) {
      setPwMsg(`Error: ${e?.message || e}`);
    } finally {
      setPwSaving(false);
    }
  }

  async function openBoxDetailByBoxId(boxId: string) {
    const b = boxes.find(x => x.id === boxId);
    if (!b) return;
    setDetailBox(b);
    setBoxDetailOpen(true);
    try {
      const items: DetailItem[] = [];
      for (const iid of (b.itemIds || [])) {
        const s = await getDoc(doc(db, "inboundPackages", iid));
        if (s.exists()) {
          const d = s.data() as any;
          items.push({ id: s.id, tracking: d.tracking, weightLb: d.weightLb || 0, photoUrl: d.photoUrl });
        }
      }
      setDetailItems(items);
    } catch {
      setDetailItems([]);
    }
  }

  if (!client) {
    return (
      <main className="p-4 md:p-8">
        <p className="text-sm text-neutral-500">Cargando cliente…</p>
      </main>
    );
  }

  return (
    <main className="p-4 md:p-8 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/admin/clientes" className={btnSecondaryCls} aria-label="Volver a clientes">← Volver</Link>
          <h1 className="text-2xl font-semibold">Cliente: {client.code} — {client.name}</h1>
        </div>
        <div>
          <div className="inline-flex items-center gap-1 rounded-full bg-neutral-100 p-1 ring-1 ring-slate-200">
            <button onClick={() => setTab("datos")} className={tabBtn(tab === "datos")}>
              Datos personales
            </button>
            <button onClick={() => setTab("trackings")} className={tabBtn(tab === "trackings")}>
              Trackings
            </button>
            <button onClick={() => setTab("cajas")} className={tabBtn(tab === "cajas")}>
              Cajas
            </button>
          </div>
        </div>
      </header>

      {tab === "datos" ? (
        <section className={cardCls}>
          <form
            onSubmit={(e) => { e.preventDefault(); save(); }}
            className="grid gap-4 md:grid-cols-20"
          >
            {/* Fila 1: Código 20% · Nombre 40% · Contacto/Referencia 40% */}
            <label className="grid gap-1 md:col-span-4">
              <span className={labelCls}>Código</span>
              <input className={`${inputCls} bg-neutral-100 text-neutral-600`} value={form.code || ""} readOnly aria-readonly="true" />
            </label>
            <label className="grid gap-1 md:col-span-8">
              <span className={labelCls}>Nombre</span>
              <input className={inputCls} value={form.name || ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <label className="grid gap-1 md:col-span-8">
              <span className={labelCls}>Contacto / Referente</span>
              <input className={inputCls} value={(form as any).contact || ""} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} />
            </label>

            {/* Fila 2: Tipo doc 20% · Nº doc 40% (el resto queda libre para futuro) */}
            <label className="grid gap-1 md:col-span-4">
              <span className={labelCls}>Tipo de documento</span>
              <select
                className={inputCls}
                value={(form as any).docType || ""}
                onChange={(e) => setForm((f) => ({ ...f, docType: e.target.value }))}
              >
                <option value="" disabled>Seleccionar…</option>
                {DOC_TYPES.map(t => (<option key={t} value={t}>{t}</option>))}
              </select>
            </label>
            <label className="grid gap-1 md:col-span-8">
              <span className={labelCls}>Número de documento</span>
              <input className={inputCls} value={(form as any).docNumber || ""} onChange={(e) => setForm((f) => ({ ...f, docNumber: e.target.value }))} />
            </label>
            <div className="md:col-span-8" />

            {/* Fila 3: País 30% · Estado 30% · Ciudad 40% */}
            <label className="grid gap-1 md:col-span-6">
              <span className={labelCls}>País</span>
              <select
                className={inputCls}
                value={form.country || ""}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value, state: "" }))}
              >
                <option value="" disabled>Seleccionar país…</option>
                {COUNTRIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 md:col-span-6">
              <span className={labelCls}>Estado / Depto / Provincia</span>
              <select
                className={inputCls}
                value={form.state || ''}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                disabled={!form.country || !STATES_BY_COUNTRY[form.country as string]}
              >
                <option value="" disabled>Seleccionar…</option>
                {(STATES_BY_COUNTRY[form.country as string] || []).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 md:col-span-8">
              <span className={labelCls}>Ciudad</span>
              <input
                className={inputCls}
                value={form.city || ''}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </label>

            {/* Fila 4: Dirección 80% · Código postal 20% */}
            <label className="grid gap-1 md:col-span-16">
              <span className={labelCls}>Dirección</span>
              <input className={inputCls} value={form.address || ""} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </label>
            <label className="grid gap-1 md:col-span-4">
              <span className={labelCls}>Código postal</span>
              <input className={inputCls} value={(form as any).postalCode || ""} onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))} />
            </label>

            {/* Fila 5: Teléfono 30% · Email 35% · Email adicional 35% */}
            <label className="grid gap-1 md:col-span-6">
              <span className={labelCls}>Teléfono</span>
              <input className={inputCls} value={form.phone || ""} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </label>
            <label className="grid gap-1 md:col-span-7">
              <span className={labelCls}>Email</span>
              <input className={inputCls} value={form.email || ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </label>
            <label className="grid gap-1 md:col-span-7">
              <span className={labelCls}>Email adicional</span>
              <input className={inputCls} value={(form as any).emailAlt || ""} onChange={(e) => setForm((f) => ({ ...f, emailAlt: e.target.value }))} />
            </label>

            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.activo !== false} onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))} />
              <span className="text-sm">Activo</span>
            </label>

            <div className="md:col-span-20 flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => client && setForm(client)} className={btnSecondaryCls}>Cancelar</button>
              <button type="submit" disabled={!canSave || saving} className={btnPrimaryCls}>
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </form>

          {isSuperAdmin ? (
            <div className="mt-6 rounded-md border p-4 grid gap-3 md:max-w-xl">
              <h3 className="font-medium">Administración · Resetear contraseña</h3>
              <p className="text-xs text-neutral-600">Solo super admin. Mínimo 8 caracteres. Esto cambia la contraseña del usuario del cliente.</p>
              <label className="grid gap-1">
                <span className={labelCls}>Nueva contraseña</span>
                <input type="password" className={inputCls} value={pw1} onChange={(e)=> setPw1(e.target.value)} />
              </label>
              <label className="grid gap-1">
                <span className={labelCls}>Repetir contraseña</span>
                <input type="password" className={inputCls} value={pw2} onChange={(e)=> setPw2(e.target.value)} />
              </label>
              <div className="flex items-center gap-3">
                <button onClick={setNewPassword} disabled={!canSetPassword || pwSaving} className={btnPrimaryCls}>
                  {pwSaving ? "Actualizando…" : "Actualizar contraseña"}
                </button>
                <span className="text-xs text-neutral-500">{pwMsg}</span>
              </div>
            </div>
          ) : null}
        </section>
      ) : tab === "trackings" ? (
        <section className="space-y-6">
          <div>
            <h2 className="font-medium mb-2">Trackings del cliente</h2>
            <div className="overflow-x-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="text-left p-2">Fecha de llegada</th>
                    <th className="text-left p-2">Tracking</th>
                    <th className="text-left p-2">Peso</th>
                    <th className="text-left p-2">Estado</th>
                    <th className="text-left p-2">Caja</th>
                    <th className="text-left p-2">Factura</th>
                    <th className="text-left p-2">Warehouse</th>
                  </tr>
                </thead>
                <tbody>
                  {inbounds.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2">{r.receivedAt ? new Date(r.receivedAt).toLocaleDateString() : '-'}</td>
                      <td className="p-2 font-mono">{r.tracking}</td>
                      <td className="p-2">{Number(r.weightLb || 0).toFixed(2)} lb / {Number(r.weightKg || 0).toFixed(2)} kg</td>
                      <td className="p-2">{r.status === 'boxed' ? 'consolidado' : r.status === 'received' ? 'recibido' : r.status}</td>
                      <td className="p-2">
                        {r.id ? (boxByInbound[r.id as string]?.code || '-') : '-'}
                      </td>
                      <td className="p-2">{r.invoiceUrl ? '✔︎' : '-'}</td>
                      <td className="p-2">
                        {r.photoUrl ? (
                          <a
                            href={r.photoUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Ver foto"
                            aria-label="Ver foto"
                            className="underline"
                          >
                            📷
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                  {!inbounds.length ? (
                    <tr><td className="p-3 text-neutral-500" colSpan={7}>Sin paquetes aún.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "cajas" ? (
        <section className="space-y-6">
          <div>
            <h2 className="font-medium mb-2">Cajas del cliente</h2>
            <div className="overflow-x-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="text-left p-2">Código</th>
                    <th className="text-left p-2">Estado</th>
                    <th className="text-left p-2">Items</th>
                    <th className="text-left p-2">Creada</th>
                  </tr>
                </thead>
                <tbody>
                  {boxes.map((b) => (
                    <tr key={b.id} className="border-t">
                      <td className="p-2">
                        <button
                          className="underline"
                          title="Ver caja"
                          onClick={() => { if (b.id) openBoxDetailByBoxId(b.id as string); }}
                        >
                          {b.code}
                        </button>
                      </td>
                      <td className="p-2">{b.status}</td>
                      <td className="p-2">{b.itemIds?.length || 0}</td>
                      <td className="p-2">{b.createdAt ? new Date(b.createdAt).toLocaleDateString() : '-'}</td>
                    </tr>
                  ))}
                  {!boxes.length ? (
                    <tr><td className="p-3 text-neutral-500" colSpan={4}>Sin cajas aún.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {boxDetailOpen && detailBox ? (
            <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center">
              <div className="bg-white w-[95vw] max-w-3xl rounded-lg shadow-xl p-4 md:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Caja {detailBox.code}</h3>
                  <button className={btnSecondaryCls} onClick={() => { setBoxDetailOpen(false); setDetailBox(null); }}>Cerrar</button>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="text-left p-2">Tracking</th>
                      <th className="text-left p-2">Peso</th>
                      <th className="text-left p-2">Foto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailItems.map(i => (
                      <tr key={i.id} className="border-t">
                        <td className="p-2 font-mono">{i.tracking}</td>
                        <td className="p-2">{(Number(i.weightLb||0)).toFixed(2)} lb</td>
                        <td className="p-2">{i.photoUrl ? (<a href={i.photoUrl} target="_blank" aria-label="Ver foto">📷</a>) : ('—')}</td>
                      </tr>
                    ))}
                    {!detailItems.length ? (<tr><td className="p-3 text-neutral-500" colSpan={3}>Caja vacía.</td></tr>) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}