// src/app/admin/preparado/page.tsx
"use client";
import RequireAuth from "@/components/RequireAuth";
import { db } from "@/lib/firebase";
import Script from "next/script";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  orderBy,
  query,
  where,
  addDoc,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import type { Client } from "@/types/lem";
import { useRouter } from "next/navigation";

// Types
type ShipmentType = "COMERCIAL" | "FRANQUICIA";

type Box = {
  id: string;
  code: string; // número de caja
  clientId: string;
  type: ShipmentType; // COMERCIAL | FRANQUICIA
  country: string;
  itemIds: string[]; // inbound ids
  weightLb: number;
  createdAt?: number;
  shipmentId?: string | null; // embarque asignado
};

const LB_TO_KG = 0.45359237;

export default function PreparadoPage() {
  return (
    <RequireAuth>
      <PageInner />
    </RequireAuth>
  );
}

function PageInner() {
  const [tab, setTab] = useState<"consolidar" | "cargas">("consolidar");

  return (
    <main className="p-4 md:p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Preparado de carga</h1>

      <div className="inline-flex rounded border overflow-hidden">
        <button className={`px-4 py-2 ${tab === "consolidar" ? "bg-black text-white" : "bg-white"}`} onClick={() => setTab("consolidar")}>Consolidar</button>
        <button className={`px-4 py-2 ${tab === "cargas" ? "bg-black text-white" : "bg-white"}`} onClick={() => setTab("cargas")}>Cargas</button>
      </div>

      {tab === "consolidar" ? (
        <ConsolidarSearchView />
      ) : (
        <EmbarquesView />
      )}
      <Script
        src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"
        strategy="lazyOnload"
      />
    </main>
  );
}

function ConsolidarSearchView() {
  const [clients, setClients] = useState<Client[]>([]);
  const [qClient, setQClient] = useState("");
  const router = useRouter();

  useEffect(() => {
    getDocs(query(collection(db, "clients"), orderBy("createdAt", "desc"))).then((s) => {
      setClients(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Client, "id">) })));
    });
  }, []);

  const filtered = useMemo(() => {
    const q = qClient.trim().toLowerCase();
    return q ? clients.filter((c) => `${c.code} ${c.name}`.toLowerCase().includes(q)) : clients.slice(0, 25);
  }, [clients, qClient]);

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Consolidar (elige un cliente)</h2>
      <div className="max-w-xl">
        <label className="text-xs text-neutral-500">Buscar cliente</label>
        <input className="border rounded p-2 w-full" placeholder="Nombre o código" value={qClient} onChange={(e) => setQClient(e.target.value)} />
        <div className="mt-2 border rounded max-h-80 overflow-auto">
          {filtered.map((c) => (
            <button key={c.id} className="block w-full text-left px-3 py-2 hover:bg-neutral-50" onClick={() => router.push(`/admin/preparado/${c.id}`)}>
              <b>{c.code}</b> — {c.name}
            </button>
          ))}
          {!filtered.length ? <div className="px-3 py-2 text-sm text-neutral-500">Sin resultados</div> : null}
        </div>
      </div>
    </section>
  );
}

function EmbarquesView() {
  const [clients, setClients] = useState<Client[]>([]);
  const clientsById = useMemo(() => {
    const m: Record<string, Client> = {};
    for (const c of clients) if (c.id) m[c.id] = c;
    return m;
  }, [clients]);
  useEffect(() => {
    getDocs(query(collection(db, "clients"), orderBy("createdAt", "desc"))).then((s) => {
      setClients(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Client, "id">) })));
    });
  }, []);

  const [country, setCountry] = useState<string>("Uruguay");
  const [type, setType] = useState<ShipmentType>("COMERCIAL");
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  const [boxDetailOpen, setBoxDetailOpen] = useState(false);
  const [detailBox, setDetailBox] = useState<Box | null>(null);
  type DetailItem = { id: string; tracking: string; weightLb: number; photoUrl?: string };
  const [detailItems, setDetailItems] = useState<DetailItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [qBox, setQBox] = useState("");
  const [qClient, setQClient] = useState("");

  const [shipments, setShipments] = useState<{ id: string; code: string; country: string; type: ShipmentType; status: string; }[]>([]);
  const [targetShipmentId, setTargetShipmentId] = useState("");

  useEffect(() => {
    // Cajas sin embarque, filtradas por país y tipo
    getDocs(query(
      collection(db, "boxes"),
      where("shipmentId", "==", null),
      where("country", "==", country),
      where("type", "==", type)
    )).then(s => setBoxes(s.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Box, 'id'>) }))));
    setPicked({});
  }, [country, type]);

  useEffect(() => {
    // Cargar embarques abiertos
    getDocs(query(
      collection(db, "shipments"),
      where("status", "==", "open"),
      where("country", "==", country),
      where("type", "==", type),
      orderBy("openedAt", "desc")
    )).then(s => setShipments(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
  }, [country, type]);

  const totalKg = useMemo(() => boxes.filter(b => picked[b.id]).reduce((a,b)=> a + (Number(b.weightLb)||0),0) * LB_TO_KG, [boxes, picked]);

  const filteredBoxes = useMemo(() => {
    const qb = qBox.trim().toLowerCase();
    const qc = qClient.trim().toLowerCase();
    return boxes.filter(b => {
      const boxHit = !qb || String(b.code).toLowerCase().includes(qb);
      const label = clientsById[b.clientId] ? `${clientsById[b.clientId].code} ${clientsById[b.clientId].name}`.toLowerCase() : b.clientId.toLowerCase();
      const clientHit = !qc || label.includes(qc);
      return boxHit && clientHit;
    });
  }, [boxes, qBox, qClient, clientsById]);

  async function createShipment() {
    const chosen = boxes.filter(b => picked[b.id]);
    if (!chosen.length) return;
    // Defensive checks (redundant by query, but safe)
    const countries = new Set(chosen.map(b => b.country));
    const types = new Set(chosen.map(b => b.type));
    if (countries.size !== 1 || types.size !== 1) {
      alert("El embarque debe tener cajas del mismo país y mismo tipo.");
      return;
    }
    const payload = {
      code: await nextShipmentCode(),
      country: Array.from(countries)[0],
      type: Array.from(types)[0] as ShipmentType,
      boxIds: chosen.map(b => b.id),
      status: "open" as const,
      openedAt: Date.now(),
    };
    const ref = await addDoc(collection(db, "shipments"), payload);
    await Promise.all(chosen.map(b => updateDoc(doc(db, "boxes", b.id), { shipmentId: ref.id })));
    // refresh list
    setBoxes(prev => prev.filter(b => !picked[b.id]));
    setPicked({});
    alert(`Embarque ${payload.code} creado`);
  }

  async function addPickedToShipment() {
    if (!targetShipmentId) return;
    const chosen = boxes.filter(b => picked[b.id]);
    if (!chosen.length) return;
    // Defensive checks (redundant by query, but safe)
    const countries = new Set(chosen.map(b => b.country));
    const types = new Set(chosen.map(b => b.type));
    if (countries.size !== 1 || types.size !== 1) {
      alert("Las cajas deben ser del mismo país y tipo para añadir al embarque.");
      return;
    }
    const shipment = shipments.find(s => s.id === targetShipmentId);
    if (!shipment) {
      alert("Embarque no encontrado.");
      return;
    }
    if (shipment.country !== Array.from(countries)[0] || shipment.type !== Array.from(types)[0]) {
      alert("Las cajas no coinciden con el país y tipo del embarque seleccionado.");
      return;
    }
    await Promise.all(chosen.map(b => updateDoc(doc(db, "boxes", b.id), { shipmentId: targetShipmentId })));
    // refresh list
    setBoxes(prev => prev.filter(b => !picked[b.id]));
    setPicked({});
    alert(`Cajas añadidas al embarque ${shipment.code}`);
  }

  async function closeShipment() {
    if (!targetShipmentId) return;
    await updateDoc(doc(db, "shipments", targetShipmentId), { status: "shipped", closedAt: Date.now() });
    // quitar de la lista local
    setShipments(list => list.filter(s => s.id !== targetShipmentId));
    setTargetShipmentId("");
  }

  async function openBoxDetail(box: Box) {
    setDetailBox(box);
    setBoxDetailOpen(true);
    setLoadingDetail(true);
    try {
      const items: DetailItem[] = [];
      for (const id of box.itemIds || []) {
        const snap = await getDoc(doc(db, "inboundPackages", id));
        if (snap.exists()) {
          const d = snap.data() as any;
          items.push({ id: snap.id, tracking: d.tracking, weightLb: d.weightLb || 0, photoUrl: d.photoUrl });
        }
      }
      setDetailItems(items);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function removeItemFromBox(itemId: string) {
    if (!detailBox) return;
    const items = (detailBox.itemIds || []).filter((x) => x !== itemId);
    const removed = detailItems.find((i) => i.id === itemId);
    const newWeight = (Number(detailBox.weightLb) || 0) - (removed?.weightLb || 0);
    await updateDoc(doc(db, "boxes", detailBox.id), { itemIds: items, weightLb: Math.max(0, newWeight) });
    await updateDoc(doc(db, "inboundPackages", itemId), { status: "received" });
    setDetailBox({ ...detailBox, itemIds: items, weightLb: Math.max(0, newWeight) });
    setDetailItems((prev) => prev.filter((i) => i.id !== itemId));
    // reflect on table
    setBoxes((prev) => prev.map((b) => (b.id === detailBox.id ? { ...b, itemIds: items, weightLb: Math.max(0, newWeight) } : b)));
  }

  function printBoxLabel(box: Box) {
    const JSPDF = (typeof window !== 'undefined' && (window as any).jspdf?.jsPDF) || null;
    if (!JSPDF) { alert('jsPDF no está cargado aún. Espera un momento e inténtalo de nuevo.'); return; }
    const docPdf = new JSPDF({ unit: "in", format: [4, 6], orientation: "landscape" });
    const m = 0.25; const W = 6 - m * 2; const H = 4 - m * 2;
    docPdf.setLineWidth(0.02); docPdf.rect(m, m, W, H);
    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(0.38); docPdf.text("#CAJA", m + 0.1, m + 0.3);
    docPdf.setFontSize(1.2); docPdf.text(String(box.code), m + W / 2, m + 0.95, { align: "center" });
    docPdf.setFontSize(0.38); docPdf.text("CLIENTE", m + 0.1, m + 1.4);
    const label = clientsById[box.clientId] ? `${clientsById[box.clientId].code} — ${clientsById[box.clientId].name}` : box.clientId;
    docPdf.text(label, m + 0.1, m + 1.75);
    docPdf.setFontSize(0.38); docPdf.text("PAÍS / TIPO", m + 0.1, m + 2.2);
    docPdf.text(`${box.country} / ${box.type}`, m + 0.1, m + 2.55);
    docPdf.setFontSize(0.38);
    docPdf.text(`Items: ${box.itemIds?.length || 0}`, m + 0.1, m + 3.1);
    docPdf.text(`Peso: ${(Number(box.weightLb||0)*LB_TO_KG).toFixed(2)} kg`, m + 2.5, m + 3.1);
    window.open(docPdf.output("bloburl"), "_blank");
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Cargas (crear embarques con múltiples cajas)</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="text-xs text-neutral-500">País</label>
          <select className="border rounded p-2 w-full" value={country} onChange={(e)=> setCountry(e.target.value)}>
            <option>Uruguay</option>
            <option>Argentina</option>
            <option>United States</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-neutral-500">Tipo de envío</label>
          <select className="border rounded p-2 w-full" value={type} onChange={(e)=> setType(e.target.value as ShipmentType)}>
            <option value="COMERCIAL">COMERCIAL</option>
            <option value="FRANQUICIA">FRANQUICIA</option>
          </select>
          <p className="text-xs mt-1 text-neutral-500">Para Argentina puedes dejar COMERCIAL (único).</p>
        </div>
        <div className="md:col-span-2 text-right">
          <button className="px-4 py-2 rounded bg-black text-white disabled:opacity-50" onClick={createShipment} disabled={!Object.values(picked).some(Boolean)}>Crear embarque</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div className="md:col-span-3">
          <label className="text-xs text-neutral-500">Agregar cajas seleccionadas a embarque abierto</label>
          <select className="border rounded p-2 w-full" value={targetShipmentId} onChange={(e)=> setTargetShipmentId(e.target.value)}>
            <option value="">Seleccionar embarque (abierto)…</option>
            {shipments.map(s => (
              <option key={s.id} value={s.id}>{s.code} · {s.country} / {s.type}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded border" onClick={addPickedToShipment} disabled={!Object.values(picked).some(Boolean) || !targetShipmentId}>Agregar a embarque</button>
          <button className="px-4 py-2 rounded border" onClick={closeShipment} disabled={!targetShipmentId}>Cerrar embarque</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <input className="border rounded p-2" placeholder="Buscar caja (código)" value={qBox} onChange={(e)=> setQBox(e.target.value)} />
        <input className="border rounded p-2" placeholder="Buscar cliente" value={qClient} onChange={(e)=> setQClient(e.target.value)} />
      </div>

      <div className="overflow-x-auto border rounded">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="p-2">Sel</th>
              <th className="text-left p-2">Caja</th>
              <th className="text-left p-2">Cliente</th>
              <th className="text-left p-2">País</th>
              <th className="text-left p-2">Tipo</th>
              <th className="text-left p-2">Items</th>
              <th className="text-left p-2">Peso</th>
            </tr>
          </thead>
          <tbody>
            {filteredBoxes.map(b => (
              <tr key={b.id} className="border-t">
                <td className="p-2"><input type="checkbox" checked={!!picked[b.id]} onChange={(e)=> setPicked(s=> ({...s, [b.id]: e.target.checked}))} /></td>
                <td className="p-2 font-mono"><button className="underline" onClick={() => openBoxDetail(b)}>{b.code}</button></td>
                <td className="p-2">{clientsById[b.clientId] ? `${clientsById[b.clientId].code} — ${clientsById[b.clientId].name}` : b.clientId}</td>
                <td className="p-2">{b.country}</td>
                <td className="p-2">{b.type}</td>
                <td className="p-2">{b.itemIds?.length || 0}</td>
                <td className="p-2">{(Number(b.weightLb||0)*LB_TO_KG).toFixed(2)} kg</td>
              </tr>
            ))}
            {!filteredBoxes.length ? (
              <tr><td className="p-3 text-neutral-500" colSpan={7}>No hay cajas sin embarque para los filtros actuales.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="text-sm text-neutral-700">Total seleccionado: {totalKg.toFixed(2)} kg</div>

      {boxDetailOpen && detailBox ? (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center">
          <div className="bg-white w-[95vw] max-w-3xl rounded-lg shadow-xl p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Caja {detailBox.code}</h3>
              <div className="flex items-center gap-2">
                <button className="px-3 py-2 rounded border" onClick={() => printBoxLabel(detailBox)}>Imprimir etiqueta</button>
                <button className="px-3 py-2 rounded border" onClick={() => { setBoxDetailOpen(false); setDetailBox(null); }}>Cerrar</button>
              </div>
            </div>
            {loadingDetail ? (
              <div className="text-sm text-neutral-500">Cargando…</div>
            ) : (
              <div className="overflow-x-auto border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="text-left p-2">Tracking</th>
                      <th className="text-left p-2">Peso</th>
                      <th className="text-left p-2">Foto</th>
                      <th className="text-left p-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailItems.map((i) => (
                      <tr key={i.id} className="border-t">
                        <td className="p-2 font-mono">{i.tracking}</td>
                        <td className="p-2">{(Number(i.weightLb||0)*LB_TO_KG).toFixed(2)} kg</td>
                        <td className="p-2">{i.photoUrl ? (<a href={i.photoUrl} target="_blank" aria-label="Ver foto">📷</a>) : ("—")}</td>
                        <td className="p-2"><button className="px-2 py-1 rounded border" onClick={() => removeItemFromBox(i.id)}>Eliminar</button></td>
                      </tr>
                    ))}
                    {!detailItems.length ? (
                      <tr><td className="p-3 text-neutral-500" colSpan={4}>Caja vacía.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-3 text-sm">Peso total caja: {(Number(detailBox.weightLb||0)*LB_TO_KG).toFixed(2)} kg</div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

async function nextShipmentCode(): Promise<string> {
  const n = Math.floor(Date.now() / 1000) % 100000;
  return `E${String(n).padStart(4, "0")}`;
}

async function nextBoxCode(): Promise<string> {
  const n = Math.floor(Date.now() / 1000) % 100000;
  return `B${String(n).padStart(4, "0")}`;
}