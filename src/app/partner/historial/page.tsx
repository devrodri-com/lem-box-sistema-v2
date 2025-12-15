// src/app/partner/historial/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { fmtWeightPairFromLb } from "@/lib/weight";
import StatusBadge from "@/components/ui/StatusBadge";
import { usePartnerContext } from "@/components/PartnerContext";
import type { Client, Inbound, Box } from "@/types/lem";
import { chunk } from "@/lib/utils";
import { BoxDetailModal } from "@/components/boxes/BoxDetailModal";
import { useBoxDetailModal } from "@/components/boxes/useBoxDetailModal";

const LIMIT_INITIAL = 100;

export default function PartnerHistorialPage() {
  const { scopedClientIds, effectiveRole, uid, roleResolved } = usePartnerContext();
  const [inbounds, setInbounds] = useState<Inbound[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const setBoxesWrapper = (updater: React.SetStateAction<any[]>) => {
    if (typeof updater === "function") {
      setBoxes((prev) => updater(prev.filter((b) => b.id) as any[]) as Box[]);
    } else {
      setBoxes(updater as Box[]);
    }
  };
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  const clientsById = useMemo(() => {
    const m: Record<string, Client> = {};
    clients.forEach((c) => {
      if (c.id) m[c.id] = c;
    });
    return m;
  }, [clients]);

  // Box detail modal hook
  const { openBoxDetailByBoxId, modalProps } = useBoxDetailModal({
    boxes: boxes.filter((b) => b.id) as any[], // Filter boxes with id and cast to expected type
    setBoxes: setBoxesWrapper,
    setRows: () => {}, // Read-only, no actualizamos inbounds
    clientsById,
  });

  // Mapa inboundId -> Box
  const boxByInbound = useMemo(() => {
    const m: Record<string, Box> = {};
    for (const b of boxes) {
      for (const id of b.itemIds || []) {
        m[id] = b;
      }
    }
    return m;
  }, [boxes]);

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
        console.error("[PartnerHistorial] Error loading clients:", err);
        setClients([]);
      }
    }
    void loadClients();
  }, [scopedClientIds, uid, roleResolved]);

  // Cargar cajas (necesarias para boxByInbound)
  useEffect(() => {
    if (!roleResolved || !uid || scopedClientIds.length === 0) {
      setBoxes([]);
      return;
    }

    async function loadBoxes() {
      const chunks = chunk(scopedClientIds, 10);
      const boxPromises = chunks.map((chunkIds) =>
        getDocs(query(collection(db, "boxes"), where("clientId", "in", chunkIds)))
      );

      try {
        const boxSnaps = await Promise.all(boxPromises);
        const loadedBoxes: Box[] = [];
        const seenIds = new Set<string>();

        boxSnaps.forEach((snap) => {
          snap.docs.forEach((d) => {
            const boxId = d.id;
            if (!seenIds.has(boxId)) {
              seenIds.add(boxId);
              loadedBoxes.push({ id: boxId, ...(d.data() as Omit<Box, "id">) });
            }
          });
        });
        setBoxes(loadedBoxes);
      } catch (err) {
        console.error("[PartnerHistorial] Error loading boxes:", err);
        setBoxes([]);
      }
    }
    void loadBoxes();
  }, [scopedClientIds, uid, roleResolved]);

  // Cargar inbounds
  useEffect(() => {
    if (!roleResolved || !uid || scopedClientIds.length === 0) {
      setInbounds([]);
      setLoading(false);
      return;
    }

    async function loadInbounds() {
      setLoading(true);
      const chunks = chunk(scopedClientIds, 10);
      const inboundPromises = chunks.map((chunkIds) =>
        getDocs(
          query(
            collection(db, "inboundPackages"),
            where("clientId", "in", chunkIds),
            orderBy("receivedAt", "desc"),
            limit(LIMIT_INITIAL)
          )
        )
      );

      try {
        const inboundSnaps = await Promise.all(inboundPromises);
        const loadedInbounds: Inbound[] = [];
        const seenIds = new Set<string>();

        inboundSnaps.forEach((snap) => {
          snap.docs.forEach((d) => {
            const inboundId = d.id;
            if (!seenIds.has(inboundId)) {
              seenIds.add(inboundId);
              loadedInbounds.push({ id: inboundId, ...(d.data() as Omit<Inbound, "id">) });
            }
          });
        });

        // Ordenar por receivedAt desc (puede haber duplicados entre chunks)
        loadedInbounds.sort((a, b) => {
          const aTime = a.receivedAt || 0;
          const bTime = b.receivedAt || 0;
          return bTime - aTime;
        });

        setInbounds(loadedInbounds.slice(0, LIMIT_INITIAL));
        setHasMore(loadedInbounds.length >= LIMIT_INITIAL);
      } catch (err) {
        console.error("[PartnerHistorial] Error loading inbounds:", err);
        setInbounds([]);
      } finally {
        setLoading(false);
      }
    }
    void loadInbounds();
  }, [scopedClientIds, uid, roleResolved]);

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
      <h2 className="text-xl font-semibold text-white">Historial de Trackings</h2>

      {loading ? (
        <div className="text-sm text-white/60">Cargando trackings…</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-[#1f3f36] bg-[#071f19] ring-1 ring-white/10">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-[#0f2a22]">
                <tr>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Fecha</th>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Tracking</th>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Carrier</th>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Cliente</th>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Peso</th>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Estado</th>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Caja</th>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Foto</th>
                </tr>
              </thead>
              <tbody>
                {inbounds
                  .filter((r) => r.id) // Solo inbounds con id
                  .map((r) => {
                    const c = clientsById[r.clientId];
                    const cliente = c?.code ? c.code : r.clientId;
                    const box = r.id ? boxByInbound[r.id] : undefined;
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10"
                    >
                      <td className="p-2 text-white">
                        {r.receivedAt ? new Date(r.receivedAt).toLocaleDateString() : "-"}
                      </td>
                      <td className="p-2 font-mono text-white">{r.tracking}</td>
                      <td className="p-2 text-white">{r.carrier}</td>
                      <td className="p-2 text-white">{cliente}</td>
                      <td className="p-2 text-white">
                        {fmtWeightPairFromLb(Number(r.weightLb || 0))}
                      </td>
                      <td className="p-2">
                        {r.status === "void" ? (
                          <StatusBadge scope="package" status="void" />
                        ) : box ? (
                          <StatusBadge scope="package" status="boxed" />
                        ) : (
                          <StatusBadge scope="package" status="received" />
                        )}
                      </td>
                      <td className="p-2 text-white">
                        {box && box.id ? (
                          <button
                            className="underline text-white/80 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#005f40] rounded-sm"
                            onClick={() => {
                              if (box.id) openBoxDetailByBoxId(box.id);
                            }}
                          >
                            {box.code}
                          </button>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="p-2">
                        {r.photoUrl ? (
                          <a
                            href={r.photoUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Ver foto"
                            aria-label="Ver foto"
                            className="underline text-white/90 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#005f40] rounded-sm"
                          >
                            📷
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!inbounds.length ? (
                  <tr>
                    <td colSpan={8} className="p-3 text-white/60">
                      Sin trackings.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="text-sm text-white/60 text-center">
              Mostrando los primeros {LIMIT_INITIAL} trackings.
            </div>
          )}
        </>
      )}

      {process.env.NODE_ENV === "development" && (
        <div className="mt-4 p-3 rounded-md bg-[#0f2a22] border border-[#1f3f36] text-xs font-mono text-white/70 space-y-1">
          <div>uid: {uid}</div>
          <div>effectiveRole: {effectiveRole}</div>
          <div>scopedClientIds.length: {scopedClientIds.length}</div>
          <div>inbounds.length: {inbounds.length}</div>
          <div>boxes.length: {boxes.length}</div>
        </div>
      )}

      <BoxDetailModal {...modalProps} />
    </div>
  );
}
