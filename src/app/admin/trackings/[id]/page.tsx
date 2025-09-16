// src/app/admin/trackings/[id]/page.tsx

"use client";
import RequireAuth from "@/components/RequireAuth";
import { db } from "@/lib/firebase";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import type { Client, Carrier } from "@/types/lem";

const LB_TO_KG = 0.45359237;
const CARRIERS: Carrier[] = ["UPS","FedEx","USPS","DHL","Amazon","Other"];

// Shape of a tracking (inbound package)
interface Inbound {
  id?: string;
  tracking: string;
  carrier: Carrier;
  clientId: string;
  weightLb: number;
  status: "received" | "boxed" | "void";
  photoUrl?: string;
  invoiceUrl?: string;
  receivedAt?: number;
}

export default function TrackingDetailPage() {
  return (
    <RequireAuth>
      <PageInner />
    </RequireAuth>
  );
}

function PageInner() {
  const params = useParams();
  const id = params?.id as string;

  const [clients, setClients] = useState<Client[]>([]);
  const [row, setRow] = useState<Inbound | null>(null);
  const [saving, setSaving] = useState(false);

  const clientsById = useMemo(() => {
    const m: Record<string, Client> = {};
    for (const c of clients) if (c.id) m[c.id] = c;
    return m;
  }, [clients]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [cs, is] = await Promise.all([
        getDocs(query(collection(db, "clients"), orderBy("createdAt", "desc"))),
        getDoc(doc(db, "inboundPackages", String(id))),
      ]);
      setClients(cs.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Client, "id">) })));
      if (is.exists()) {
        const d = is.data() as Omit<Inbound, "id">;
        setRow({ id, ...d });
      }
    })();
  }, [id]);

  const [form, setForm] = useState<Partial<Inbound>>({});
  useEffect(() => {
    if (row) setForm(row);
  }, [row]);

  const kg = useMemo(() => Number(((Number(form.weightLb) || 0) * LB_TO_KG).toFixed(2)), [form.weightLb]);
  const clientLabel = row?.clientId && clientsById[row.clientId] ? `${clientsById[row.clientId].code} — ${clientsById[row.clientId].name}` : "-";

  async function save() {
    if (!row?.id) return;
    setSaving(true);
    try {
      const payload: Partial<Inbound> = {
        clientId: form.clientId || row.clientId,
        weightLb: Number(form.weightLb) || 0,
        carrier: (form.carrier as Carrier) || row.carrier,
        status: (form.status as Inbound["status"]) || row.status,
      };
      await updateDoc(doc(db, "inboundPackages", String(row.id)), payload);
      setRow({ ...row, ...payload });
    } finally {
      setSaving(false);
    }
  }

  if (!row) {
    return (
      <main className="p-4 md:p-8">
        <p className="text-sm text-neutral-500">Cargando tracking…</p>
      </main>
    );
  }

  return (
    <main className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/admin/historial-tracking" className="px-3 py-2 text-sm rounded border">← Volver</Link>
          <h1 className="text-2xl font-semibold">Tracking: {row.tracking}</h1>
        </div>
      </div>

      <section className="grid gap-3 md:max-w-3xl md:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-xs text-neutral-500">ID</span>
          <input className="border rounded p-3 bg-neutral-100 text-neutral-600" value={row.id || ""} readOnly />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-neutral-500">Carrier</span>
          <select
            className="border rounded p-3"
            value={form.carrier || row.carrier}
            onChange={(e) => setForm((f) => ({ ...f, carrier: e.target.value as Carrier }))}
          >
            {CARRIERS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 md:col-span-2">
          <span className="text-xs text-neutral-500">Cliente actual</span>
          <input className="border rounded p-3 bg-neutral-100 text-neutral-600" value={clientLabel} readOnly />
        </label>

        <label className="grid gap-1">
          <span className="text-xs text-neutral-500">Reasignar a cliente</span>
          <select
            className="border rounded p-3"
            value={form.clientId || row.clientId}
            onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{`${c.code} — ${c.name}`}</option>
            ))}
          </select>
        </label>

        <label className="grid gap-1">
          <span className="text-xs text-neutral-500">Peso (lb)</span>
          <input
            className="border rounded p-3"
            inputMode="decimal"
            value={typeof form.weightLb === "number" ? String(form.weightLb) : String(row.weightLb || 0)}
            onChange={(e) => setForm((f) => ({ ...f, weightLb: Number(e.target.value || 0) }))}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-neutral-500">Peso (kg)</span>
          <input
            className="border rounded p-3"
            inputMode="decimal"
            value={kg}
            onChange={(e) => {
              const v = Number(e.target.value || 0);
              const lb = Number((v / LB_TO_KG).toFixed(2));
              setForm((f) => ({ ...f, weightLb: lb }));
            }}
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs text-neutral-500">Estado</span>
          <select
            className="border rounded p-3"
            value={form.status || row.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Inbound["status"] }))}
          >
            <option value="received">received</option>
            <option value="boxed">boxed</option>
            <option value="void">void</option>
          </select>
        </label>

        <label className="grid gap-1">
          <span className="text-xs text-neutral-500">Fecha de llegada</span>
          <input className="border rounded p-3 bg-neutral-100 text-neutral-600" value={row.receivedAt ? new Date(row.receivedAt).toLocaleString() : "-"} readOnly />
        </label>

        <div className="md:col-span-2 flex items-center gap-3 pt-2">
          {row.photoUrl ? (
            <a className="px-3 py-2 rounded border" href={row.photoUrl} target="_blank">Ver foto</a>
          ) : (
            <span className="text-sm text-neutral-500">Sin foto adjunta</span>
          )}
          {row.invoiceUrl ? (
            <a className="px-3 py-2 rounded border" href={row.invoiceUrl} target="_blank">Ver factura</a>
          ) : null}
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded bg-black text-white disabled:opacity-50">
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </section>
    </main>
  );
}