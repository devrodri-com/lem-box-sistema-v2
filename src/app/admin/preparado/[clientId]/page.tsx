// src/app/admin/preparado/[clientId]/page.tsx
"use client";
import RequireAuth from "@/components/RequireAuth";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc, runTransaction } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Client } from "@/types/lem";
import { fmtWeightPairFromLb, lbToKg, kgToLb } from "@/lib/weight";
import StatusBadge from "@/components/ui/StatusBadge";
import { printBoxLabel } from "@/lib/printBoxLabel";
import { BoxDetailModal } from "@/components/boxes/BoxDetailModal";
import { useBoxDetailModal } from "@/components/boxes/useBoxDetailModal";
import { BrandSelect, type BrandOption } from "@/components/ui/BrandSelect";

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
  verifiedWeightLb?: number;
  managerUid?: string | null;
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
  const [rowBoxChoice, setRowBoxChoice] = useState<Record<string, string>>({}); // inboundId -> boxId or "__new__"
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [boxType, setBoxType] = useState<ShipmentType>("COMERCIAL");
  const [boxId, setBoxId] = useState<string>("");
  const [bulkBoxId, setBulkBoxId] = useState<string>("");
  const [verifyLb, setVerifyLb] = useState<string>("");
  const [verifyKg, setVerifyKg] = useState<string>("");

  // Pagination state
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Print prompt state
  const [printPromptBoxId, setPrintPromptBoxId] = useState<string | null>(null);

  const [notice, setNotice] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);
  function notify(msg: string, type: "success" | "error" | "info" = "info") {
    setNotice({ type, msg });
    window.setTimeout(() => setNotice(null), 2500);
  }

  const eligibleBoxes = useMemo(
    () => boxes.filter(b => b.clientId === clientId && b.type === boxType && !b.shipmentId && b.status !== "closed"),
    [boxes, clientId, boxType]
  );

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

  // clientsById para el hook
  const clientsById = useMemo(() => {
    const m: Record<string, Client> = {};
    if (client?.id) m[client.id] = client;
    return m;
  }, [client]);

  // Box detail modal hook
  const { openBoxDetailByBoxId, modalProps } = useBoxDetailModal({
    boxes,
    setBoxes,
    setRows: setInbounds,
    clientsById,
  });

  const visibleInbounds = useMemo(() => {
    return inbounds.filter((r) => {
      if (r.status !== "boxed") return true; // received/void visibles
      const b = boxByInbound[r.id];
      // boxed: solo mostrar si la caja AÚN no está en embarque
      return !b || !b.shipmentId;
    });
  }, [inbounds, boxByInbound]);

  // Pagination derived values
  const totalPages = useMemo(() => Math.max(1, Math.ceil(visibleInbounds.length / pageSize)), [visibleInbounds.length]);

  useEffect(() => {
    // keep page in range when filters/data change
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const pagedInbounds = useMemo(() => {
    const start = (page - 1) * pageSize;
    return visibleInbounds.slice(start, start + pageSize);
  }, [visibleInbounds, page]);

  const totalLb = useMemo(() => Object.keys(selected).filter(id => selected[id]).reduce((acc, id) => {
    const r = visibleInbounds.find(x => x.id === id);
    return acc + (Number(r?.weightLb) || 0);
  }, 0), [selected, visibleInbounds]);

  const anySelected = useMemo(() => Object.values(selected).some(Boolean), [selected]);

  const hasBoxWithItems = useMemo(
    () => boxes.some(b => b.clientId === clientId && (b.itemIds?.length || 0) > 0 && !b.shipmentId),
    [boxes, clientId]
  );

  async function createBox(presetType?: ShipmentType): Promise<string | null> {
    if (!client) return null;
    const t = presetType ?? boxType;
    
    // Leer el cliente para obtener managerUid
    let managerUid: string | null = null;
    if (clientId) {
      try {
        const clientSnap = await getDoc(doc(db, "clients", clientId));
        if (clientSnap.exists()) {
          const clientData = clientSnap.data() as Omit<Client, "id">;
          managerUid = clientData.managerUid ?? null;
        }
      } catch (error) {
        console.error("Error al leer el cliente:", error);
        // Continuar sin managerUid si hay error
      }
    }
    
    const payload: Omit<Box, "id"> & { status: "open" } = {
      code: await nextBoxCode(),
      clientId,
      type: t,
      country: client.country,
      itemIds: [],
      weightLb: 0,
      status: "open",
      createdAt: Date.now(),
      shipmentId: null,
      managerUid: managerUid,
    };
    const ref = await addDoc(collection(db, "boxes"), payload);
    setBoxes(prev => [{ id: ref.id, ...payload }, ...prev]);
    setBoxId(ref.id);
    notify("Caja creada", "success");
    return ref.id;
  }

  async function addItemsToBox(targetBoxId: string, itemIds: string[]): Promise<boolean> {
    const box = boxes.find(b => b.id === targetBoxId);
    if (!box) return false;
    if (box.status === "closed") { notify("La caja está cerrada.", "error"); return false; }
    const chosen = inbounds.filter(r => itemIds.includes(r.id));
    try {
      await runTransaction(db, async (tx) => {
        // READS FIRST
        const boxRef = doc(db, "boxes", box.id);
        const boxSnap = await tx.get(boxRef);
        if (!boxSnap.exists()) throw new Error("Caja no encontrada");
        const boxData = boxSnap.data() as Box;
        if (boxData.status === "closed") throw new Error("La caja está cerrada");

        const inRefs = chosen.map(r => doc(db, "inboundPackages", r.id));
        const inSnaps = await Promise.all(inRefs.map(r => tx.get(r)));

        // VALIDATE
        inSnaps.forEach((s, i) => {
          if (!s.exists()) throw new Error(`Tracking ${chosen[i].tracking} no existe`);
          const d = s.data() as Inbound;
          if (d.status === "void") throw new Error(`Tracking ${chosen[i].tracking} está anulado`);
        });

        // WRITES
        inSnaps.forEach((s, i) => {
          const d = s.data() as Inbound;
          if (d.status !== "boxed") {
            tx.update(inRefs[i], {
              tracking: (d as any).tracking,
              clientId: (d as any).clientId,
              status: "boxed",
              boxedAt: (d as any).boxedAt ?? Date.now(),
              weightLb: Number(chosen[i].weightLb || (d as any).weightLb || 0),
              receivedAt: (d as any).receivedAt ?? null,
            });
          }
        });

        const newItems = Array.from(new Set([...(boxData.itemIds || []), ...chosen.map(r => r.id)]));
        tx.update(boxRef, { itemIds: newItems, status: boxData.status ?? "open", clientId: boxData.clientId });
      });
    } catch (e: any) {
      const msg = String(e?.message || e);
      notify(msg.includes("reads to be executed before all writes") ? "Error de transacción: leer antes de escribir" : msg, "error");
      return false;
    }

    // Fuera de la TX: refrescos locales
    const newItemsLocal = Array.from(new Set([...(box.itemIds || []), ...chosen.map(r => r.id)]));
    setBoxes(bs => bs.map(b => b.id === box.id ? { ...b, itemIds: newItemsLocal } : b));
    await recalcBoxWeight(box.id);
    return true;
  }

  async function handleAssignInbound(inboundId: string, value: string) {
    if (!client) return;
    // Prevent assigning already boxed to another box silently
    const inbound = inbounds.find(x => x.id === inboundId);
    if (!inbound) return;
    if (inbound.status === "boxed") return;

    if (value === "__new__") {
      const newId = await createBox();
      if (!newId) return;
      const ok = await addItemsToBox(newId, [inboundId]);
      if (ok) {
        setSelected(s => ({ ...s, [inboundId]: false }));
        setRowBoxChoice(m => ({ ...m, [inboundId]: "" }));
        notify("Tracking agregado a la caja", "success");
      }
      return;
    }

    // existing box
    const target = boxes.find(b => b.id === value);
    if (!target) return;
    if (target.clientId !== clientId) { notify("La caja elegida pertenece a otro cliente.", "error"); return; }
    if (target.type !== boxType) { notify("El tipo de la caja no coincide con el tipo seleccionado.", "error"); return; }
    if (target.shipmentId) { notify("La caja ya está asociada a un embarque.", "error"); return; }

    const ok = await addItemsToBox(target.id, [inboundId]);
    if (ok) {
      notify("Tracking agregado a la caja", "success");
      setSelected(s => ({ ...s, [inboundId]: false }));
      setRowBoxChoice(m => ({ ...m, [inboundId]: "" }));
    }
  }

  async function addSelectedToBox(targetBoxId?: string) {
    const targetId = targetBoxId || bulkBoxId || boxId;
    if (!client || !targetId) return;
    const box = boxes.find(b => b.id === targetId);
    if (!box) return;
    if (box.clientId !== clientId) { notify("La caja elegida pertenece a otro cliente.", "error"); return; }
    if (box.type !== boxType) { notify("El tipo de la caja no coincide con el tipo seleccionado.", "error"); return; }
    if (box.status === "closed") { notify("La caja está cerrada.", "error"); return; }
    const chosenIds = Object.keys(selected).filter(id => selected[id]);
    if (!chosenIds.length) return;
    const chosen = inbounds.filter(r => chosenIds.includes(r.id));

    try {
      await runTransaction(db, async (tx) => {
        // READS FIRST
        const boxRef = doc(db, "boxes", box.id);
        const boxSnap = await tx.get(boxRef);
        if (!boxSnap.exists()) throw new Error("Caja no encontrada");
        const boxData = boxSnap.data() as Box;
        if (boxData.status === "closed") throw new Error("La caja está cerrada");

        const inRefs = chosen.map(r => doc(db, "inboundPackages", r.id));
        const inSnaps = await Promise.all(inRefs.map(r => tx.get(r)));

        // VALIDATE
        inSnaps.forEach((s, i) => {
          if (!s.exists()) throw new Error(`Tracking ${chosen[i].tracking} no existe`);
          const d = s.data() as Inbound;
          if (d.status === "void") throw new Error(`Tracking ${chosen[i].tracking} está anulado`);
        });

        // WRITES
        inSnaps.forEach((s, i) => {
          const d = s.data() as Inbound;
          if (d.status !== "boxed") {
            tx.update(inRefs[i], {
              tracking: (d as any).tracking,
              clientId: (d as any).clientId,
              status: "boxed",
              boxedAt: (d as any).boxedAt ?? Date.now(),
              weightLb: Number(chosen[i].weightLb || (d as any).weightLb || 0),
              receivedAt: (d as any).receivedAt ?? null,
            });
          }
        });

        const mergedItems = Array.from(new Set([...(boxData.itemIds || []), ...chosen.map(r => r.id)]));
        tx.update(boxRef, { itemIds: mergedItems, status: boxData.status ?? "open", clientId: boxData.clientId });
      });
    } catch (e: any) {
      const msg = String(e?.message || e);
      notify(msg.includes("reads to be executed before all writes") ? "Error de transacción: leer antes de escribir" : msg, "error");
      return;
    }

    const mergedLocal = Array.from(new Set([...(box.itemIds || []), ...chosen.map(r => r.id)]));
    setBoxes(bs => bs.map(b => b.id === box.id ? { ...b, itemIds: mergedLocal } : b));
    setSelected({});
    await recalcBoxWeight(box.id);
    notify("Items agregados a la caja", "success");
  }

  async function confirmVerifiedWeight(actualLb: number) {
    if (!boxId) return;
    const box = boxes.find(b => b.id === boxId);
    if (!box) return;
    await updateDoc(doc(db, "boxes", box.id), { verifiedWeightLb: actualLb });
    setBoxes(bs => bs.map(b => b.id === box.id ? { ...b, verifiedWeightLb: actualLb } : b));
  }

  // Cerrar la caja y recalcular peso
  async function closeCurrentBox() {
    if (!boxId) return;
    try {
      await runTransaction(db, async (tx) => {
        const boxRef = doc(db, "boxes", boxId);
        const snap = await tx.get(boxRef);
        if (!snap.exists()) throw new Error("Caja no encontrada");
        const data = snap.data() as Box;
        if ((data.itemIds?.length || 0) === 0) throw new Error("No se puede cerrar una caja vacía");
        if (data.status === "closed") return;
        tx.update(boxRef, { status: "closed" });
      });
      await recalcBoxWeight(boxId);
      setBoxes(bs => bs.map(b => b.id === boxId ? { ...b, status: "closed" } : b));
      notify("Caja cerrada", "success");
      setPrintPromptBoxId(boxId);
    } catch (e: any) {
      notify(e?.message || "No se pudo cerrar la caja", "error");
    }
  }

  // Print label helper (using canonical implementation)
  function handlePrintLabel(id: string) {
    const b = boxes.find((x) => x.id === id);
    if (!b || !client) return;
    
    // Get labelRef from box if exists, otherwise fallback to client.code
    const labelRef = (b as any).labelRef || "";
    const reference = labelRef.trim() || client.code;
    const clientCode = client.code;
    const boxCode = b.code;
    
    void printBoxLabel({ reference, clientCode, boxCode });
  }

  return (
    <main className="min-h-[100dvh] bg-[#02120f] text-white flex flex-col items-center p-4 md:p-8 pt-24 md:pt-28">
      <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-4 md:p-6 space-y-4 text-white">
        {notice ? (
          <div
            role="status"
            className={
              `pointer-events-none fixed right-6 top-20 z-[999] rounded-md px-3 py-2 text-sm shadow ring-1 ring-inset ` +
              (notice.type === "success"
                ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/20"
                : notice.type === "error"
                ? "bg-rose-500/15 text-rose-200 ring-rose-500/20"
                : "bg-white/10 text-white/80 ring-white/15")
            }
          >
            {notice.msg}
          </div>
        ) : null}
        {/* Print label modal */}
        {printPromptBoxId ? (
          <div className="fixed inset-0 z-[998] flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-xl bg-[#071f19] border border-white/10 p-5">
              <div className="text-lg font-semibold text-white">Caja cerrada</div>
              <div className="mt-2 text-sm text-white/70">¿Querés imprimir la etiqueta ahora?</div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="h-10 px-4 rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white/90 hover:bg-white/5"
                  onClick={() => setPrintPromptBoxId(null)}
                >
                  Ahora no
                </button>
                <button
                  type="button"
                  className="h-10 px-4 rounded-md bg-[#eb6619] text-white font-medium shadow hover:brightness-110"
                  onClick={() => {
                    const id = printPromptBoxId;
                    setPrintPromptBoxId(null);
                    handlePrintLabel(id);
                  }}
                >
                  Imprimir etiqueta
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <button className="text-sm text-white/70 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#005f40] rounded-sm" onClick={() => router.push("/admin/preparado")}>← Volver</button>
          <h1 className="text-xl font-semibold text-white">Consolidar   {client ? `${client.code} ${client.name}` : "Cargando..."}</h1>
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {boxId ? (
              <div className="space-y-2">
                <div className="rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-4 md:p-5">
                  {(() => {
                    const b = boxes.find(x => x.id === boxId);
                    if (!b) return null;
                    return (
                      <>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm text-white/70">Caja actual:</span>
                          <span className="ml-2 text-lg font-semibold text-white">{b.code}</span>
                          <span>{b.status === "closed" ? <StatusBadge scope="box" status="closed" /> : <StatusBadge scope="box" status="open" />}</span>
                        </div>
                        <div>
                          <span className="text-sm text-white/70">Peso verificado:</span>
                          {typeof b.verifiedWeightLb === "number"
                            ? `${b.verifiedWeightLb.toFixed(2)} lb / ${lbToKg(b.verifiedWeightLb, 2).toFixed(2)} kg`
                            : " "}
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div>
                  <button
                    className="mt-1 inline-flex items-center gap-2 h-10 px-4 rounded-md bg-[#eb6619] text-white font-medium shadow hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619] disabled:opacity-50"
                    onClick={closeCurrentBox}
                    disabled={!boxId || boxes.find(b => b.id === boxId)?.status === "closed"}
                  >Cerrar caja</button>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-4 md:p-5">
                  <div className="text-sm font-medium mb-2 text-white">Verificar peso</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                    <div>
                      <label className="block text-xs text-white/60 mb-1">Peso en libras (lb)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={verifyLb}
                        onChange={(e) => {
                          const v = e.target.value;
                          setVerifyLb(v);
                          const n = Number(v);
                          setVerifyKg(Number.isFinite(n) ? lbToKg(n, 2).toFixed(2) : "");
                        }}
                        className="h-10 w-full rounded-md border border-[#1f3f36] !bg-[#0f2a22] px-3 !text-white caret-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#005f40]"
                        placeholder="0.00"
                        inputMode="decimal"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-white/60 mb-1">Peso en kilogramos (kg)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={verifyKg}
                        onChange={(e) => {
                          const v = e.target.value;
                          setVerifyKg(v);
                          const n = Number(v);
                          setVerifyLb(Number.isFinite(n) ? kgToLb(n, 2).toFixed(2) : "");
                        }}
                        className="h-10 w-full rounded-md border border-[#1f3f36] !bg-[#0f2a22] px-3 !text-white caret-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#005f40]"
                        placeholder="0.00"
                        inputMode="decimal"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white/90 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50"
                      onClick={() => {
                        const n = Number(verifyLb);
                        if (Number.isFinite(n) && n > 0) {
                          void confirmVerifiedWeight(n);
                          setVerifyLb("");
                          setVerifyKg("");
                        }
                      }}
                      disabled={!verifyLb || Number(verifyLb) <= 0}
                    >
                      Confirmar
                    </button>
                    <button
                      className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white/90 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[#005f40]"
                      onClick={() => { setVerifyLb(""); setVerifyKg(""); }}
                      type="button"
                    >
                      Re-pesar
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-white/60">Creá o elegí una caja para registrar el peso de balanza.</p>
            )}
          </div>
        </div>

        <section className="space-y-3 pb-6">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-xs text-white/60">Tipo de envío</label>
              <BrandSelect
                value={boxType}
                onChange={(val) => setBoxType(val as ShipmentType)}
                options={[
                  { value: "COMERCIAL", label: "COMERCIAL" },
                  { value: "FRANQUICIA", label: "FRANQUICIA" },
                ]}
                placeholder="Seleccionar tipo de envío"
              />
            </div>
          </div>

          {anySelected ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-3">
              <span className="text-sm text-white">Caja destino:</span>
              <BrandSelect
                value={bulkBoxId}
                onChange={(val) => {
                  if (val === "__new__") {
                    (async () => {
                      const id = await createBox();
                      if (id) setBulkBoxId(id);
                    })();
                  } else {
                    setBulkBoxId(val);
                  }
                }}
                options={[
                  { value: "", label: "Elegí caja…" },
                  ...eligibleBoxes.map((b) => ({
                    value: b.id,
                    label: `${b.code}`,
                  })),
                  { value: "__new__", label: "+ Agregar caja" },
                ]}
                placeholder="Elegí caja…"
                disabled={false}
              />
              <button
                className="ml-1 px-3 py-1.5 rounded bg-[#eb6619] text-white text-sm font-medium shadow-md hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619] disabled:opacity-50"
                onClick={() => addSelectedToBox(bulkBoxId)}
                disabled={!bulkBoxId || !anySelected}
              >
                Agregar seleccionados
              </button>
              <span className="ml-auto text-xs text-white/60">Total: {fmtWeightPairFromLb(totalLb, 2, 2)}</span>
            </div>
          ) : null}

          <div className="flex items-center justify-between text-xs text-white/70">
            <span>
              Mostrando {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, visibleInbounds.length)} de {visibleInbounds.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="h-8 px-3 rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white/80 hover:bg-white/5 disabled:opacity-50"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Anterior
              </button>
              <span className="text-white/60">Página {page} / {totalPages}</span>
              <button
                type="button"
                className="h-8 px-3 rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white/80 hover:bg-white/5 disabled:opacity-50"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Siguiente
              </button>
            </div>
          </div>
          <div className="mt-2 w-full rounded-md border border-[#1f3f36] bg-[#071f19] ring-1 ring-white/10">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-[#0f2a22]">
                <tr>
                  <th className="p-2 text-white/80 text-xs font-medium">Selec.</th>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Fecha</th>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Tracking</th>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Peso</th>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Caja</th>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Foto</th>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {pagedInbounds.map(r => (
                  <tr key={r.id} className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10">
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          disabled={r.status === "boxed"}
                          checked={!!selected[r.id]}
                          onChange={(e) => setSelected(s => ({ ...s, [r.id]: e.target.checked }))}
                          aria-label="Seleccionar tracking"
                          form={undefined}
                        />
                        {selected[r.id] && r.status !== "boxed" ? (
                          <BrandSelect
                            value={rowBoxChoice[r.id] ?? ""}
                            onChange={(val) => {
                              setRowBoxChoice((m) => ({ ...m, [r.id]: val }));
                              void handleAssignInbound(r.id, val);
                            }}
                            options={[
                              { value: "", label: "Elegí caja…" },
                              ...eligibleBoxes.map((b) => ({
                                value: b.id,
                                label: `${b.code}`,
                              })),
                              { value: "__new__", label: "+ Agregar caja" },
                            ]}
                            placeholder="Elegí caja…"
                            disabled={false}
                          />
                        ) : null}
                      </div>
                    </td>
                    <td className="p-2 text-white">{r.receivedAt ? new Date(r.receivedAt).toLocaleDateString() : "-"}</td>
                    <td className="p-2 font-mono text-white">{r.tracking}</td>
                    <td className="p-2 text-white">{fmtWeightPairFromLb(Number(r.weightLb||0), 2, 2)}</td>
                    <td className="p-2 text-white">
                      {boxByInbound[r.id] ? (
                        <button
                          className="underline text-white/80 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#005f40] rounded-sm"
                          onClick={() => openBoxDetailByBoxId(boxByInbound[r.id].id)}
                        >
                          {boxByInbound[r.id].code}
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="p-2">
                      {r.photoUrl ? (
                        <a href={r.photoUrl} target="_blank" rel="noreferrer" title="Ver foto" aria-label="Ver foto" className="underline text-white/90 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#005f40] rounded-sm">📷</a>
                      ) : (" ")}
                    </td>
                    <td className="p-2">
                      {r.status === "void" ? (
                        <StatusBadge scope="package" status="void" />
                      ) : boxByInbound[r.id]?.code ? (
                        <StatusBadge scope="package" status="boxed" />
                      ) : (
                        <StatusBadge scope="package" status="received" />
                      )}
                    </td>
                  </tr>
                ))}
                {!pagedInbounds.length ? (<tr><td className="p-3 text-white/60" colSpan={7}>Sin trackings.</td></tr>) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <BoxDetailModal {...modalProps} />
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
// Helper para recalcular el peso de una caja
async function recalcBoxWeight(boxId: string) {
  function round2(n: number) { return Math.round(n * 100) / 100; }
  await runTransaction(db, async (tx) => {
    const boxRef = doc(db, "boxes", boxId);
    const snap = await tx.get(boxRef);
    if (!snap.exists()) throw new Error("Caja no encontrada");
    const data = snap.data() as any;
    const itemIds: string[] = Array.isArray(data.itemIds) ? data.itemIds : [];
    let total = 0;
    for (const itemId of itemIds) {
      const inRef = doc(db, "inboundPackages", itemId);
      const inSnap = await tx.get(inRef);
      if (inSnap.exists()) total += Number((inSnap.data() as any).weightLb || 0);
    }
    tx.update(boxRef, { weightLb: round2(total) });
  });
}