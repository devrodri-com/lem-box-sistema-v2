// src/app/admin/estado-envios/page.tsx
"use client";
import { useEffect, useMemo, useState, Fragment } from "react";
import RequireAuth from "@/components/RequireAuth";
import { collection, doc, getDoc, getDocs, getFirestore, orderBy, query, updateDoc, where } from "firebase/firestore";
import Script from "next/script";
import type { Client, Shipment as ShipmentType } from "@/types/lem";
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
  managerUid?: string | null;
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
    // 2) update shipment boxIds y recalcular managerUids
    const shRef = doc(db, "shipments", shipment.id);
    const shSnap = await getDoc(shRef);
    if (shSnap.exists()) {
      const prev: string[] = (shSnap.data() as any).boxIds || [];
      const next = prev.filter(x => x !== box.id);
      
      // Obtener todas las boxes restantes para recalcular managerUids
      const remainingBoxRefs = next.map(id => doc(db, "boxes", id));
      const remainingBoxSnaps = await Promise.all(remainingBoxRefs.map(r => getDoc(r)));
      const remainingBoxes = remainingBoxSnaps
        .filter(s => s.exists())
        .map(s => ({ id: s.id, ...(s.data() as any) } as Box));
      
      // Construir array de managerUids sin duplicados y sin nulos
      const managerUids = Array.from(new Set(
        remainingBoxes
          .map(b => b.managerUid)
          .filter((uid): uid is string => uid != null && uid !== "")
      ));
      
      await updateDoc(shRef, { boxIds: next, managerUids });
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
      <main className="min-h-[100dvh] bg-[#02120f] text-white flex flex-col items-center p-4 md:p-8 pt-24 md:pt-28">
        <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-4 md:p-6 space-y-6">
          <h1 className="text-2xl font-semibold text-white">Estado de envíos</h1>
          {loading ? (
            <p className="text-white/70">Cargando embarques...</p>
          ) : shipments.length === 0 ? (
            <p className="text-white/70">No hay embarques disponibles.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-[#1f3f36] bg-[#071f19] ring-1 ring-white/10">
              <table className="min-w-full text-sm tabular-nums">
                {/* el contenido de la tabla queda exactamente igual */}
                <thead className="sticky top-0 z-10 bg-[#0f2a22] shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)]">
                  <tr>
                    <th className="px-3 py-2 text-left text-white/80 text-xs font-medium">Código</th>
                    <th className="px-3 py-2 text-left text-white/80 text-xs font-medium">País</th>
                    <th className="px-3 py-2 text-left text-white/80 text-xs font-medium">Tipo</th>
                    <th className="px-3 py-2 text-left text-white/80 text-xs font-medium">Estado</th>
                    <th className="px-3 py-2 text-left text-white/80 text-xs font-medium">Fecha</th>
                    <th className="px-3 py-2 text-left text-white/80 text-xs font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((s) => (
                    <Fragment key={s.id}>
                      <tr className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10">
                        <td className="px-3 py-2">
                          <button className="underline text-white/90 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#005f40] rounded-sm" onClick={() => toggleExpand(s)}>
                            {s.code}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-white">{s.country}</td>
                        <td className="px-3 py-2 text-white">{s.type}</td>
                        <td className="px-3 py-2">{renderShipmentStatus(s.status)}</td>
                        <td className="px-3 py-2 text-white">{s.openedAt ? new Date(s.openedAt).toLocaleDateString() : "-"}</td>
                        <td className="px-3 py-2 text-white">
                          {s.status === "open" && (
                            <button className="h-9 px-4 rounded-md bg-[#cf6934] text-white font-medium hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#cf6934]" onClick={() => setStatus(s.id, "shipped")}>
                              Marcar En Tránsito
                            </button>
                          )}
                          {s.status === "shipped" && (
                            <button className="h-9 px-4 rounded-md bg-[#eb6619] text-white font-medium hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619]" onClick={() => setStatus(s.id, "arrived")}>
                              Marcar En Destino
                            </button>
                          )}
                        </td>
                      </tr>
                      {expandedId === s.id && (
                        <tr key={`${s.id}-expanded`}>
                          <td colSpan={6} className="bg-transparent p-3">
                            {loadingDetail === s.id ? (
                              <div className="text-white/60">Cargando cajas…</div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm tabular-nums border border-white/10 rounded-md overflow-hidden">
                                  <thead>
                                    <tr className="bg-[#0f2a22]">
                                      <th className="px-2 py-1 text-left text-white/80 text-xs font-medium">Caja</th>
                                      <th className="px-2 py-1 text-left text-white/80 text-xs font-medium">Cliente</th>
                                      <th className="px-2 py-1 text-left text-white/80 text-xs font-medium">Items</th>
                                      <th className="px-2 py-1 text-left text-white/80 text-xs font-medium">Peso</th>
                                      <th className="px-2 py-1 text-left text-white/80 text-xs font-medium">Acciones</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(boxesByShipment[s.id] || []).map((b) => (
                                      <tr key={b.id} className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10">
                                        <td className="px-2 py-1 font-mono text-white">
                                          <button className="underline text-white/90 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#005f40] rounded-sm" onClick={() => openBoxDetail(b)}>
                                            {b.code}
                                          </button>
                                        </td>
                                        <td className="px-2 py-1 text-white">{clientsById[b.clientId]?.name || b.clientId}</td>
                                        <td className="px-2 py-1 text-white">{b.itemIds?.length || 0}</td>
                                        <td className="px-2 py-1 text-white">{fmtWeightPairFromLb(Number(b.weightLb || 0))}</td>
                                        <td className="px-2 py-1 text-white">
                                          <button
                                            className="h-9 px-3 rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white/90 hover:bg-white/5 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40]"
                                            onClick={() => removeBoxFromShipment(b, s)}
                                          >
                                            Eliminar de embarque
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                    {!boxesByShipment[s.id]?.length && (
                                      <tr>
                                        <td colSpan={5} className="px-2 py-2 text-white/60">
                                          Este embarque no tiene cajas (o no se han cargado).
                                        </td>
                                      </tr>
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
          <Script
            src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"
            strategy="lazyOnload"
          />
        </div>

        {boxDetailOpen && detailBox ? (
          <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center">
            <div className="w-[95vw] max-w-3xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm shadow-xl p-4 md:p-6 text-white">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Caja {detailBox.code}</h3>
                <button
                  className="h-10 px-4 rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white/90 hover:bg-white/5 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40]"
                  onClick={() => {
                    setBoxDetailOpen(false);
                    setDetailBox(null);
                  }}
                >
                  Cerrar
                </button>
              </div>
              {loadingBox ? (
                <div className="text-sm text-white/60">Cargando…</div>
              ) : (
                <div className="overflow-x-auto rounded-md border border-[#1f3f36] bg-[#071f19] ring-1 ring-white/10">
                  <table className="w-full text-sm">
                    <thead className="bg-[#0f2a22]">
                      <tr>
                        <th className="text-left p-2 text-white/80 text-xs font-medium">Tracking</th>
                        <th className="text-left p-2 text-white/80 text-xs font-medium">Peso</th>
                        <th className="text-left p-2 text-white/80 text-xs font-medium">Foto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailItems.map((i) => (
                        <tr key={i.id} className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10">
                          <td className="p-2 font-mono text-white">{i.tracking}</td>
                          <td className="p-2 text-white">{fmtWeightPairFromLb(Number(i.weightLb || 0))}</td>
                          <td className="p-2">
                            {i.photoUrl ? (
                              <a href={i.photoUrl} target="_blank" aria-label="Ver foto" className="underline text-white/90 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#005f40] rounded-sm">
                                📷
                              </a>
                            ) : (
                              " "
                            )}
                          </td>
                        </tr>
                      ))}
                      {!detailItems.length ? (
                        <tr>
                          <td className="p-3 text-white/60" colSpan={3}>
                            Caja sin items.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-3 text-sm text-white/80">
                Peso total: {fmtWeightPairFromLb(Number(detailBox.weightLb || 0))}
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </RequireAuth>
  );
}