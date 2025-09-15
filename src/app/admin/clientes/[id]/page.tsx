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
import type { Client, Inbound, Box } from "@/types/lem";

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
  const [form, setForm] = useState<Partial<Client>>({});
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"datos" | "movimientos">("datos");
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
      // movimientos
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
    })();
  }, [id]);

  const canSave = useMemo(() => !!form?.name && !!form?.code && !!form?.country, [form]);

  async function save() {
    if (!client || !canSave) return;
    setSaving(true);
    try {
      const payload: Partial<Client> = {
        code: form.code!,
        name: form.name!,
        email: form.email || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
        country: form.country!,
        activo: form.activo !== false,
      };
      await updateDoc(doc(db, "clients", client.id), payload as Partial<Client>);
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
        <h1 className="text-2xl font-semibold">Cliente: {client.code} — {client.name}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab("datos")}
            className={`px-3 py-2 text-sm rounded border ${tab === "datos" ? "bg-black text-white" : ""}`}
          >
            Datos personales
          </button>
          <button
            onClick={() => setTab("movimientos")}
            className={`px-3 py-2 text-sm rounded border ${tab === "movimientos" ? "bg-black text-white" : ""}`}
          >
            Movimientos
          </button>
        </div>
      </header>

      {tab === "datos" ? (
        <section className="grid gap-3 md:max-w-2xl">
          <label className="grid gap-1">
            <span className="text-xs text-neutral-500">Código</span>
            <input className="border rounded p-3" value={form.code || ""} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
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
            <select className="border rounded p-3" value={form.country || "US"} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value as "US" | "UY" | "AR" }))}>
              <option value="US">US</option>
              <option value="UY">UY</option>
              <option value="AR">AR</option>
            </select>
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
        <section className="grid md:grid-cols-2 gap-6">
          <div>
            <h2 className="font-medium mb-2">Paquetes recibidos</h2>
            <div className="grid gap-2">
              {inbounds.map((r) => (
                <div key={r.id} className="border rounded p-3 text-sm flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {r.photoUrl ? <img src={r.photoUrl} alt="" className="w-12 h-12 object-cover rounded" /> : <div className="w-12 h-12 bg-neutral-100 rounded" />}
                  <div className="flex-1">
                    <div>#{r.tracking} · {r.carrier} · {r.weightLb} lb</div>
                    <div className="text-xs text-neutral-500">{new Date(r.receivedAt).toLocaleString()} · estado: {r.status}</div>
                  </div>
                </div>
              ))}
              {!inbounds.length ? <div className="text-xs text-neutral-500">Sin paquetes aún.</div> : null}
            </div>
          </div>
          <div>
            <h2 className="font-medium mb-2">Cajas del cliente</h2>
            <div className="grid gap-2">
              {boxes.map((b) => (
                <div key={b.id} className="border rounded p-3 text-sm">
                  <div><b>{b.code}</b> · estado: {b.status} · items: {b.itemIds?.length || 0}</div>
                  <div className="text-xs text-neutral-500">Creada: {b.createdAt ? new Date(b.createdAt).toLocaleDateString() : "-"}</div>
                </div>
              ))}
              {!boxes.length ? <div className="text-xs text-neutral-500">Sin cajas aún.</div> : null}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}