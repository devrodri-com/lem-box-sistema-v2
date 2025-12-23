// src/app/admin/estado-envios/page.tsx
"use client";
import { useEffect, useMemo, useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { collection, doc, deleteDoc, getDoc, getDocs, getFirestore, orderBy, query, setDoc, updateDoc, where } from "firebase/firestore";
import { auth } from "@/lib/firebase";
import Script from "next/script";
import type { Client, Shipment as ShipmentType } from "@/types/lem";
import StatusBadge from "@/components/ui/StatusBadge";
import { fmtWeightPairFromLb } from "@/lib/weight";
import { useBoxDetailModal } from "@/components/boxes/useBoxDetailModal";
import { BoxDetailModal } from "@/components/boxes/BoxDetailModal";

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
  weightOverrideLb?: number | null;
  shipmentId?: string | null;
  managerUid?: string | null;
};


export default function EstadoEnviosPage() {
  const router = useRouter();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isStaff, setIsStaff] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [roleChecked, setRoleChecked] = useState(false);

  // expand / detail state
  const [expandedId, setExpandedId] = useState<string>("");
  const [boxesByShipment, setBoxesByShipment] = useState<Record<string, Box[]>>({});
  const [loadingDetail, setLoadingDetail] = useState<string>("");
  const [clientsById, setClientsById] = useState<Record<string, Client>>({});
  const [deletingShipmentId, setDeletingShipmentId] = useState<string>("");
  const [generatingInvoices, setGeneratingInvoices] = useState<string>("");
  
  // Estado para modal de edición de código
  const [editCodeModal, setEditCodeModal] = useState<{ id: string; code: string } | null>(null);
  const [editingCode, setEditingCode] = useState("");
  const [updatingCode, setUpdatingCode] = useState(false);

  // Flatten all boxes for useBoxDetailModal
  const allBoxes = useMemo(() => {
    const boxes: Box[] = [];
    for (const boxesList of Object.values(boxesByShipment)) {
      boxes.push(...boxesList);
    }
    return boxes;
  }, [boxesByShipment]);

  // Dummy setRows (estado-envios doesn't manage inbound rows)
  const [rows, setRows] = useState<Array<Record<string, unknown> & { id: string }>>([]);

  // Custom setBoxes that updates boxesByShipment
  const setBoxes = useMemo(() => {
    return ((updater: React.SetStateAction<Array<Record<string, unknown> & { id: string }>>) => {
      setBoxesByShipment((prev) => {
        const next = { ...prev };
        const newBoxes = typeof updater === "function" 
          ? updater(allBoxes as Array<Record<string, unknown> & { id: string }>)
          : updater;
        
        // Update boxes in boxesByShipment
        for (const shipmentId in next) {
          next[shipmentId] = next[shipmentId].map((b) => {
            const updated = newBoxes.find((nb) => (nb as any).id === b.id);
            return updated ? ({ ...b, ...updated } as Box) : b;
          });
        }
        
        return next;
      });
    }) as React.Dispatch<React.SetStateAction<Array<Record<string, unknown> & { id: string }>>>;
  }, [allBoxes]);

  // Box detail modal hook
  const { openBoxDetailByBoxId, modalProps } = useBoxDetailModal({
    boxes: allBoxes as Array<{ id: string; code: string; itemIds?: string[]; clientId: string; type?: "COMERCIAL" | "FRANQUICIA"; weightLb?: number; weightOverrideLb?: number | null; labelRef?: string; status?: "open" | "closed" | "shipped" | "delivered" }>,
    setBoxes,
    setRows,
    clientsById,
    hideItemsWhenOverride: false, // Admin siempre ve items
  });

  const db = getFirestore();

  // Verificar rol de staff
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setRoleChecked(true);
      return;
    }
    user
      .getIdTokenResult(true)
      .then((r) => {
        const claims = r.claims as any;
        const role = claims?.role || "";
        const isStaffRole =
          role === "admin" ||
          role === "superadmin" ||
          role === "operador" ||
          claims?.admin === true ||
          claims?.superadmin === true;
        const isSuper = Boolean(claims?.superadmin === true || role === "superadmin");
        setIsStaff(isStaffRole);
        setIsSuperAdmin(isSuper);
      })
      .catch(() => {
        setIsStaff(false);
        setIsSuperAdmin(false);
      })
      .finally(() => setRoleChecked(true));
  }, []);

  useEffect(() => {
    async function fetchShipments() {
      try {
        const q = query(collection(db, "shipments"));
        const snap = await getDocs(q);
        const list: Shipment[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        list.sort((a: any, b: any) => Number(b.openedAt || b.opened || b.createdAt || 0) - Number(a.openedAt || a.opened || a.createdAt || 0));
        setShipments(list);

        try {
          const snapClients = await getDocs(collection(db, "clients"));
          const map: Record<string, Client> = {};
          snapClients.docs.forEach(d => { map[d.id] = { id: d.id, ...(d.data() as any) } as Client });
          setClientsById(map);
        } catch (e) {
          console.error("[estado-envios] fetchClients failed", e);
        }
      } catch (e) {
        console.error("[estado-envios] fetchShipments failed", e);
      } finally {
        setLoading(false);
      }
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
  }

  async function deleteShipment(shipmentId: string) {
    setDeletingShipmentId(shipmentId);
    try {
      // Query a boxes donde shipmentId == shipmentId
      const boxesSnap = await getDocs(query(collection(db, "boxes"), where("shipmentId", "==", shipmentId)));
      
      // Si hay resultados → bloquear
      if (!boxesSnap.empty) {
        alert("No se puede eliminar un embarque que tiene cajas asociadas.");
        return;
      }
      
      // Si está vacío → deleteDoc
      await deleteDoc(doc(db, "shipments", shipmentId));
      
      // Remover de state
      setShipments(list => list.filter(s => s.id !== shipmentId));
      setBoxesByShipment(prev => {
        const next = { ...prev };
        delete next[shipmentId];
        return next;
      });
      
      // Si estaba expandido, cerrar
      if (expandedId === shipmentId) {
        setExpandedId("");
      }
    } catch (e: any) {
      alert(e?.message || "No se pudo eliminar el embarque");
    } finally {
      setDeletingShipmentId("");
    }
  }

  async function updateShipmentCode(shipmentId: string, newCode: string) {
    const codeTrimmed = newCode.trim();
    if (!codeTrimmed) {
      alert("El código no puede estar vacío");
      return;
    }
    
    setUpdatingCode(true);
    try {
      await updateDoc(doc(db, "shipments", shipmentId), { code: codeTrimmed });
      setShipments(list => list.map(s => s.id === shipmentId ? { ...s, code: codeTrimmed } : s));
      setEditCodeModal(null);
      setEditingCode("");
    } catch (e: any) {
      alert(e?.message || "No se pudo actualizar el código");
    } finally {
      setUpdatingCode(false);
    }
  }

  async function generateInvoiceDrafts(shipment: Shipment) {
    setGeneratingInvoices(shipment.id);
    try {
      // Obtener cajas del embarque
      const boxes = boxesByShipment[shipment.id] || [];
      if (boxes.length === 0) {
        // Si no están cargadas, cargarlas
        const snap = await getDocs(query(collection(db, "boxes"), where("shipmentId", "==", shipment.id)));
        const loadedBoxes: Box[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        setBoxesByShipment(prev => ({ ...prev, [shipment.id]: loadedBoxes }));
        boxes.push(...loadedBoxes);
      }

      if (boxes.length === 0) {
        alert("Este embarque no tiene cajas.");
        return;
      }

      // Agrupar por clientId
      const boxesByClient: Record<string, Box[]> = {};
      for (const box of boxes) {
        if (!box.clientId) continue;
        if (!boxesByClient[box.clientId]) {
          boxesByClient[box.clientId] = [];
        }
        boxesByClient[box.clientId].push(box);
      }

      const clientIds = Object.keys(boxesByClient);
      if (clientIds.length === 0) {
        alert("No se encontraron clientes en las cajas de este embarque.");
        return;
      }

      let created = 0;
      let skipped = 0;

      // Crear/Upsert invoice draft para cada clientId
      for (const clientId of clientIds) {
        const invoiceId = `invoice_${shipment.id}_${clientId}`;
        const invoiceRef = doc(db, "invoices", invoiceId);

        try {
          const existingDoc = await getDoc(invoiceRef);
          if (existingDoc.exists()) {
            const existingData = existingDoc.data();
            const status = existingData.status;
            // Si ya existe y está open o paid, skip
            if (status === "open" || status === "paid") {
              skipped++;
              continue;
            }
          }

          // Crear o actualizar invoice draft
          await setDoc(invoiceRef, {
            shipmentId: shipment.id,
            clientId,
            currency: "usd",
            status: "draft",
            items: [
              { description: "Carga comercial (kg)", quantity: 0, unitPriceUsd: 0, totalUsd: 0 },
              { description: "Celulares / Apple", quantity: 0, unitPriceUsd: 0, totalUsd: 0 },
              { description: "Pickup", quantity: 0, unitPriceUsd: 0, totalUsd: 0 },
              { description: "Manejo de carga", quantity: 0, unitPriceUsd: 0, totalUsd: 0 },
            ],
            totalUsd: 0,
            createdAt: Date.now(),
          }, { merge: true });

          created++;
        } catch (e: any) {
          console.error(`[estado-envios] Error creating invoice for client ${clientId}:`, e);
        }
      }

      alert(`Creadas ${created} factura(s) borrador. ${skipped > 0 ? `Omitidas ${skipped} (ya están abiertas o pagadas).` : ""}`);
    } catch (e: any) {
      console.error("[estado-envios] Error generating invoices:", e);
      alert(`Error: ${e?.message || "No se pudieron generar las facturas"}`);
    } finally {
      setGeneratingInvoices("");
    }
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
                          <div className="flex items-center gap-2 flex-wrap">
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
                            {(isStaff && s.status === "open") || isSuperAdmin ? (
                              <button
                                className="h-9 px-4 rounded-md border border-[#1f3f36] bg-white/5 text-white/90 font-medium hover:bg-white/10 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50"
                                onClick={() => {
                                  setEditCodeModal({ id: s.id, code: s.code });
                                  setEditingCode(s.code);
                                }}
                              >
                                Editar código
                              </button>
                            ) : null}
                            {isStaff && (
                              <button
                                className="h-9 px-4 rounded-md border border-[#1f3f36] bg-white/5 text-white/90 font-medium hover:bg-white/10 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50"
                                onClick={() => generateInvoiceDrafts(s)}
                                disabled={generatingInvoices === s.id}
                              >
                                {generatingInvoices === s.id ? "Generando…" : "Generar borradores"}
                              </button>
                            )}
                            {isStaff && (
                              <a
                                href={`/admin/facturas?shipmentId=${s.id}`}
                                className="h-9 px-4 rounded-md border border-[#1f3f36] bg-white/5 text-white/90 font-medium hover:bg-white/10 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] inline-flex items-center justify-center"
                              >
                                Ver facturas
                              </a>
                            )}
                            {(!boxesByShipment[s.id]?.length) && (
                              <button
                                className="h-9 px-4 rounded-md border border-red-500/70 bg-[#0f2a22] text-red-300 hover:bg-white/5 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                                onClick={() => deleteShipment(s.id)}
                                disabled={deletingShipmentId === s.id}
                              >
                                {deletingShipmentId === s.id ? "Eliminando…" : "Eliminar embarque"}
                              </button>
                            )}
                          </div>
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
                                    {(boxesByShipment[s.id] || []).map((b) => {
                                      const effectiveLb = b.weightOverrideLb != null ? Number(b.weightOverrideLb) : Number(b.weightLb || 0);
                                      return (
                                        <tr key={b.id} className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10">
                                          <td className="px-2 py-1 font-mono text-white">
                                            <button className="underline text-white/90 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#005f40] rounded-sm" onClick={() => openBoxDetailByBoxId(b.id)}>
                                              {b.code}
                                            </button>
                                          </td>
                                          <td className="px-2 py-1 text-white">{clientsById[b.clientId]?.name || b.clientId}</td>
                                          <td className="px-2 py-1 text-white">{b.itemIds?.length || 0}</td>
                                          <td className="px-2 py-1 text-white">{fmtWeightPairFromLb(effectiveLb)}</td>
                                          <td className="px-2 py-1 text-white">
                                            <button
                                              className="h-9 px-3 rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white/90 hover:bg-white/5 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40]"
                                              onClick={() => removeBoxFromShipment(b, s)}
                                            >
                                              Eliminar de embarque
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
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

        <BoxDetailModal {...modalProps} />

        {/* Modal de edición de código */}
        {editCodeModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-xl bg-[#071f19] border border-[#1f3f36] ring-1 ring-white/10 p-6 text-white">
              <h3 className="text-lg font-semibold text-white mb-2">Editar código de embarque</h3>
              <label className="block mt-4">
                <span className="text-xs font-medium text-white/70 mb-1 block">Código de embarque</span>
                <input
                  className="h-11 w-full rounded-md border border-[#1f3f36] bg-[#0f2a22] px-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#005f40]"
                  style={{
                    backgroundColor: "#0f2a22",
                    WebkitBoxShadow: "0 0 0px 1000px #0f2a22 inset",
                    WebkitTextFillColor: "#ffffff",
                  }}
                  type="text"
                  value={editingCode}
                  onChange={(e) => setEditingCode(e.target.value)}
                  autoFocus
                  placeholder="Código de embarque"
                />
              </label>
              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="h-10 px-4 rounded-md border border-[#1f3f36] bg-white/5 text-white/90 font-medium hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50"
                  onClick={() => {
                    setEditCodeModal(null);
                    setEditingCode("");
                  }}
                  disabled={updatingCode}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="h-10 px-4 rounded-md bg-[#eb6619] text-white font-medium shadow-md hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619] disabled:opacity-50"
                  onClick={() => updateShipmentCode(editCodeModal.id, editingCode)}
                  disabled={updatingCode}
                >
                  {updatingCode ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </RequireAuth>
  );
}