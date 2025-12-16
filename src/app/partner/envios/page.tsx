// src/app/partner/envios/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import StatusBadge from "@/components/ui/StatusBadge";
import { usePartnerContext } from "@/components/PartnerContext";
import type { Client, Box, Shipment } from "@/types/lem";
import { chunk } from "@/lib/utils";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}
function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
}
function asBoxStatus(v: unknown): Box["status"] | undefined {
  return v === "open" || v === "shipped" || v === "closed" || v === "delivered" ? v : undefined;
}
function asShipmentType(v: unknown): Shipment["type"] | undefined {
  return v === "COMERCIAL" || v === "FRANQUICIA" ? v : undefined;
}
function asShipmentStatus(v: unknown): Shipment["status"] | undefined {
  return v === "open" || v === "shipped" || v === "arrived" || v === "closed" ? v : undefined;
}

type PartnerBox = Box & { shipmentId?: string };

export default function PartnerEnviosPage() {
  const { scopedClientIds, effectiveRole, uid, roleResolved } = usePartnerContext();
  const [clients, setClients] = useState<Client[]>([]);
  const [boxes, setBoxes] = useState<PartnerBox[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);

  const clientsById = useMemo(() => {
    const m: Record<string, Client> = {};
    clients.forEach((c) => {
      if (c.id) m[c.id] = c;
    });
    return m;
  }, [clients]);

  // Calcular resumen por shipment: cajas del partner y clientes involucrados
  const shipmentSummary = useMemo(() => {
    const summary: Record<string, { boxCount: number; clientCodes: string[] }> = {};
    shipments.forEach((s) => {
      if (!s.id) return;
      const partnerBoxes = boxes.filter((b) => b.shipmentId === s.id);
      const clientIdsInShipment = Array.from(new Set(partnerBoxes.map((b) => b.clientId)));
      const clientCodes = clientIdsInShipment
        .map((cid) => clientsById[cid]?.code)
        .filter((code): code is string => !!code);
      summary[s.id] = {
        boxCount: partnerBoxes.length,
        clientCodes,
      };
    });
    return summary;
  }, [shipments, boxes, clientsById]);

  // Cargar clientes
  useEffect(() => {
    if (!roleResolved || !uid) return;
    if (scopedClientIds.length === 0) {
      setClients([]);
      return;
    }

    async function loadClients() {
      const chunks = chunk(scopedClientIds, 10);
      const clientPromises = chunks.map((chunkIds) =>
        Promise.all(chunkIds.map((id) => getDoc(doc(db, "clients", id))))
      );

      try {
        const clientSnaps = await Promise.all(clientPromises);
        const loadedClients: Client[] = [];
        clientSnaps.forEach((chunkSnaps, chunkIdx) => {
          chunkSnaps.forEach((snap, idx) => {
            if (snap.exists()) {
              const chunkIds = chunks[chunkIdx];
              const cid = chunkIds[idx];
              loadedClients.push({ id: cid, ...(snap.data() as Omit<Client, "id">) });
            }
          });
        });
        setClients(loadedClients);
      } catch (err) {
        console.error("[PartnerEnvios] Error loading clients:", err);
        setClients([]);
      }
    }
    void loadClients();
  }, [scopedClientIds, uid, roleResolved]);

  // Cargar cajas
  useEffect(() => {
    if (!roleResolved || !uid || scopedClientIds.length === 0) {
      setBoxes([]);
      setShipments([]);
      setShipmentsLoading(false);
      setLoading(false);
      return;
    }

    async function loadBoxes() {
      setLoading(true);
      const chunks = chunk(scopedClientIds, 10);
      const boxPromises = chunks.map((chunkIds) =>
        getDocs(query(collection(db, "boxes"), where("clientId", "in", chunkIds)))
      );

      try {
        const boxSnaps = await Promise.all(boxPromises);
        const loadedBoxes: PartnerBox[] = [];
        const seenIds = new Set<string>();

        boxSnaps.forEach((snap) => {
          snap.docs.forEach((d) => {
            const boxId = d.id;
            if (!seenIds.has(boxId)) {
              seenIds.add(boxId);
              const rec = asRecord(d.data());
              const shipmentId = asString(rec?.shipmentId);
              const b: PartnerBox = {
                id: boxId,
                code: asString(rec?.code) ?? "",
                clientId: asString(rec?.clientId) ?? "",
                status: asBoxStatus(rec?.status) ?? "open",
                itemIds: asStringArray(rec?.itemIds),
                weightLb: asNumber(rec?.weightLb) ?? 0,
                ...(asString(rec?.country) ? { country: asString(rec?.country) } : {}),
                ...(asString(rec?.type) ? { type: asString(rec?.type) } : {}),
                ...(shipmentId ? { shipmentId } : {}),
              };
              loadedBoxes.push(b);
            }
          });
        });
        setBoxes(loadedBoxes);
      } catch (err) {
        console.error("[PartnerEnvios] Error loading boxes:", err);
        setBoxes([]);
      } finally {
        setLoading(false);
      }
    }
    void loadBoxes();
  }, [scopedClientIds, uid, roleResolved]);

  // Derivar shipments desde las cajas
  useEffect(() => {
    if (boxes.length === 0) {
      setShipments([]);
      return;
    }

    async function loadShipments() {
      setShipmentsLoading(true);
      // Recolectar shipmentIds únicos de las cajas
      const shipmentIds = Array.from(new Set(boxes.map((b) => b.shipmentId).filter((x): x is string => !!x)));

      if (shipmentIds.length === 0) {
        setShipments([]);
        setShipmentsLoading(false);
        return;
      }

      // Cargar shipments en paralelo
      const shipmentPromises = shipmentIds.map((sid) =>
        getDoc(doc(db, "shipments", sid)).catch(() => null)
      );

      try {
        const shipmentSnaps = await Promise.all(shipmentPromises);
        const loadedShipments: Shipment[] = [];
        shipmentSnaps.forEach((snap, idx) => {
          if (!snap?.exists()) return;

          const rec = asRecord(snap.data());
          const id = shipmentIds[idx];

          const s: Shipment = {
            id,
            code: asString(rec?.code) ?? "",
            country: asString(rec?.country) ?? "",
            type: asShipmentType(rec?.type) ?? "COMERCIAL",
            status: asShipmentStatus(rec?.status) ?? "open",
            boxIds: asStringArray(rec?.boxIds),
            clientIds: asStringArray(rec?.clientIds),
            managerUids: asStringArray(rec?.managerUids),
            openedAt: asNumber(rec?.openedAt),
            closedAt: asNumber(rec?.closedAt),
            arrivedAt: asNumber(rec?.arrivedAt),
          };

          loadedShipments.push(s);
        });
        setShipments(loadedShipments);

        // Logs temporales en dev
        if (process.env.NODE_ENV === "development") {
          console.log("[PartnerEnvios] shipmentIds.length:", shipmentIds.length);
          console.log("[PartnerEnvios] shipments.length:", loadedShipments.length);
        }
      } catch (err) {
        console.error("[PartnerEnvios] Error loading shipments:", err);
        setShipments([]);
      } finally {
        setShipmentsLoading(false);
      }
    }
    void loadShipments();
  }, [boxes]);

  // Logs temporales en dev
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.log("[PartnerEnvios] scopedClientIds.length:", scopedClientIds.length);
      console.log("[PartnerEnvios] boxes.length:", boxes.length);
    }
  }, [scopedClientIds.length, boxes.length]);

  if (!roleResolved) {
    return (
      <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 space-y-4">
        <p className="text-sm text-white/60">Cargando permisos…</p>
      </div>
    );
  }

  if (scopedClientIds.length === 0) {
    return (
      <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-red-400/30 backdrop-blur-sm p-6 space-y-4 text-center">
        <h2 className="text-xl font-semibold text-white">No tenés clientes asociados</h2>
        <p className="text-sm text-white/60">
          Contacta a un administrador para que te asigne clientes.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 space-y-4">
      <h2 className="text-xl font-semibold text-white">Envíos</h2>

      {loading || shipmentsLoading ? (
        <div className="text-sm text-white/60">Cargando envíos…</div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[#1f3f36] bg-[#071f19] ring-1 ring-white/10">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-[#0f2a22]">
              <tr>
                <th className="text-left p-2 text-white/80 text-xs font-medium">Embarque</th>
                <th className="text-left p-2 text-white/80 text-xs font-medium">País/Tipo</th>
                <th className="text-left p-2 text-white/80 text-xs font-medium">Estado</th>
                <th className="text-left p-2 text-white/80 text-xs font-medium">Resumen</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((s) => {
                const summary = shipmentSummary[s.id || ""];
                return (
                  <tr
                    key={s.id}
                    className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10"
                  >
                    <td className="p-2 font-mono text-white">{s.code || s.id}</td>
                    <td className="p-2 text-white">
                      {(s.country || "—")} / {(s.type || "—")}
                    </td>
                    <td className="p-2">
                      {s.status ? (
                        <StatusBadge scope="shipment" status={s.status} />
                      ) : (
                        " "
                      )}
                    </td>
                    <td className="p-2 text-white/80 text-xs">
                      {summary ? (
                        <>
                          {summary.boxCount} {summary.boxCount === 1 ? "caja" : "cajas"}
                          {summary.clientCodes.length > 0 && (
                            <> · {summary.clientCodes.join(", ")}</>
                          )}
                        </>
                      ) : (
                        " "
                      )}
                    </td>
                  </tr>
                );
              })}
              {!shipments.length ? (
                <tr>
                  <td colSpan={4} className="p-3 text-white/60">
                    Sin envíos.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {process.env.NODE_ENV === "development" && (
        <div className="mt-4 p-3 rounded-md bg-[#0f2a22] border border-[#1f3f36] text-xs font-mono text-white/70 space-y-1">
          <div>uid: {uid}</div>
          <div>effectiveRole: {effectiveRole}</div>
          <div>scopedClientIds.length: {scopedClientIds.length}</div>
          <div>boxes.length: {boxes.length}</div>
          <div>shipments.length: {shipments.length}</div>
        </div>
      )}
    </div>
  );
}
