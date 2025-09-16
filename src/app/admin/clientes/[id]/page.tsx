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

export default function ClientDetailPage() {
  return (
    <RequireAuth>
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
  const [tab, setTab] = useState<"datos" | "trackings">("datos");
  const [inbounds, setInbounds] = useState<Inbound[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);

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

  const canSave = useMemo(() => !!form?.name && !!form?.code && !!form?.country, [form]);

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
        activo: form.activo !== false,
      };
      await updateDoc(doc(db, "clients", String(client.id)), payload);
      setClient({ ...(client as Client), ...(payload as Partial<Client>) });
    } finally {
      setSaving(false);
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
          <Link href="/admin/clientes" className="px-3 py-2 text-sm rounded border" aria-label="Volver a clientes">← Volver</Link>
          <h1 className="text-2xl font-semibold">Cliente: {client.code} — {client.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab("datos")}
            className={`px-3 py-2 text-sm rounded border ${tab === "datos" ? "bg-black text-white" : ""}`}
          >
            Datos personales
          </button>
          <button
            onClick={() => setTab("trackings")}
            className={`px-3 py-2 text-sm rounded border ${tab === "trackings" ? "bg-black text-white" : ""}`}
          >
            Trackings
          </button>
        </div>
      </header>

      {tab === "datos" ? (
        <section className="grid gap-3 md:max-w-2xl">
          <label className="grid gap-1">
            <span className="text-xs text-neutral-500">Código</span>
            <input className="border rounded p-3 bg-neutral-100 text-neutral-600" value={form.code || ""} readOnly aria-readonly="true" />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-neutral-500">Nombre</span>
            <input className="border rounded p-3" value={form.name || ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-neutral-500">Email</span>
            <input className="border rounded p-3" value={form.email || ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-neutral-500">Teléfono</span>
            <input className="border rounded p-3" value={form.phone || ""} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-neutral-500">Dirección</span>
            <input className="border rounded p-3" value={form.address || ""} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-neutral-500">País</span>
            <select
              className="border rounded p-3"
              value={form.country || ""}
              onChange={(e) => setForm((f) => ({ ...f, country: e.target.value, state: "" }))}
            >
              <option value="" disabled>Seleccionar país…</option>
              {COUNTRIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>

          {/* Estado/Depto/Provincia */}
          <label className="grid gap-1">
            <span className="text-xs text-neutral-500">Estado / Depto / Provincia</span>
            <select
              className="border rounded p-3"
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

          {/* Ciudad */}
          <label className="grid gap-1">
            <span className="text-xs text-neutral-500">Ciudad</span>
            <input
              className="border rounded p-3"
              value={form.city || ''}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.activo !== false} onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))} />
            <span className="text-sm">Activo</span>
          </label>
          <div className="flex gap-2">
            <button onClick={save} disabled={!canSave || saving} className="px-4 py-2 rounded bg-black text-white disabled:opacity-50">
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </section>
      ) : (
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
                      <td className="p-2">{r.status}</td>
                      <td className="p-2">{r.invoiceUrl ? '✔︎' : '-'}</td>
                      <td className="p-2">{r.photoUrl ? '🖼️' : '-'}</td>
                    </tr>
                  ))}
                  {!inbounds.length ? (
                    <tr><td className="p-3 text-neutral-500" colSpan={6}>Sin paquetes aún.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

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
                      <td className="p-2">{b.code}</td>
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
        </section>
      )}
    </main>
  );
}