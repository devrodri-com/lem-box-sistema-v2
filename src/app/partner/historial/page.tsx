// src/app/partner/historial/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { fmtWeightPairFromLb } from "@/lib/weight";
import StatusBadge from "@/components/ui/StatusBadge";
import { BrandSelect } from "@/components/ui/BrandSelect";
import { IconPhoto } from "@/components/ui/icons";
import { usePartnerContext } from "@/components/PartnerContext";
import type { Client, Inbound, Box } from "@/types/lem";
import { chunk } from "@/lib/utils";
import { BoxDetailModal } from "@/components/boxes/BoxDetailModal";
import { useBoxDetailModal } from "@/components/boxes/useBoxDetailModal";

// Helpers para parse seguro de datos de Firestore
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

const LIMIT_INITIAL = 100;

const CONTROL_BORDER = "border-[#1f3f36]";
const inputCls = `h-10 w-full rounded-md border ${CONTROL_BORDER} bg-[#0f2a22] px-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#005f40]`;
const INPUT_BG_STYLE = {
  backgroundColor: "#0f2a22",
  WebkitBoxShadow: "0 0 0px 1000px #0f2a22 inset",
  WebkitTextFillColor: "#ffffff",
} as const;

const TZ = "America/New_York";
function tzOffsetMs(date: Date, timeZone: string): number {
  const inTz = new Date(date.toLocaleString("en-US", { timeZone }));
  return inTz.getTime() - date.getTime();
}
function zonedStartOfDayUtcMs(yyyyMmDd: string, timeZone = TZ): number {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const utc = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0));
  const off = tzOffsetMs(utc, timeZone);
  return utc.getTime() - off;
}
function zonedEndOfDayUtcMs(yyyyMmDd: string, timeZone = TZ): number {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const utc = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 23, 59, 59, 999));
  const off = tzOffsetMs(utc, timeZone);
  return utc.getTime() - off;
}

export default function PartnerHistorialPage() {
  const { scopedClientIds, effectiveRole, uid, roleResolved } = usePartnerContext();
  const [inbounds, setInbounds] = useState<Inbound[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const setBoxesWrapper = (updater: React.SetStateAction<Box[]>) => {
    if (typeof updater === "function") {
      setBoxes((prev) => updater(prev.filter((b) => b.id && typeof b.id === "string")));
    } else {
      setBoxes(updater);
    }
  };
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  const [qClient, setQClient] = useState("");
  const [qTracking, setQTracking] = useState("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "received" | "boxed">("all");

  const clientsById = useMemo(() => {
    const m: Record<string, Client> = {};
    clients.forEach((c) => {
      if (c.id) m[c.id] = c;
    });
    return m;
  }, [clients]);

  // Box detail modal hook
  const boxesForModal = useMemo(() => {
    return boxes
      .filter((b): b is Box & { id: string } => typeof b.id === "string" && b.id.length > 0)
      .map((b) => {
        const rec = asRecord(b as unknown);
        const labelRef = asString(rec?.labelRef);
        const typeRaw = asString(rec?.type);
        const type: "COMERCIAL" | "FRANQUICIA" | undefined =
          typeRaw === "COMERCIAL" || typeRaw === "FRANQUICIA" ? typeRaw : undefined;
        return {
          id: b.id,
          code: b.code,
          clientId: b.clientId,
          itemIds: b.itemIds,
          weightLb: b.weightLb,
          status: b.status,
          ...(labelRef ? { labelRef } : {}),
          ...(type ? { type } : {}),
        };
      });
  }, [boxes]);

  const { openBoxDetailByBoxId, modalProps } = useBoxDetailModal({
    boxes: boxesForModal,
    setBoxes: setBoxesWrapper as unknown as React.Dispatch<React.SetStateAction<Array<Record<string, unknown> & { id: string }>>>,
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
              const rec = asRecord(snap.data());
              if (rec) {
                const code = asString(rec.code) ?? "";
                const name = asString(rec.name) ?? "";
                const country = asString(rec.country) ?? "";
                const email = asString(rec.email);
                loadedClients.push({
                  id: cid,
                  code,
                  name,
                  country,
                  email,
                });
              }
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
            if (!seenIds.has(boxId) && boxId) {
              seenIds.add(boxId);
              const rec = asRecord(d.data());
              if (rec) {
                const code = asString(rec.code) ?? "";
                const clientId = asString(rec.clientId) ?? "";
                const status = asString(rec.status) as Box["status"] | undefined;
                const itemIds = asStringArray(rec.itemIds);
                const weightLb = asNumber(rec.weightLb);
                loadedBoxes.push({
                  id: boxId,
                  code,
                  clientId,
                  status: status || "open",
                  itemIds,
                  weightLb,
                });
              }
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
      const inboundPromises = chunks.map((chunkIds) => {
        let qBase = query(
          collection(db, "inboundPackages"),
          where("clientId", "in", chunkIds),
          orderBy("receivedAt", "desc"),
          limit(LIMIT_INITIAL)
        );
        if (dateFrom) qBase = query(qBase, where("receivedAt", ">=", zonedStartOfDayUtcMs(dateFrom)));
        if (dateTo) qBase = query(qBase, where("receivedAt", "<=", zonedEndOfDayUtcMs(dateTo)));
        return getDocs(qBase);
      });

      try {
        const inboundSnaps = await Promise.all(inboundPromises);
        const loadedInbounds: Inbound[] = [];
        const seenIds = new Set<string>();

        inboundSnaps.forEach((snap) => {
          snap.docs.forEach((d) => {
            const inboundId = d.id;
            if (!seenIds.has(inboundId) && inboundId) {
              seenIds.add(inboundId);
              const rec = asRecord(d.data());
              if (rec) {
                const tracking = asString(rec.tracking) ?? "";
                const carrierRaw = asString(rec.carrier);
                const carrier = carrierRaw as Inbound["carrier"] | undefined;
                const clientId = asString(rec.clientId) ?? "";
                // Filtrar docs sin clientId válido
                if (!clientId) {
                  return;
                }
                const weightLb = asNumber(rec.weightLb) ?? 0;
                const photoUrl = asString(rec.photoUrl);
                const status = asString(rec.status);
                const receivedAt = asNumber(rec.receivedAt);
                loadedInbounds.push({
                  id: inboundId,
                  tracking,
                  carrier: carrier || "Other",
                  clientId,
                  weightLb,
                  photoUrl,
                  status: status as Inbound["status"] | undefined,
                  receivedAt,
                });
              }
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
        setHasMore(loadedInbounds.length > LIMIT_INITIAL);
      } catch (err) {
        console.error("[PartnerHistorial] Error loading inbounds:", err);
        setInbounds([]);
      } finally {
        setLoading(false);
      }
    }
    void loadInbounds();
  }, [scopedClientIds, uid, roleResolved, dateFrom, dateTo]);

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

  const filteredInbounds = useMemo(() => {
    return inbounds.filter((r) => {
      const c = clientsById[r.clientId];
      const clientText = c ? `${c.code} ${c.name}`.toLowerCase() : r.clientId.toLowerCase();
      if (qClient && !clientText.includes(qClient.toLowerCase())) return false;
      if (qTracking && !r.tracking.toLowerCase().includes(qTracking.toLowerCase())) return false;

      const box = r.id ? boxByInbound[r.id] : undefined;
      if (statusFilter === "received") {
        if (r.status === "void") return false;
        if (box) return false;
      }
      if (statusFilter === "boxed") {
        if (!box) return false;
      }
      return true;
    });
  }, [inbounds, clientsById, qClient, qTracking, statusFilter, boxByInbound]);

  return (
    <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 space-y-4">
      <h2 className="text-xl font-semibold text-white">Historial de Trackings</h2>

      <style jsx global>{`
        .lem-date { color-scheme: dark; }
        .lem-date::-webkit-calendar-picker-indicator {
          filter: invert(1) brightness(1.8) !important;
          opacity: 0.95;
        }
      `}</style>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
        <input
          className={inputCls}
          style={INPUT_BG_STYLE}
          placeholder="Buscar por cliente"
          value={qClient}
          onChange={(e) => setQClient(e.target.value)}
        />
        <input
          className={inputCls}
          style={INPUT_BG_STYLE}
          placeholder="Buscar por tracking"
          value={qTracking}
          onChange={(e) => setQTracking(e.target.value)}
        />
        <input
          type="date"
          className={inputCls + " lem-date"}
          style={INPUT_BG_STYLE}
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          title="Desde"
        />
        <input
          type="date"
          className={inputCls + " lem-date"}
          style={INPUT_BG_STYLE}
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          title="Hasta"
        />
        <BrandSelect
          value={statusFilter}
          onChange={(val) => setStatusFilter(val as "all" | "received" | "boxed")}
          options={[
            { value: "all", label: "Todos" },
            { value: "received", label: "Recibido" },
            { value: "boxed", label: "Consolidado" },
          ]}
          placeholder="Filtrar estado"
        />
      </div>

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
                {filteredInbounds
                  .filter((r) => r.id) // Solo inbounds con id
                  .map((r) => {
                    const c = clientsById[r.clientId];
                    const cliente = c
                      ? `${c.code || r.clientId}${c.name ? ` ${c.name}` : ""}`
                      : r.clientId;
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
                            className="inline-flex items-center justify-center text-white/80 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#005f40] rounded-sm"
                          >
                            <IconPhoto />
                          </a>
                        ) : (
                          <span className="text-white/40">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!filteredInbounds.length ? (
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
