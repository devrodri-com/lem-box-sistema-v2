// src/app/admin/preparado/[clientId]/page.tsx
"use client";
import RequireAuth from "@/components/RequireAuth";
import { db } from "@/lib/firebase";
import { collection, doc, getDocs, query, where, addDoc, updateDoc, runTransaction } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Client } from "@/types/lem";

const LB_TO_KG = 0.45359237;

type ShipmentType = "COMERCIAL" | "FRANQUICIA";

type Inbound = {
  id: string;
  tracking: string;
  carrier: string;
  clientId: string;
  weightLb: number;
  status: "received" | "boxed" | "void";
  receivedAt?: number;
  photoUrl?: string;
};

type Box = {
  id: string;
  code: string;
  clientId: string;
  type: ShipmentType;
  country: string;
  itemIds: string[];
  weightLb: number;
  createdAt?: number;
  shipmentId?: string | null;
  status?: "open" | "closed";
};

export default function ConsolidarClientePage() {
  return (
    <RequireAuth>
      <ClienteInner />
    </RequireAuth>
  );
}

function ClienteInner() {
  const params = useParams();
  const router = useRouter();
  const clientId = params?.clientId as string;

  const [client, setClient] = useState<Client | null>(null);
  const [inbounds, setInbounds] = useState<Inbound[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [boxType, setBoxType] = useState<ShipmentType>("COMERCIAL");
  const [boxId, setBoxId] = useState<string>("");

  useEffect(() => {
    if (!clientId) return;
    getDocs(query(collection(db, "clients"), where("__name__", "==", clientId))).then((s) => {
      const d = s.docs[0];
      if (d) setClient({ id: d.id, ...(d.data() as Omit<Client, "id">) });
    });
    getDocs(query(collection(db, "inboundPackages"), where("clientId", "==", clientId))).then((s) => {
      setInbounds(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Inbound, "id">) })));
    });
    getDocs(query(collection(db, "boxes"), where("clientId", "==", clientId))).then((s) => {
      setBoxes(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Box, "id">) })));
    });
  }, [clientId]);

  const boxByInbound = useMemo(() => {
    const m: Record<string, Box> = {};
    for (const b of boxes) {
      for (const id of b.itemIds || []) m[id] = b;
    }
    return m;
  }, [boxes]);

  const visibleInbounds = useMemo(() => {
    return inbounds.filter((r) => {
      if (r.status !== "boxed") return true; // received/void visibles
      const b = boxByInbound[r.id];
      // boxed: solo mostrar si la caja AÚN no está en embarque
      return !b || !b.shipmentId;
    });
  }, [inbounds, boxByInbound]);

  const totalLb = useMemo(() => Object.keys(selected).filter(id => selected[id]).reduce((acc, id) => {
    const r = visibleInbounds.find(x => x.id === id);
    return acc + (Number(r?.weightLb) || 0);
  }, 0), [selected, visibleInbounds]);

  async function createBox() {
    if (!client) return;
    const payload = {
      code: await nextBoxCode(),
      clientId,
      type: boxType,
      country: client.country,
      itemIds: [],
      weightLb: 0,
      status: "open" as const,
      createdAt: Date.now(),
      shipmentId: null,
    } as Omit<Box, "id"> & { status: "open" };
    const ref = await addDoc(collection(db, "boxes"), payload);
    setBoxes([{ id: ref.id, ...(payload as any) }, ...boxes]);
    setBoxId(ref.id);
  }

  async function addSelectedToBox() {
    if (!client || !boxId) return;
    const box = boxes.find(b => b.id === boxId);
    if (!box) return;
    if (box.clientId !== clientId) { alert("La caja elegida pertenece a otro cliente."); return; }
    if (box.type !== boxType) { alert("El tipo de la caja no coincide con el tipo seleccionado."); return; }
    const chosenIds = Object.keys(selected).filter(id => selected[id]);
    if (!chosenIds.length) return;
    const chosen = inbounds.filter(r => chosenIds.includes(r.id));
    const newItems = Array.from(new Set([...(box.itemIds || []), ...chosen.map(r => r.id)]));
    const newWeight = (Number(box.weightLb) || 0) + chosen.reduce((a, r) => a + (Number(r.weightLb) || 0), 0);
    await updateDoc(doc(db, "boxes", box.id), { itemIds: newItems, weightLb: newWeight });
    await Promise.all(chosen.map(r => updateDoc(doc(db, "inboundPackages", r.id), { status: "boxed" })));
    setBoxes(bs => bs.map(b => b.id === box.id ? { ...b, itemIds: newItems, weightLb: newWeight } : b));
    setSelected({});
  }

  return (
    <main className="p-4 md:p-8 space-y-4">
      <div className="flex items-center gap-2">
        <button className="px-3 py-2 rounded border" onClick={() => router.push("/admin/preparado")}>← Volver</button>
        <h1 className="text-xl font-semibold">Consolidar — {client ? `${client.code} — ${client.name}` : "Cargando..."}</h1>
      </div>

      <section className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="text-xs text-neutral-500">Tipo de envío</label>
            <select className="border rounded p-2 w-full" value={boxType} onChange={(e) => setBoxType(e.target.value as ShipmentType)}>
              <option value="COMERCIAL">COMERCIAL</option>
              <option value="FRANQUICIA">FRANQUICIA</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="px-3 py-2 rounded border" onClick={createBox} disabled={!client}>Crear caja</button>
            <select className="border rounded p-2" value={boxId} onChange={(e) => setBoxId(e.target.value)}>
              <option value="">Seleccionar caja…</option>
              {boxes.filter(b => b.type === boxType && !b.shipmentId).map(b => (
                <option key={b.id} value={b.id}>{b.code} · {(b.weightLb*LB_TO_KG).toFixed(2)} kg · {b.itemIds?.length || 0} items</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto border rounded">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="p-2">Sel</th>
                <th className="text-left p-2">Fecha</th>
                <th className="text-left p-2">Tracking</th>
                <th className="text-left p-2">Peso</th>
                <th className="text-left p-2">Caja</th>
                <th className="text-left p-2">Foto</th>
                <th className="text-left p-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibleInbounds.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="p-2"><input type="checkbox" checked={!!selected[r.id]} onChange={(e)=> setSelected(s=>({...s,[r.id]: e.target.checked}))} /></td>
                  <td className="p-2">{r.receivedAt ? new Date(r.receivedAt).toLocaleDateString() : "-"}</td>
                  <td className="p-2 font-mono">{r.tracking}</td>
                  <td className="p-2">{(Number(r.weightLb||0)*LB_TO_KG).toFixed(2)} kg</td>
                  <td className="p-2">{boxByInbound[r.id]?.code || "-"}</td>
                  <td className="p-2">{r.photoUrl ? (<a href={r.photoUrl} target="_blank" title="Ver foto" aria-label="Ver foto">📷</a>) : ("—")}</td>
                  <td className="p-2">{r.status}</td>
                </tr>
              ))}
              {!visibleInbounds.length ? (<tr><td className="p-3 text-neutral-500" colSpan={7}>Sin trackings.</td></tr>) : null}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-sm text-neutral-700">Total seleccionado: {(totalLb*LB_TO_KG).toFixed(2)} kg</div>
          <button className="px-4 py-2 rounded bg-black text-white disabled:opacity-50" onClick={addSelectedToBox} disabled={!boxId || !Object.values(selected).some(Boolean)}>Agregar a caja</button>
        </div>
      </section>
    </main>
  );
}

async function nextBoxCode(): Promise<string> {
  const counterRef = doc(db, 'counters', 'boxes');
  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const data = snap.data() as { seq?: number } | undefined;
    const curr = snap.exists() && typeof data?.seq === 'number' ? data.seq : 0;
    const n = curr + 1;
    tx.set(counterRef, { seq: n }, { merge: true });
    return n;
  });
  return String(next);
}