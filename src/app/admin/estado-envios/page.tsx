// /src/app/admin/estado-envios/page.tsx
"use client";
import { useEffect, useMemo, useState, Fragment } from "react";
import RequireAuth from "@/components/RequireAuth";
import { collection, doc, getDoc, getDocs, getFirestore, orderBy, query, updateDoc, where } from "firebase/firestore";
import Script from "next/script";
import type { Client } from "@/types/lem";
import StatusBadge from "@/components/ui/StatusBadge";
import { fmtWeightPairFromLb } from "@/lib/weight";

type Shipment = {
  id: string;
  code: string;
  country: string;
  type: "COMERCIAL" | "FRANQUICIA";
  status: "open" | "shipped" | "arrived" | "closed";
  boxIds?: string[];
  openedAt?: number;
  closedAt?: number;
};

type Box = {
  id: string;
  code: string;
  clientId: string;
  country: string;
  type: "COMERCIAL" | "FRANQUICIA";
  itemIds: string[];
  weightLb?: number;
  shipmentId?: string | null;
};


export default function EstadoEnviosPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);

  // expand / detail state
  const [expandedId, setExpandedId] = useState<string>("");
  const [boxesByShipment, setBoxesByShipment] = useState<Record<string, Box[]>>({});
  const [loadingDetail, setLoadingDetail] = useState<string>("");
  const [boxDetailOpen, setBoxDetailOpen] = useState(false);
  const [detailBox, setDetailBox] = useState<Box | null>(null);
  type DetailItem = { id: string; tracking: string; weightLb: number; photoUrl?: string };
  const [detailItems, setDetailItems] = useState<DetailItem[]>([]);
  const [loadingBox, setLoadingBox] = useState(false);
  const [clientsById, setClientsById] = useState<Record<string, Client>>({});

  const db = getFirestore();

  useEffect(() => {
    async function fetchShipments() {
      const q = query(collection(db, "shipments"), orderBy("openedAt", "desc"));
      const snap = await getDocs(q);
      const list: Shipment[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      setShipments(list);
      setLoading(false);

      const snapClients = await getDocs(collection(db, "clients"));
      const map: Record<string, Client> = {};
      snapClients.docs.forEach(d => { map[d.id] = { id: d.id, ...(d.data() as any) } as Client });
      setClientsById(map);
    }
    fetchShipments();
  }, [db]);

  async function toggleExpand(shipment: Shipment) {
    if (expandedId === shipment.id) { setExpandedId(""); return; }
    setExpandedId(shipment.id);
    // Lazy-load boxes if not loaded
    if (!boxesByShipment[shipment.id]) {
      setLoadingDetail(shipment.id);
      const snap = await getDocs(query(collection(db, "boxes"), where("shipmentId", "==", shipment.id)));
      const boxes: Box[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      setBoxesByShipment(prev => ({ ...prev, [shipment.id]: boxes }));
      setLoadingDetail("");
    }
  }

  async function setStatus(shipmentId: string, status: Shipment["status"]) {
    await updateDoc(doc(db, "shipments", shipmentId), { status, ...(status === "shipped" ? { closedAt: Date.now() } : {}), ...(status === "arrived" ? { arrivedAt: Date.now() } : {}) });
    setShipments(list => list.map(s => s.id === shipmentId ? { ...s, status } : s));
  }

  async function openBoxDetail(box: Box) {
    setDetailBox(box);
    setBoxDetailOpen(true);
    setLoadingBox(true);
    try {
      const items: DetailItem[] = [];
      for (const id of box.itemIds || []) {
        const s = await getDoc(doc(db, "inboundPackages", id));
        if (s.exists()) {
          const d = s.data() as any;
          items.push({ id: s.id, tracking: d.tracking, weightLb: d.weightLb || 0, photoUrl: d.photoUrl });
        }
      }
      setDetailItems(items);
    } finally {
      setLoadingBox(false);
    }
  }

  async function removeBoxFromShipment(box: Box, shipment: Shipment) {
    // 1) detach box from shipment
    await updateDoc(doc(db, "boxes", box.id), { shipmentId: null });
    // 2) update shipment boxIds
    const shRef = doc(db, "shipments", shipment.id);
    const shSnap = await getDoc(shRef);
    if (shSnap.exists()) {
      const prev: string[] = (shSnap.data() as any).boxIds || [];
      const next = prev.filter(x => x !== box.id);
      await updateDoc(shRef, { boxIds: next });
      setShipments(list => list.map(s => s.id === shipment.id ? { ...s, boxIds: next } : s));
    }
    // 3) update local boxes list for that shipment
    setBoxesByShipment(prev => ({ ...prev, [shipment.id]: (prev[shipment.id] || []).filter(b => b.id !== box.id) }));
    // 4) close modal if showing this box
    if (detailBox?.id === box.id) { setBoxDetailOpen(false); setDetailBox(null); }
  }

  const statusLabel = (s: Shipment["status"]) => {
    switch (s) {
      case "open": return "En Proceso";
      case "shipped": return "En Tránsito";
      case "arrived": return "En Destino";
      case "closed": return "Cerrado";
      default: return s;
    }
  };

  function renderShipmentStatus(st: Shipment["status"]) {
    return st === "open" ? (
      <StatusBadge scope="shipment" status="open" />
    ) : st === "shipped" ? (
      <StatusBadge scope="shipment" status="shipped" />
    ) : st === "arrived" ? (
      <StatusBadge scope="shipment" status="arrived" />
    ) : st === "closed" ? (
      <StatusBadge scope="shipment" status="closed" />
    ) : (
      <span className="text-xs">{st}</span>
    );
  }

  return (
    <RequireAuth requireAdmin>
      <main className="p-4 md:p-8 space-y-6">
        <h1 className="text-2xl font-semibold">Estado de envíos</h1>
        {loading ? (
          <p>Cargando embarques...</p>
        ) : shipments.length === 0 ? (
          <p>No hay embarques disponibles.</p>
        ) : (
          <div className="overflow-x-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-3 py-2 text-left">Código</th>
                  <th className="px-3 py-2 text-left">País</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-left">Estado</th>
                  <th className="px-3 py-2 text-left">Fecha</th>
                  <th className="px-3 py-2 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((s) => (
                  <Fragment key={s.id}>
                    <tr className="border-t">
                      <td className="px-3 py-2">
                        <button className="underline" onClick={() => toggleExpand(s)}>
                          {s.code}
                        </button>
                      </td>
                      <td className="px-3 py-2">{s.country}</td>
                      <td className="px-3 py-2">{s.type}</td>
                      <td className="px-3 py-2">{renderShipmentStatus(s.status)}</td>
                      <td className="px-3 py-2">{s.openedAt ? new Date(s.openedAt).toLocaleDateString() : "-"}</td>
                      <td className="px-3 py-2">
                        {s.status === "open" && (
                          <button className="px-2 py-1 rounded border" onClick={() => setStatus(s.id, "shipped")}>Marcar En Tránsito</button>
                        )}
                        {s.status === "shipped" && (
                          <button className="px-2 py-1 rounded border" onClick={() => setStatus(s.id, "arrived")}>Marcar En Destino</button>
                        )}
                      </td>
                    </tr>
                    {expandedId === s.id && (
                      <tr key={`${s.id}-expanded`}>
                        <td colSpan={6} className="bg-neutral-50 p-3">
                          {loadingDetail === s.id ? (
                            <div className="text-neutral-500">Cargando cajas…</div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm border">
                                <thead>
                                  <tr className="bg-white">
                                    <th className="px-2 py-1 text-left">Caja</th>
                                    <th className="px-2 py-1 text-left">Cliente</th>
                                    <th className="px-2 py-1 text-left">Items</th>
                                    <th className="px-2 py-1 text-left">Peso</th>
                                    <th className="px-2 py-1 text-left">Acciones</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(boxesByShipment[s.id] || []).map((b) => (
                                    <tr key={b.id} className="border-t">
                                      <td className="px-2 py-1 font-mono">
                                        <button className="underline" onClick={() => openBoxDetail(b)}>{b.code}</button>
                                      </td>
                                      <td className="px-2 py-1">{clientsById[b.clientId]?.name || b.clientId}</td>
                                      <td className="px-2 py-1">{b.itemIds?.length || 0}</td>
                                      <td className="px-2 py-1">{fmtWeightPairFromLb(Number(b.weightLb || 0))}</td>
                                      <td className="px-2 py-1">
                                        <button className="px-2 py-1 rounded border" onClick={() => removeBoxFromShipment(b, s)}>Eliminar de embarque</button>
                                      </td>
                                    </tr>
                                  ))}
                                  {!boxesByShipment[s.id]?.length && (
                                    <tr><td colSpan={5} className="px-2 py-2 text-neutral-500">Este embarque no tiene cajas (o no se han cargado).</td></tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js" strategy="lazyOnload" />
        {boxDetailOpen && detailBox ? (
          <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center">
            <div className="bg-white w-[95vw] max-w-3xl rounded-lg shadow-xl p-4 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Caja {detailBox.code}</h3>
                <button className="px-3 py-2 rounded border" onClick={() => { setBoxDetailOpen(false); setDetailBox(null); }}>Cerrar</button>
              </div>
              {loadingBox ? (
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
                          <td className="p-2">{fmtWeightPairFromLb(Number(i.weightLb || 0))}</td>
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
              <div className="mt-3 text-sm">Peso total: {fmtWeightPairFromLb(Number(detailBox.weightLb || 0))}</div>
            </div>
          </div>
        ) : null}
      </main>
    </RequireAuth>
  );
}