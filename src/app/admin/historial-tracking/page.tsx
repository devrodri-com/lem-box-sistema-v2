// src/app/admin/historial-tracking/page.tsx
"use client";
import RequireAuth from "@/components/RequireAuth";
import { db } from "@/lib/firebase";
import { collection, getDocs, orderBy, query, getDoc, doc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import Script from "next/script";
import type { Carrier, Client } from "@/types/lem";

const LB_TO_KG = 0.45359237;

type Inbound = {
  id: string;
  tracking: string;
  carrier: Carrier;
  clientId: string;
  weightLb: number;
  status: "received" | "boxed" | "void";
  photoUrl?: string;
  receivedAt?: number;
};

type Box = {
  id: string;
  code: string;
  itemIds: string[];
  clientId: string;
  country?: string;
  type?: "COMERCIAL" | "FRANQUICIA";
  weightLb?: number;
};

export default function HistorialTrackingPage() {
  return (
    <RequireAuth>
      <PageInner />
    </RequireAuth>
  );
}

function PageInner() {
  const [clients, setClients] = useState<Client[]>([]);
  const [rows, setRows] = useState<Inbound[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);

  const [boxDetailOpen, setBoxDetailOpen] = useState(false);
  const [detailBox, setDetailBox] = useState<Box | null>(null);
  type DetailItem = { id: string; tracking: string; weightLb: number; photoUrl?: string };
  const [detailItems, setDetailItems] = useState<DetailItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [qClient, setQClient] = useState("");
  const [qTracking, setQTracking] = useState("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const clientsById = useMemo(() => {
    const m: Record<string, Client> = {};
    for (const c of clients) if (c.id) m[c.id] = c;
    return m;
  }, [clients]);

  const boxByInbound = useMemo(() => {
    const m: Record<string, Box> = {};
    for (const b of boxes) {
      for (const id of b.itemIds || []) m[id] = b;
    }
    return m;
  }, [boxes]);

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, "clients")),
      getDocs(query(collection(db, "inboundPackages"), orderBy("receivedAt", "desc"))),
      getDocs(collection(db, "boxes")),
    ]).then(([cs, is, bs]) => {
      setClients(cs.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Client,"id">) })));
      setRows(is.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Inbound,"id">) })));
      setBoxes(bs.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Box,"id">) })));
    });
  }, []);

  async function openBoxDetailByInbound(inboundId: string) {
    const b = boxByInbound[inboundId];
    if (!b) return;
    setDetailBox(b);
    setBoxDetailOpen(true);
    setLoadingDetail(true);
    try {
      const items: DetailItem[] = [];
      for (const id of b.itemIds || []) {
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

  function printBoxLabel() {
    if (!detailBox) return;
    const JSPDF = (typeof window !== 'undefined' && (window as any).jspdf?.jsPDF) || null;
    if (!JSPDF) { alert('jsPDF no está cargado. Espera un momento.'); return; }
    const pdf = new JSPDF({ unit: 'in', format: [4,6], orientation: 'landscape' });
    const m = 0.25; const W = 6 - m*2; const H = 4 - m*2;
    pdf.setLineWidth(0.02); pdf.rect(m,m,W,H);
    pdf.setFont('helvetica','bold');
    pdf.setFontSize(0.38); pdf.text('#CAJA', m+0.1, m+0.3);
    pdf.setFontSize(1.2); pdf.text(String(detailBox.code), m+W/2, m+0.95, {align:'center'});
    pdf.setFontSize(0.38); pdf.text('CLIENTE', m+0.1, m+1.4);
    const label = clientsById[detailBox.clientId] ? `${clientsById[detailBox.clientId].code} — ${clientsById[detailBox.clientId].name}` : detailBox.clientId;
    pdf.text(label, m+0.1, m+1.75);
    pdf.setFontSize(0.38); pdf.text('PAÍS / TIPO', m+0.1, m+2.2);
    pdf.text(`${detailBox.country || ''} / ${detailBox.type || ''}`, m+0.1, m+2.55);
    pdf.setFontSize(0.38);
    pdf.text(`Items: ${detailBox.itemIds?.length || 0}`, m+0.1, m+3.1);
    pdf.text(`Peso: ${(Number(detailBox.weightLb||0)*LB_TO_KG).toFixed(2)} kg`, m+2.5, m+3.1);
    window.open(pdf.output('bloburl'), '_blank');
  }

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const client = clientsById[r.clientId];
      const clientText = client ? `${client.code} ${client.name}`.toLowerCase() : "";
      if (qClient && !clientText.includes(qClient.toLowerCase())) return false;
      if (qTracking && !r.tracking.toLowerCase().includes(qTracking.toLowerCase())) return false;
      if (dateFrom) {
        const fromTs = new Date(dateFrom).setHours(0,0,0,0);
        if (!r.receivedAt || r.receivedAt < fromTs) return false;
      }
      if (dateTo) {
        const toTs = new Date(dateTo).setHours(23,59,59,999);
        if (!r.receivedAt || r.receivedAt > toTs) return false;
      }
      return true;
    });
  }, [rows, clientsById, qClient, qTracking, dateFrom, dateTo]);

  return (
    <main className="p-4 md:p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Historial de tracking</h1>
      <p className="text-sm text-neutral-600">
        Todos los trackings: empacados (en caja) y sin empacar (sueltos en warehouse).
      </p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <input
          className="border rounded p-2"
          placeholder="Buscar por cliente"
          value={qClient}
          onChange={(e) => setQClient(e.target.value)}
        />
        <input
          className="border rounded p-2"
          placeholder="Buscar por tracking"
          value={qTracking}
          onChange={(e) => setQTracking(e.target.value)}
        />
        <input
          type="date"
          className="border rounded p-2"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          title="Desde"
        />
        <input
          type="date"
          className="border rounded p-2"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          title="Hasta"
        />
      </div>

      <div className="overflow-x-auto border rounded">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="text-left p-2">Fecha</th>
              <th className="text-left p-2">Tracking</th>
              <th className="text-left p-2">Cliente</th>
              <th className="text-left p-2">Carrier</th>
              <th className="text-left p-2">Peso</th>
              <th className="text-left p-2">Caja</th>
              <th className="text-left p-2">Estado</th>
              <th className="text-left p-2">Foto</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const c = clientsById[r.clientId];
              const cliente = c?.code ? `${c.code} — ${c.name}` : r.clientId;
              return (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.receivedAt ? new Date(r.receivedAt).toLocaleDateString() : "-"}</td>
                  <td className="p-2 font-mono"> <a className="underline" href={`/admin/trackings/${r.id}`}>{r.tracking}</a></td>
                  <td className="p-2">{cliente}</td>
                  <td className="p-2">{r.carrier}</td>
                  <td className="p-2">{(Number(r.weightLb || 0) * LB_TO_KG).toFixed(2)} kg</td>
                  <td className="p-2">
                    {boxByInbound[r.id]?.code ? (
                      <button className="underline" onClick={() => openBoxDetailByInbound(r.id)}>{boxByInbound[r.id]?.code}</button>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="p-2">{r.status}</td>
                  <td className="p-2">
                    {r.photoUrl ? (
                      <a href={r.photoUrl} target="_blank" title="Ver foto" className="underline" aria-label="Ver foto">📷</a>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!rows.length ? (
              <tr><td className="p-3 text-neutral-500" colSpan={8}>Sin datos aún.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js" strategy="lazyOnload" />

      {boxDetailOpen && detailBox ? (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center">
          <div className="bg-white w-[95vw] max-w-3xl rounded-lg shadow-xl p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Caja {detailBox.code}</h3>
              <div className="flex items-center gap-2">
                <button className="px-3 py-2 rounded border" onClick={printBoxLabel}>Imprimir etiqueta</button>
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
                    </tr>
                  </thead>
                  <tbody>
                    {detailItems.map((i) => (
                      <tr key={i.id} className="border-t">
                        <td className="p-2 font-mono">{i.tracking}</td>
                        <td className="p-2">{(Number(i.weightLb||0)*LB_TO_KG).toFixed(2)} kg</td>
                        <td className="p-2">{i.photoUrl ? (<a href={i.photoUrl} target="_blank" aria-label="Ver foto">📷</a>) : ("—")}</td>
                      </tr>
                    ))}
                    {!detailItems.length ? (
                      <tr><td className="p-3 text-neutral-500" colSpan={3}>Caja sin items.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-3 text-sm">Peso total caja: {(Number(detailBox.weightLb||0)*LB_TO_KG).toFixed(2)} kg</div>
          </div>
        </div>
      ) : null}
    </main>
  );
}