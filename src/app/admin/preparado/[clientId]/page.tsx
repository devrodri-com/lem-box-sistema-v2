// src/app/admin/preparado/[clientId]/page.tsx
"use client";
import RequireAuth from "@/components/RequireAuth";
import { db } from "@/lib/firebase";
import { collection, doc, getDocs, query, where, addDoc, updateDoc, runTransaction } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Client } from "@/types/lem";
import StepProgress from "@/components/ui/StepProgress";
import WeightCheckCard from "@/components/ui/WeightCheckCard";
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

  const hasBoxWithItems = useMemo(
    () => boxes.some(b => b.clientId === clientId && (b.itemIds?.length || 0) > 0 && !b.shipmentId),
    [boxes, clientId]
  );

  async function createBox(presetType?: ShipmentType): Promise<string | null> {
    if (!client) return null;
    const t = presetType ?? boxType;
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
    };
    const ref = await addDoc(collection(db, "boxes"), payload);
    setBoxes(prev => [{ id: ref.id, ...payload }, ...prev]);
    setBoxId(ref.id);
    notify("Caja creada", "success");
    return ref.id;
  }

  async function addItemsToBox(targetBoxId: string, itemIds: string[]): Promise<void> {
    const box = boxes.find(b => b.id === targetBoxId);
    if (!box) return;
    if (box.status === "closed") { notify("La caja está cerrada.", "error"); return; }
    const chosen = inbounds.filter(r => itemIds.includes(r.id));
    const newItems = Array.from(new Set([...(box.itemIds || []), ...chosen.map(r => r.id)]));
    await updateDoc(doc(db, "boxes", box.id), { itemIds: newItems });
    await Promise.all(chosen.map(r => updateDoc(doc(db, "inboundPackages", r.id), { status: "boxed" })));
    await recalcBoxWeight(box.id);
    setBoxes(bs => bs.map(b => b.id === box.id ? { ...b, itemIds: newItems } : b));
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
      await addItemsToBox(newId, [inboundId]);
      setSelected(s => ({ ...s, [inboundId]: false }));
      setRowBoxChoice(m => ({ ...m, [inboundId]: "" }));
      return;
    }

    // existing box
    const target = boxes.find(b => b.id === value);
    if (!target) return;
    if (target.clientId !== clientId) { notify("La caja elegida pertenece a otro cliente.", "error"); return; }
    if (target.type !== boxType) { notify("El tipo de la caja no coincide con el tipo seleccionado.", "error"); return; }
    if (target.shipmentId) { notify("La caja ya está asociada a un embarque.", "error"); return; }

    await addItemsToBox(target.id, [inboundId]);
    notify("Tracking agregado a la caja", "success");
    setSelected(s => ({ ...s, [inboundId]: false }));
    setRowBoxChoice(m => ({ ...m, [inboundId]: "" }));
  }

  async function addSelectedToBox() {
    if (!client || !boxId) return;
    const box = boxes.find(b => b.id === boxId);
    if (!box) return;
    if (box.clientId !== clientId) { notify("La caja elegida pertenece a otro cliente.", "error"); return; }
    if (box.type !== boxType) { notify("El tipo de la caja no coincide con el tipo seleccionado.", "error"); return; }
    if (box.status === "closed") { notify("La caja está cerrada.", "error"); return; }
    const chosenIds = Object.keys(selected).filter(id => selected[id]);
    if (!chosenIds.length) return;
    const chosen = inbounds.filter(r => chosenIds.includes(r.id));
    const newItems = Array.from(new Set([...(box.itemIds || []), ...chosen.map(r => r.id)]));
    await updateDoc(doc(db, "boxes", box.id), { itemIds: newItems });
    await Promise.all(chosen.map(r => updateDoc(doc(db, "inboundPackages", r.id), { status: "boxed" })));
    await recalcBoxWeight(box.id);
    setBoxes(bs => bs.map(b => b.id === box.id ? { ...b, itemIds: newItems } : b));
    setSelected({});
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
    <main className="p-4 md:p-8 space-y-4">
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
        <StepProgress current={hasBoxWithItems ? "consolidado" : "recibido"} />
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
              <WeightCheckCard
                // sin peso esperado: solo registramos el valor de la balanza
                onConfirm={(actual) => {
                  if (typeof actual === "number" && isFinite(actual) && actual > 0) {
                    void confirmVerifiedWeight(actual);
                  }
                }}
                onRetake={() => console.log("re-pesar")}
                onAttachPhoto={() => console.log("adjuntar foto")}
              />
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
            <select className="border rounded p-2 w-full" value={boxType} onChange={(e) => setBoxType(e.target.value as ShipmentType)}>
              <option value="COMERCIAL">COMERCIAL</option>
              <option value="FRANQUICIA">FRANQUICIA</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto border rounded">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="p-2">Sel / Caja destino</th>
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
                      />
                      {selected[r.id] && r.status !== "boxed" ? (
                        <select
                          className="border rounded p-1 text-xs"
                          value={rowBoxChoice[r.id] ?? ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRowBoxChoice(m => ({ ...m, [r.id]: val }));
                            void handleAssignInbound(r.id, val);
                          }}
                          aria-label="Elegir caja destino"
                        >
                          <option value="" disabled>Elegí caja…</option>
                          {eligibleBoxes.map(b => (
                            <option key={b.id} value={b.id}>{b.code} · {(b.weightLb * LB_TO_KG).toFixed(2)} kg · {b.itemIds?.length || 0} items</option>
                          ))}
                          <option value="__new__">+ Agregar caja</option>
                        </select>
                      ) : null}
                    </div>
                  </td>
                  <td className="p-2">{r.receivedAt ? new Date(r.receivedAt).toLocaleDateString() : "-"}</td>
                  <td className="p-2 font-mono">{r.tracking}</td>
                  <td className="p-2">{(Number(r.weightLb||0)*LB_TO_KG).toFixed(2)} kg</td>
                  <td className="p-2">{boxByInbound[r.id]?.code || "-"}</td>
                  <td className="p-2">{r.photoUrl ? (<a href={r.photoUrl} target="_blank" title="Ver foto" aria-label="Ver foto">📷</a>) : ("—")}</td>
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

        <div className="flex items-center gap-3">
          <div className="text-sm text-neutral-700">Total seleccionado: {(totalLb*LB_TO_KG).toFixed(2)} kg</div>
          <button
            className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
            onClick={addSelectedToBox}
            disabled={!boxId || boxes.find(b => b.id === boxId)?.status === "closed" || !Object.values(selected).some(Boolean)}
          >Agregar a caja</button>
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