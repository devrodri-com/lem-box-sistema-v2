// src/app/admin/preparado/_components/EmbarquesView.tsx
"use client";
import { fmtWeightPairFromLb } from "@/lib/weight";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  where,
  deleteDoc,
  runTransaction,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import type { Client } from "@/types/lem";
import { BrandSelect } from "./BrandSelect";
import {
  type ShipmentType,
  type Box,
  COUNTRY_OPTIONS,
  countryLabel,
  countryMatches,
  IconPlus,
  IconDownload,
} from "./shared";
import { BoxDetailModal } from "@/components/boxes/BoxDetailModal";
import { useBoxDetailModal } from "@/components/boxes/useBoxDetailModal";
import { IconTrash } from "@/components/ui/icons";

const normalizeCountry = (c: unknown) => {
  if (typeof c !== "string") return "";
  const s = c.trim();
  if (!s) return "";
  // Si existe COUNTRY_OPTIONS, map label->value; si no, fallback
  try {
    // @ts-ignore
    const opts = typeof COUNTRY_OPTIONS !== "undefined" ? COUNTRY_OPTIONS : [];
    // @ts-ignore
    const found = Array.isArray(opts) ? opts.find((o: any) => o?.value === s || o?.label === s) : null;
    return (found?.value || s).toUpperCase();
  } catch {
    return s.toUpperCase();
  }
};
const normalizeType = (t: unknown) => (typeof t === "string" ? t.trim().toUpperCase() : "");

async function nextShipmentCode(): Promise<string> {
  const n = Math.floor(Date.now() / 1000) % 100000;
  return `E${String(n).padStart(4, "0")}`;
}

export function EmbarquesView({ btnPrimaryCls, btnSecondaryCls, linkCls }: { btnPrimaryCls?: string, btnSecondaryCls?: string, linkCls?: string }) {
  function fmtDate(ms?: number) {
    if (!ms) return " ";
    try { return new Date(ms).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch { return " "; }
  }

  function exportCSV() {
    const rows = filteredBoxes.map(b => {
      const client = clientsById[b.clientId];
      const label = client ? `${client.code} ${client.name}` : b.clientId;
      const pair = fmtWeightPairFromLb(Number(b.weightLb || 0));
      return [b.code, fmtDate(b.createdAt), label, b.country, b.type, String(b.itemIds?.length || 0), pair];
    });
    const header = ["Caja", "Fecha", "Cliente", "País", "Tipo", "Items", "Peso (lb/kg)"];
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `cajas_${countryLabel(country)}_${type}.csv`; a.click(); URL.revokeObjectURL(url);
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

  const [country, setCountry] = useState<string>("UY");
  const [type, setType] = useState<ShipmentType>("COMERCIAL");
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  // Box detail modal hook
  // Note: setRows is a dummy setter since we don't have an inbounds state here
  // The hook uses it to update inbound status when removing items, but we don't display inbounds
  const { openBoxDetailByBoxId, modalProps, closeModal } = useBoxDetailModal({
    boxes: boxes as Array<{ id: string; code: string; itemIds?: string[]; clientId: string; type?: "COMERCIAL" | "FRANQUICIA"; weightLb?: number; weightOverrideLb?: number | null; labelRef?: string; status?: "open" | "closed" | "shipped" | "delivered" }>,
    setBoxes: setBoxes as unknown as React.Dispatch<React.SetStateAction<Array<Record<string, unknown> & { id: string }>>>,
    setRows: () => {}, // Dummy setter - we don't track inbounds in this view
    clientsById,
    hideItemsWhenOverride: false, // Admin siempre ve items
  });

  const [confirmDelete, setConfirmDelete] = useState<null | { id: string; code: string; clientLabel: string }>(null);
  const [deletingBoxId, setDeletingBoxId] = useState<string>("");
  async function deleteEmptyBox(box: Box) {
    const itemsCount = Array.isArray(box.itemIds) ? box.itemIds.length : 0;
    if (itemsCount > 0) {
      alert("No se puede eliminar una caja con trackings dentro.");
      return;
    }
    if ((box as any).shipmentId) {
      alert("No se puede eliminar una caja que ya está asignada a un embarque.");
      return;
    }

    const client = clientsById[box.clientId];
    const clientLabel = client ? `${client.code} ${client.name}` : box.clientId;
    setConfirmDelete({ id: box.id, code: String(box.code), clientLabel });
  }

  async function confirmDeleteBox() {
    if (!confirmDelete) return;
    setDeletingBoxId(confirmDelete.id);
    try {
      await deleteDoc(doc(db, "boxes", confirmDelete.id));
      setBoxes((prev) => prev.filter((b) => b.id !== confirmDelete.id));
      setPicked((prev) => {
        const next = { ...prev };
        delete next[confirmDelete.id];
        return next;
      });
      if (modalProps.box?.id === confirmDelete.id) {
        closeModal();
      }
      setConfirmDelete(null);
    } catch (e: any) {
      alert(e?.message || "No se pudo eliminar la caja");
    } finally {
      setDeletingBoxId("");
    }
  }

  const [qBox, setQBox] = useState("");
  const [qClient, setQClient] = useState("");


  const [shipments, setShipments] = useState<{ id: string; code: string; country: string; type: ShipmentType; status: string; }[]>([]);
  const [targetShipmentId, setTargetShipmentId] = useState("");

  useEffect(() => {
    // Compatibilidad: hay cajas viejas con country como etiqueta ("Uruguay") y nuevas con código ("UY").
    // Traemos por "type" y filtramos país en cliente admitiendo ambos formatos.
    getDocs(query(
      collection(db, "boxes"),
      where("type", "==", type)
    )).then(s => {
      const all = s.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Box, 'id'>) }));
      const noShipment = all.filter(b => (b as any).shipmentId === null || !("shipmentId" in (b as any)));
      const byCountry = noShipment.filter(b => countryMatches((b as any).country, country));
      setBoxes(byCountry);
    });
    setPicked({});
  }, [country, type]);

  useEffect(() => {
    // Cargar embarques abiertos (sin filtrar por country/type en query para evitar problemas con formato legacy)
    getDocs(query(
      collection(db, "shipments"),
      where("status", "==", "open")
    )).then(s => {
      const list = s.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      const sorted = list.sort((a: any, b: any) => Number(b.openedAt || 0) - Number(a.openedAt || 0));
      const filtered = sorted.filter((sh: any) => {
        return normalizeCountry(sh.country) === normalizeCountry(country) && normalizeType(sh.type) === normalizeType(type);
      });
      setShipments(filtered);
      setTargetShipmentId((prev: string) => (prev && !filtered.find((x: any) => x.id === prev) ? "" : prev));
    }).catch((e) => {
      console.error("Failed to load open shipments", e);
      setShipments([]);
    });
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
        const countries = new Set(boxesData.map(b => normalizeCountry((b as any).country)));
        const types = new Set(boxesData.map(b => normalizeType((b as any).type)));
        if (countries.size !== 1 || types.size !== 1) throw new Error("El embarque debe tener cajas del mismo país y tipo.");
        for (const b of boxesData) {
          if (b.shipmentId) throw new Error(`Caja ${b.code} ya tiene embarque`);
        }

        const normalizedCountry = Array.from(countries)[0];
        const normalizedType = Array.from(types)[0];

        const clientIds = Array.from(new Set(boxesData.map(b => b.clientId)));
        // Construir array de managerUids sin duplicados y sin nulos
        const managerUids = Array.from(new Set(
          boxesData
            .map(b => b.managerUid)
            .filter((uid): uid is string => uid != null && uid !== "")
        ));
        const code = await nextShipmentCode();

        // Crear doc de embarque con id auto
        const shipRef = doc(collection(db, "shipments"));
        tx.set(shipRef, {
          code,
          country: normalizedCountry,
          type: normalizedType,
          boxIds: boxesData.map(b => b.id),
          clientIds,
          managerUids,
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
        const countries = new Set(boxesData.map(b => normalizeCountry((b as any).country)));
        const types = new Set(boxesData.map(b => normalizeType((b as any).type)));
        if (countries.size !== 1 || types.size !== 1) throw new Error("Las cajas deben ser del mismo país y tipo.");
        const normalizedCountry = Array.from(countries)[0];
        const normalizedType = Array.from(types)[0];
        if (normalizeCountry((ship as any).country) !== normalizedCountry || normalizeType((ship as any).type) !== normalizedType) {
          throw new Error("País/tipo no coinciden con el embarque.");
        }
        for (const b of boxesData) {
          if (b.shipmentId) throw new Error(`Caja ${b.code} ya tiene embarque`);
        }

        // Recomputar boxIds, clientIds y managerUids
        const newBoxIds: string[] = Array.from(new Set([...(ship.boxIds || []), ...boxesData.map(b => b.id)]));
        const newClientIds: string[] = Array.from(new Set([...(ship.clientIds || []), ...boxesData.map(b => b.clientId)]));
        
        // Obtener todas las boxes del shipment (las existentes + las nuevas)
        const allBoxIds = newBoxIds;
        const allBoxRefs = allBoxIds.map(id => doc(db, "boxes", id));
        const allBoxSnaps = await Promise.all(allBoxRefs.map(r => tx.get(r)));
        const allBoxesData = allBoxSnaps
          .filter(s => s.exists())
          .map(s => ({ id: s.id, ...(s.data() as any) } as Box));
        
        // Construir array de managerUids sin duplicados y sin nulos
        const managerUids = Array.from(new Set(
          allBoxesData
            .map(b => b.managerUid)
            .filter((uid): uid is string => uid != null && uid !== "")
        ));

        tx.update(shipRef, { boxIds: newBoxIds, clientIds: newClientIds, managerUids });
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
    try {
      await runTransaction(db, async (tx) => {
        const shipRef = doc(db, "shipments", targetShipmentId);
        const shipSnap = await tx.get(shipRef);
        if (!shipSnap.exists()) throw new Error("Embarque no encontrado");
        const ship = shipSnap.data() as any;
        if (ship.status !== "open") throw new Error("El embarque no está abierto");
        const boxIds: string[] = Array.isArray(ship.boxIds) ? ship.boxIds : [];

        // Cerrar embarque y cajas
        tx.update(shipRef, { status: "shipped", closedAt: Date.now() });
        for (const id of boxIds) {
          const boxRef = doc(db, "boxes", id);
          tx.update(boxRef, { status: "closed" });
        }
      });
      // quitar de la lista local
      setShipments(list => list.filter(s => s.id !== targetShipmentId));
      setTargetShipmentId("");
    } catch (e: any) {
      alert(e?.message || "No se pudo cerrar el embarque");
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Cargas (crear embarques con múltiples cajas)</h2>
      <div className="rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-4 md:p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs text-white/60">País</label>
            <BrandSelect
              value={country}
              onChange={(val) => setCountry(val)}
              options={COUNTRY_OPTIONS.map((c) => ({ value: c.value, label: c.label }))}
              placeholder="Seleccionar país"
            />
          </div>
          <div>
            <label className="text-xs text-white/60">Tipo de envío</label>
            <BrandSelect
              value={type}
              onChange={(val) => setType(val as ShipmentType)}
              options={[
                { value: "COMERCIAL", label: "COMERCIAL" },
                { value: "FRANQUICIA", label: "FRANQUICIA" },
              ]}
              placeholder="Seleccionar tipo"
            />
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
            <label className="text-xs text-white/60">
              Agregar cajas seleccionadas a embarque abierto
            </label>
            <BrandSelect
              value={targetShipmentId}
              onChange={(val) => setTargetShipmentId(val)}
              options={[
                { value: "", label: "Seleccionar embarque (abierto)..." },
                ...shipments.map((s) => ({
                  value: s.id,
                  label: `${s.code} · ${s.country} / ${s.type}`,
                })),
              ]}
              placeholder="Seleccionar embarque (abierto)..."
              disabled={!shipments.length}
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:justify-end">
            <button
              className={`${btnSecondaryCls} h-10 px-3 text-sm leading-tight w-full sm:w-auto`}
              onClick={addPickedToShipment}
              disabled={!Object.values(picked).some(Boolean) || !targetShipmentId}
            >
              Agregar a embarque
            </button>
            <button
              className={`${btnSecondaryCls} h-10 px-3 text-sm leading-tight w-full sm:w-auto`}
              onClick={closeShipment}
              disabled={!targetShipmentId}
            >
              Cerrar embarque
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input className="h-10 w-full rounded-md border border-[#1f3f36] !bg-[#0f2a22] px-3 !text-white caret-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#005f40]" placeholder="Buscar caja (código)" value={qBox} onChange={(e)=> setQBox(e.target.value)} />
          <input className="h-10 w-full rounded-md border border-[#1f3f36] !bg-[#0f2a22] px-3 !text-white caret-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#005f40]" placeholder="Buscar cliente" value={qClient} onChange={(e)=> setQClient(e.target.value)} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-[#1f3f36] bg-[#071f19] ring-1 ring-white/10">
        <table className="w-full text-sm tabular-nums">
          <thead className="sticky top-0 z-10 bg-[#0f2a22] shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)]">
            <tr>
              <th className="p-2 text-white/80 text-xs font-medium">Sel</th>
              <th className="text-left p-2 text-white/80 text-xs font-medium">Caja</th>
              <th className="text-left p-2 text-white/80 text-xs font-medium">Fecha</th>
              <th className="text-left p-2 text-white/80 text-xs font-medium">Cliente</th>
              <th className="text-left p-2 text-white/80 text-xs font-medium">País</th>
              <th className="text-left p-2 text-white/80 text-xs font-medium">Tipo</th>
              <th className="text-right p-2 text-white/80 text-xs font-medium">Items</th>
              <th className="text-right p-2 text-white/80 text-xs font-medium">Peso</th>
              <th className="text-right p-2 text-white/80 text-xs font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredBoxes.map(b => (
              <tr key={b.id} className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10 h-11">
                <td className="p-2"><input type="checkbox" checked={!!picked[b.id]} onChange={(e)=> setPicked(s=> ({...s, [b.id]: e.target.checked}))} /></td>
                <td className="p-2 font-mono"><button className={linkCls} onClick={() => openBoxDetailByBoxId(b.id)}>{b.code}</button></td>
                <td className="p-2">{fmtDate(b.createdAt)}</td>
                <td className="p-2">{clientsById[b.clientId] ? `${clientsById[b.clientId].code} ${clientsById[b.clientId].name}` : b.clientId}</td>
                <td className="p-2">{countryLabel(b.country)}</td>
                <td className="p-2">{b.type}</td>
                <td className="p-2 text-right tabular-nums">{b.itemIds?.length || 0}</td>
                <td className="p-2 text-right tabular-nums">{fmtWeightPairFromLb(Number(b.weightLb || 0))}</td>
                <td className="p-2 text-right">
                  {((b.itemIds?.length || 0) === 0 && !(b as any).shipmentId) ? (
                    <button
                      type="button"
                      className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-red-500/70 bg-[#0f2a22] text-red-300 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-red-500"
                      title="Eliminar caja"
                      aria-label="Eliminar caja"
                      onClick={() => deleteEmptyBox(b)}
                      disabled={deletingBoxId === b.id}
                    >
                      <IconTrash />
                    </button>
                  ) : (
                    <span className="text-white/40">-</span>
                  )}
                </td>
              </tr>
            ))}
            {!filteredBoxes.length ? (
              <tr><td className="p-3 text-white/60" colSpan={9}>No hay cajas sin embarque para los filtros actuales.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="text-sm text-white/70">Total seleccionado: {fmtWeightPairFromLb(totalLb)}</div>

      {confirmDelete ? (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center">
          <div className="w-[95vw] max-w-lg rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm shadow-xl p-4 md:p-6 text-white">
            <h3 className="text-lg font-semibold">Eliminar caja</h3>
            <p className="mt-2 text-sm text-white/70">
              Seguro querés borrar la caja <b>{confirmDelete.code}</b> del cliente <b>{confirmDelete.clientLabel}</b>?
            </p>
            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                className="h-10 px-4 rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white/90 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[#005f40]"
                onClick={() => setConfirmDelete(null)}
                disabled={!!deletingBoxId}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="h-10 px-4 rounded-md bg-red-600 text-white font-medium hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                onClick={confirmDeleteBox}
                disabled={!!deletingBoxId}
              >
                {deletingBoxId ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <BoxDetailModal {...modalProps} />

    </section>
  );
}

