// src/app/admin/preparado/page.tsx
"use client";
import { fmtWeightPairFromLb } from "@/lib/weight";
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
  updateDoc,
  arrayUnion,
  runTransaction,
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
  status?: "open" | "closed"; // estado caja
};

// Minimal inline icons (no extra deps)
const IconPlus = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 5v14M5 12h14"/></svg>
);
const IconDownload = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
);

export default function PreparadoPage() {
  return (
    <RequireAuth requireAdmin>
      <PageInner />
    </RequireAuth>
  );
}

function PageInner() {
  const [tab, setTab] = useState<"consolidar" | "cargas">("consolidar");
  // Botones LEM-BOX (paleta: #005f40, #eb6619, #cf6934)
  const btnPrimaryCls = "inline-flex items-center justify-center h-11 px-5 rounded-md bg-[#eb6619] text-white font-medium shadow-md hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
  const btnSecondaryCls = "inline-flex items-center justify-center h-11 px-5 rounded-md border border-slate-300 bg-white text-slate-800 font-medium shadow-sm hover:bg-slate-50 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed";
  const tabBtn = (active: boolean) =>
    `px-3 h-9 text-sm rounded-full ${active ? 'bg-[#005f40] text-white shadow' : 'text-slate-700 hover:bg-white'}`;
  const linkCls = "text-sky-700 underline hover:text-sky-800 focus:outline-none focus:ring-2 focus:ring-[#005f40] rounded-sm";

  return (
    <main className="p-4 md:p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Preparado de carga</h1>

      <div role="tablist" aria-label="Vistas" className="inline-flex items-center gap-1 rounded-full bg-neutral-100 p-1 ring-1 ring-slate-200">
        <button role="tab" aria-selected={tab === "consolidar"} className={tabBtn(tab === "consolidar")} onClick={() => setTab("consolidar")}>Consolidar</button>
        <button role="tab" aria-selected={tab === "cargas"} className={tabBtn(tab === "cargas")} onClick={() => setTab("cargas")}>Cargas</button>
      </div>

      {tab === "consolidar" ? (
        <ConsolidarSearchView />
      ) : (
        <EmbarquesView
          btnPrimaryCls={btnPrimaryCls}
          btnSecondaryCls={btnSecondaryCls}
          linkCls={linkCls}
        />
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

  // Debounced query and keyboard index
  const [debouncedQ, setDebouncedQ] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(qClient), 150);
    return () => clearTimeout(t);
  }, [qClient]);

  useEffect(() => {
    getDocs(query(collection(db, "clients"), orderBy("createdAt", "desc"))).then((s) => {
      setClients(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Client, "id">) })));
    });
  }, []);

  const filtered = useMemo(() => {
    const q = debouncedQ.trim().toLowerCase();
    const list = q ? clients.filter((c) => `${c.code} ${c.name}`.toLowerCase().includes(q)) : clients.slice(0, 25);
    if (activeIdx >= list.length) setActiveIdx(0);
    return list;
  }, [clients, debouncedQ]);

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Elegí un cliente para consolidar</h2>
      <div className="max-w-xl">
        <label className="text-xs text-neutral-500">Buscar cliente</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">🔎</span>
          <input
            className="border rounded-md pl-9 pr-3 h-11 w-full bg-white"
            placeholder="Nombre o código (ej. 1234, juan)"
            value={qClient}
            onChange={(e) => setQClient(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1)); }
              if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
              if (e.key === 'Enter')     { e.preventDefault(); if (filtered[activeIdx]) router.push(`/admin/preparado/${filtered[activeIdx].id}`); }
              if (e.key === 'Escape')    { setQClient(""); }
            }}
          />
        </div>
        <div className="mt-2 border rounded-md ring-1 ring-slate-200 max-h-80 overflow-auto">
          {filtered.map((c, i) => (
            <button
              key={c.id}
              className={`group w-full text-left h-11 px-3 flex items-center justify-between transition ${i === activeIdx ? 'bg-slate-50' : 'bg-white hover:bg-slate-50'} focus:outline-none focus:ring-2 focus:ring-[#005f40]`}
              onClick={() => router.push(`/admin/preparado/${c.id}`)}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span className="truncate"><b className="font-mono font-semibold">{c.code}</b> — {c.name}</span>
              <span className="opacity-0 group-hover:opacity-100 text-xs inline-flex items-center gap-1 bg-[#eb6619] text-white px-2.5 py-1 rounded-md transition">Elegir</span>
            </button>
          ))}
          {!filtered.length ? (
            <div className="px-3 py-4 text-sm text-neutral-600 flex items-center justify-between">
              <span>Sin resultados. Probá con el <b>código</b> o el <b>apellido</b>.</span>
              <button className="text-xs underline" onClick={() => setQClient("")}>Limpiar filtro</button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function EmbarquesView({ btnPrimaryCls, btnSecondaryCls, linkCls }: { btnPrimaryCls?: string, btnSecondaryCls?: string, linkCls?: string }) {
  function fmtDate(ms?: number) {
    if (!ms) return "—";
    try { return new Date(ms).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch { return "—"; }
  }

  function exportCSV() {
    const rows = filteredBoxes.map(b => {
      const client = clientsById[b.clientId];
      const label = client ? `${client.code} — ${client.name}` : b.clientId;
      const pair = fmtWeightPairFromLb(Number(b.weightLb || 0));
      return [b.code, fmtDate(b.createdAt), label, b.country, b.type, String(b.itemIds?.length || 0), pair];
    });
    const header = ["Caja", "Fecha", "Cliente", "País", "Tipo", "Items", "Peso (lb/kg)"];
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `cajas_${country}_${type}.csv`; a.click(); URL.revokeObjectURL(url);
  }
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

  const totalLb = useMemo(
    () => boxes.filter(b => picked[b.id]).reduce((a,b)=> a + (Number(b.weightLb)||0), 0),
    [boxes, picked]
  );

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

    const chosenIds = chosen.map(b => b.id);
    try {
      await runTransaction(db, async (tx) => {
        // Validar y cargar cajas dentro de la transacción
        const boxRefs = chosenIds.map(id => doc(db, "boxes", id));
        const boxSnaps = await Promise.all(boxRefs.map(r => tx.get(r)));

        const boxesData = boxSnaps.map(s => {
          if (!s.exists()) throw new Error("Caja inexistente");
          return { id: s.id, ...(s.data() as any) } as Box;
        });

        // Validaciones de integridad
        const countries = new Set(boxesData.map(b => b.country));
        const types = new Set(boxesData.map(b => b.type));
        if (countries.size !== 1 || types.size !== 1) throw new Error("El embarque debe tener cajas del mismo país y tipo.");
        for (const b of boxesData) {
          if (b.status !== "closed") throw new Error(`Caja ${b.code} no está cerrada`);
          if (b.shipmentId) throw new Error(`Caja ${b.code} ya tiene embarque`);
        }

        const clientIds = Array.from(new Set(boxesData.map(b => b.clientId)));
        const code = await nextShipmentCode();

        // Crear doc de embarque con id auto
        const shipRef = doc(collection(db, "shipments"));
        tx.set(shipRef, {
          code,
          country: boxesData[0].country,
          type: boxesData[0].type,
          boxIds: boxesData.map(b => b.id),
          clientIds,
          status: "open",
          openedAt: Date.now(),
        });

        // Marcar cajas con shipmentId
        for (const r of boxRefs) tx.update(r, { shipmentId: shipRef.id });
      });

      // refresh list local
      setBoxes(prev => prev.filter(b => !picked[b.id]));
      setPicked({});
      alert("Embarque creado");
    } catch (e: any) {
      alert(e?.message || "No se pudo crear el embarque");
    }
  }

  async function addPickedToShipment() {
    if (!targetShipmentId) return;
    const chosen = boxes.filter(b => picked[b.id]);
    if (!chosen.length) return;

    const chosenIds = chosen.map(b => b.id);
    try {
      await runTransaction(db, async (tx) => {
        const shipRef = doc(db, "shipments", targetShipmentId);
        const shipSnap = await tx.get(shipRef);
        if (!shipSnap.exists()) throw new Error("Embarque no encontrado");
        const ship = shipSnap.data() as any;
        if (ship.status !== "open") throw new Error("El embarque no está abierto");

        // Cargar y validar cajas
        const boxRefs = chosenIds.map(id => doc(db, "boxes", id));
        const boxSnaps = await Promise.all(boxRefs.map(r => tx.get(r)));
        const boxesData = boxSnaps.map(s => {
          if (!s.exists()) throw new Error("Caja inexistente");
          return { id: s.id, ...(s.data() as any) } as Box;
        });

        // Validar país/tipo y estado de caja
        const countries = new Set(boxesData.map(b => b.country));
        const types = new Set(boxesData.map(b => b.type));
        if (countries.size !== 1 || types.size !== 1) throw new Error("Las cajas deben ser del mismo país y tipo.");
        if (ship.country !== boxesData[0].country || ship.type !== boxesData[0].type) throw new Error("País/tipo no coinciden con el embarque.");
        for (const b of boxesData) {
          if (b.status !== "closed") throw new Error(`Caja ${b.code} no está cerrada`);
          if (b.shipmentId) throw new Error(`Caja ${b.code} ya tiene embarque`);
        }

        // Recomputar boxIds y clientIds
        const newBoxIds: string[] = Array.from(new Set([...(ship.boxIds || []), ...boxesData.map(b => b.id)]));
        const newClientIds: string[] = Array.from(new Set([...(ship.clientIds || []), ...boxesData.map(b => b.clientId)]));

        tx.update(shipRef, { boxIds: newBoxIds, clientIds: newClientIds });
        for (const r of boxRefs) tx.update(r, { shipmentId: shipRef.id });
      });

      // refresh list local
      setBoxes(prev => prev.filter(b => !picked[b.id]));
      setPicked({});
      const shipment = shipments.find(s => s.id === targetShipmentId);
      alert(`Cajas añadidas al embarque ${shipment?.code || targetShipmentId}`);
    } catch (e: any) {
      alert(e?.message || "No se pudo añadir al embarque");
    }
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
    await updateDoc(doc(db, "boxes", detailBox.id), { itemIds: items });
    await updateDoc(doc(db, "inboundPackages", itemId), { status: "received" });
    await recalcBoxWeight(detailBox.id);

    // Refrescar estado local
    setDetailBox({ ...detailBox, itemIds: items });
    setDetailItems((prev) => prev.filter((i) => i.id !== itemId));
    setBoxes((prev) => prev.map((b) => (b.id === detailBox.id ? { ...b, itemIds: items } : b)));
  }

// Helper para recalcular el peso de la caja usando transacción
async function recalcBoxWeight(boxId: string) {
  function round2(n: number) { return Math.round(n * 100) / 100; }
  await runTransaction(db, async (tx) => {
    const boxRef = doc(db, "boxes", boxId);
    const boxSnap = await tx.get(boxRef);
    if (!boxSnap.exists()) throw new Error("Caja no encontrada");
    const boxData = boxSnap.data() as any;
    const itemIds: string[] = Array.isArray(boxData.itemIds) ? boxData.itemIds : [];
    let total = 0;
    for (const itemId of itemIds) {
      const itemRef = doc(db, "inboundPackages", itemId);
      const itemSnap = await tx.get(itemRef);
      if (itemSnap.exists()) {
        const d = itemSnap.data() as any;
        total += Number(d.weightLb || 0);
      }
    }
    tx.update(boxRef, { weightLb: round2(total) });
  });
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
    docPdf.text(`Peso: ${fmtWeightPairFromLb(Number(box.weightLb || 0))}`, m + 2.5, m + 3.1);
    window.open(docPdf.output("bloburl"), "_blank");
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Cargas (crear embarques con múltiples cajas)</h2>
      <div className="rounded-lg border ring-1 ring-slate-200 bg-white shadow-sm p-4 space-y-3">
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
          </div>
          <div className="md:col-span-2 flex items-center justify-end gap-2">
            <button className={btnSecondaryCls} onClick={exportCSV}>
              <IconDownload className="mr-2"/> Exportar
            </button>
            <button className={btnPrimaryCls} onClick={createShipment} disabled={!Object.values(picked).some(Boolean)}>
              <IconPlus className="mr-2"/> Crear embarque
            </button>
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
            <button className={btnSecondaryCls} onClick={addPickedToShipment} disabled={!Object.values(picked).some(Boolean) || !targetShipmentId}>Agregar a embarque</button>
            <button className={btnSecondaryCls} onClick={closeShipment} disabled={!targetShipmentId}>Cerrar embarque</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input className="border rounded p-2" placeholder="Buscar caja (código)" value={qBox} onChange={(e)=> setQBox(e.target.value)} />
          <input className="border rounded p-2" placeholder="Buscar cliente" value={qClient} onChange={(e)=> setQClient(e.target.value)} />
        </div>
      </div>

      <div className="overflow-x-auto border rounded">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-neutral-50 shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)]">
            <tr>
              <th className="p-2">Sel</th>
              <th className="text-left p-2">Caja</th>
              <th className="text-left p-2">Fecha</th>
              <th className="text-left p-2">Cliente</th>
              <th className="text-left p-2">País</th>
              <th className="text-left p-2">Tipo</th>
              <th className="text-right p-2">Items</th>
              <th className="text-right p-2">Peso</th>
            </tr>
          </thead>
          <tbody>
            {filteredBoxes.map(b => (
              <tr key={b.id} className="border-t odd:bg-white even:bg-neutral-50 hover:bg-slate-50 h-11">
                <td className="p-2"><input type="checkbox" checked={!!picked[b.id]} onChange={(e)=> setPicked(s=> ({...s, [b.id]: e.target.checked}))} /></td>
                <td className="p-2 font-mono"><button className={linkCls} onClick={() => openBoxDetail(b)}>{b.code}</button></td>
                <td className="p-2">{fmtDate(b.createdAt)}</td>
                <td className="p-2">{clientsById[b.clientId] ? `${clientsById[b.clientId].code} — ${clientsById[b.clientId].name}` : b.clientId}</td>
                <td className="p-2">{b.country}</td>
                <td className="p-2">{b.type}</td>
                <td className="p-2 text-right tabular-nums">{b.itemIds?.length || 0}</td>
                <td className="p-2 text-right tabular-nums">{fmtWeightPairFromLb(Number(b.weightLb || 0))}</td>
              </tr>
            ))}
            {!filteredBoxes.length ? (
              <tr><td className="p-3 text-neutral-500" colSpan={8}>No hay cajas sin embarque para los filtros actuales.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="text-sm text-neutral-700">Total seleccionado: {fmtWeightPairFromLb(totalLb)}</div>

      {boxDetailOpen && detailBox ? (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center">
          <div className="bg-white w-[95vw] max-w-3xl rounded-lg shadow-xl p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Caja {detailBox.code}</h3>
              <div className="flex items-center gap-2">
                <button className={btnSecondaryCls} onClick={() => printBoxLabel(detailBox)}>Imprimir etiqueta</button>
                <button className={btnSecondaryCls} onClick={() => { setBoxDetailOpen(false); setDetailBox(null); }}>Cerrar</button>
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
                        <td className="p-2">{fmtWeightPairFromLb(Number(i.weightLb || 0))}</td>
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
            <div className="mt-3 text-sm">Peso total caja: {fmtWeightPairFromLb(Number(detailBox.weightLb || 0))}</div>
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