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

// --- BrandSelect helper ---
interface BrandOption {
  value: string;
  label: string;
}

interface BrandSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: BrandOption[];
  placeholder: string;
  disabled?: boolean;
}

function BrandSelect({ value, onChange, options, placeholder, disabled }: BrandSelectProps) {
  const [open, setOpen] = useState(false);

  const showLabel = value
    ? options.find((o) => o.value === value)?.label ?? value
    : placeholder;

  const baseClasses =
    "mt-1 h-10 w-full rounded-md border border-slate-300 bg-white text-slate-900 px-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#005f40] focus:border-[#005f40] flex items-center justify-between" +
    (disabled ? " opacity-60 cursor-not-allowed" : " cursor-pointer");

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        disabled={disabled}
        className={baseClasses + (!value ? " text-slate-400" : "")}
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev);
        }}
      >
        <span className="truncate text-left">{showLabel}</span>
        <span className="ml-2 text-slate-500">▾</span>
      </button>
      {open && !disabled && options.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-sm shadow-lg ring-1 ring-black/5">
          {options.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-slate-900 hover:bg-slate-100"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
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
    } catch (e: any) {
      notify(e?.message || "No se pudo cerrar la caja", "error");
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[#02120f] text-white flex flex-col items-center p-4 md:p-8 pt-24 md:pt-28">
      <div className="w-full max-w-6xl bg-white text-neutral-900 rounded-xl shadow-md ring-1 ring-slate-200 p-4 md:p-6 space-y-4">
        {notice ? (
          <div
            role="status"
            className={
              `pointer-events-none fixed right-6 top-20 z-[999] rounded-md px-3 py-2 text-sm shadow ring-1 ring-inset ` +
              (notice.type === "success"
                ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                : notice.type === "error"
                ? "bg-rose-50 text-rose-800 ring-rose-200"
                : "bg-slate-50 text-slate-800 ring-slate-200")
            }
          >
            {notice.msg}
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 rounded border" onClick={() => router.push("/admin/preparado")}>← Volver</button>
          <h1 className="text-xl font-semibold">Consolidar — {client ? `${client.code} — ${client.name}` : "Cargando..."}</h1>
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {boxId ? (
              <div className="space-y-2">
                <div className="text-sm text-slate-700">
                  {(() => {
                    const b = boxes.find(x => x.id === boxId);
                    if (!b) return null;
                    return (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Caja actual:</span> {b.code}
                          <span>{b.status === "closed" ? <StatusBadge scope="box" status="closed" /> : <StatusBadge scope="box" status="open" />}</span>
                        </div>
                        <div>
                          <span className="font-medium">Peso verificado:</span> {typeof b.verifiedWeightLb === "number" ? `${b.verifiedWeightLb.toFixed(2)} lb` : "—"}
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div>
                  <button
                    className="mt-1 inline-flex items-center gap-2 rounded bg-emerald-700 px-3 py-1.5 text-white disabled:opacity-50"
                    onClick={closeCurrentBox}
                    disabled={!boxId || boxes.find(b => b.id === boxId)?.status === "closed"}
                  >Cerrar caja</button>
                </div>
                <div className="rounded border p-3">
                  <div className="text-sm font-medium mb-2">Verificar peso</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                    <div>
                      <label className="block text-xs text-neutral-500 mb-1">Peso en libras (lb)</label>
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
                        className="w-full border rounded px-3 h-10"
                        placeholder="0.00"
                        inputMode="decimal"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-500 mb-1">Peso en kilogramos (kg)</label>
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
                        className="w-full border rounded px-3 h-10"
                        placeholder="0.00"
                        inputMode="decimal"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      className="inline-flex items-center gap-2 rounded bg-[#005f40] px-3 py-1.5 text-white disabled:opacity-50"
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
                      className="inline-flex items-center gap-2 rounded border px-3 py-1.5"
                      onClick={() => { setVerifyLb(""); setVerifyKg(""); }}
                      type="button"
                    >
                      Re-pesar
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded border px-3 py-1.5"
                      type="button"
                      onClick={() => {/* noop */}}
                    >
                      Adjuntar foto
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600">Creá o elegí una caja para registrar el peso de balanza.</p>
            )}
          </div>
        </div>

        <section className="space-y-3">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-xs text-neutral-500">Tipo de envío</label>
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
            <div className="flex items-center gap-2 rounded border bg-neutral-50 p-2">
              <span className="text-sm">Caja destino:</span>
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
                    label: `${b.code} · ${fmtWeightPairFromLb(Number(b.weightLb || 0), 2, 2)} · ${b.itemIds?.length || 0} items`,
                  })),
                  { value: "__new__", label: "+ Agregar caja" },
                ]}
                placeholder="Elegí caja…"
                disabled={!eligibleBoxes.length}
              />
              <button
                className="ml-1 px-3 py-1.5 rounded bg-[#eb6619] text-white text-sm font-medium shadow-md hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619] disabled:opacity-50"
                onClick={() => addSelectedToBox(bulkBoxId)}
                disabled={!bulkBoxId || !anySelected}
              >
                Agregar seleccionados
              </button>
              <span className="ml-auto text-xs text-neutral-600">Total: {fmtWeightPairFromLb(totalLb, 2, 2)}</span>
            </div>
          ) : null}

          <div className="overflow-x-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="p-2">Selec.</th>
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
                                label: `${b.code} · ${fmtWeightPairFromLb(Number(b.weightLb || 0), 2, 2)} · ${b.itemIds?.length || 0} items`,
                              })),
                              { value: "__new__", label: "+ Agregar caja" },
                            ]}
                            placeholder="Elegí caja…"
                            disabled={!eligibleBoxes.length}
                          />
                        ) : null}
                      </div>
                    </td>
                    <td className="p-2">{r.receivedAt ? new Date(r.receivedAt).toLocaleDateString() : "-"}</td>
                    <td className="p-2 font-mono">{r.tracking}</td>
                    <td className="p-2">{fmtWeightPairFromLb(Number(r.weightLb||0), 2, 2)}</td>
                    <td className="p-2">{boxByInbound[r.id]?.code || "-"}</td>
                    <td className="p-2">
                      {r.photoUrl ? (
                        <a href={r.photoUrl} target="_blank" rel="noreferrer" title="Ver foto" aria-label="Ver foto">📷</a>
                      ) : ("—")}
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
                {!visibleInbounds.length ? (<tr><td className="p-3 text-neutral-500" colSpan={7}>Sin trackings.</td></tr>) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
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