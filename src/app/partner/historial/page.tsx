// src/app/partner/historial/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit, startAfter, type QueryDocumentSnapshot, type Query, type DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { fmtWeightPairFromLb } from "@/lib/weight";
import { ngrams, normalizeText } from "@/lib/searchTokens";
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

const PAGE_SIZE = 25;

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
  
  // Paginación
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [qClient, setQClient] = useState("");
  const [qTracking, setQTracking] = useState("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  
  type StatusFilter = "all" | "received" | "boxed";
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Normalizar query de tracking y generar tokens para búsqueda multi-token
  const qTrackingNorm = normalizeText(qTracking);
  const trackingSearchMode = qTrackingNorm.length >= 3;
  
  // Generar tokens con ngrams (máximo 10 por límite de Firestore)
  const trackingTokens = useMemo(() => {
    if (!trackingSearchMode) return [];
    const tokens = ngrams(qTrackingNorm, 3, 8).slice(0, 10);
    // Si qTrackingNorm está entre 3 y 8 caracteres, asegurarse de incluir el token completo
    if (qTrackingNorm.length >= 3 && qTrackingNorm.length <= 8 && !tokens.includes(qTrackingNorm)) {
      tokens.unshift(qTrackingNorm);
      return tokens.slice(0, 10); // Mantener máximo 10
    }
    return tokens;
  }, [qTrackingNorm, trackingSearchMode]);

  // Normalizar query de cliente
  const qClientNorm = qClient.trim().toUpperCase().replaceAll(" ", "");
  const clientSearchMode = !trackingSearchMode && qClientNorm.length >= 3;

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
          weightOverrideLb: b.weightOverrideLb,
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
    hideItemsWhenOverride: false, // Partner siempre ve items
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
      try {
        const q = query(
          collection(db, "boxes"),
          where("managerUid", "==", uid)
        );
        const snap = await getDocs(q);
        const loadedBoxes: Box[] = [];
        const seenIds = new Set<string>();

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
              const weightOverrideLbValue = rec.weightOverrideLb;
              const weightOverrideLb = weightOverrideLbValue === null 
                ? null 
                : (asNumber(weightOverrideLbValue) ?? undefined);
              loadedBoxes.push({
                id: boxId,
                code,
                clientId,
                status: status || "open",
                itemIds,
                weightLb,
                ...(weightOverrideLb !== undefined ? { weightOverrideLb } : {}),
              });
            }
          }
        });
        
        // Filtrar por scopedClientIds para asegurar scope correcto
        const filteredBoxes = loadedBoxes.filter((b) => scopedClientIds.includes(b.clientId));
        setBoxes(filteredBoxes);
      } catch (err) {
        console.error("[PartnerHistorial] Error loading boxes:", err);
        setBoxes([]);
      }
    }
    void loadBoxes();
  }, [uid, roleResolved, scopedClientIds]);

  // Cargar inbounds
  useEffect(() => {
    if (!roleResolved || !uid || scopedClientIds.length === 0) {
      setInbounds([]);
      setLoading(false);
      return;
    }

    async function loadInbounds() {
      setLoading(true);
      setInbounds([]);
      setLastDoc(null);
      setHasMore(false);
      try {
        // Búsqueda global o por managerUid según searchMode/clientSearchMode
        let qBase: Query<DocumentData>;
        if (trackingSearchMode) {
          // A) Búsqueda global por trackingTokens usando array-contains-any (multi-token)
          qBase = query(
            collection(db, "inboundPackages"),
            where("managerUid", "==", uid),
            where("trackingTokens", "array-contains-any", trackingTokens),
            orderBy("receivedAt", "desc"),
            limit(PAGE_SIZE)
          );
          if (dateFrom) qBase = query(qBase, where("receivedAt", ">=", zonedStartOfDayUtcMs(dateFrom)));
          if (dateTo) qBase = query(qBase, where("receivedAt", "<=", zonedEndOfDayUtcMs(dateTo)));
        } else if (clientSearchMode) {
          // B) Búsqueda global por clientTokens
          qBase = query(
            collection(db, "inboundPackages"),
            where("managerUid", "==", uid),
            where("clientTokens", "array-contains", qClientNorm),
            orderBy("receivedAt", "desc"),
            limit(PAGE_SIZE)
          );
          if (dateFrom) qBase = query(qBase, where("receivedAt", ">=", zonedStartOfDayUtcMs(dateFrom)));
          if (dateTo) qBase = query(qBase, where("receivedAt", "<=", zonedEndOfDayUtcMs(dateTo)));
        } else {
          // C) Query normal (con statusFilter server-side)
          let qBaseStart = query(
            collection(db, "inboundPackages"),
            where("managerUid", "==", uid)
          );
          
          // Agregar filtro de status si corresponde (antes de orderBy)
          if (statusFilter === "received" || statusFilter === "boxed") {
            qBaseStart = query(qBaseStart, where("status", "==", statusFilter));
          }
          
          // Ahora agregar orderBy y limit
          qBase = query(qBaseStart, orderBy("receivedAt", "desc"), limit(PAGE_SIZE));
          
          // Filtros de fecha después de orderBy (están permitidos)
          if (dateFrom) qBase = query(qBase, where("receivedAt", ">=", zonedStartOfDayUtcMs(dateFrom)));
          if (dateTo) qBase = query(qBase, where("receivedAt", "<=", zonedEndOfDayUtcMs(dateTo)));
        }

        const snap = await getDocs(qBase);
        const loadedInbounds: Inbound[] = [];

        snap.docs.forEach((d) => {
          const inboundId = d.id;
          if (inboundId) {
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

        // Filtrar por precisión cuando trackingSearchMode está activo (evitar falsos positivos)
        let preciseInbounds = loadedInbounds;
        if (trackingSearchMode) {
          const needle = qTrackingNorm;
          preciseInbounds = loadedInbounds.filter((i) => {
            const tn = (i.tracking || "").toUpperCase().replaceAll(" ", "");
            return tn.includes(needle);
          });
        }

        // Filtrar por scopedClientIds para asegurar scope correcto
        const filteredInbounds = preciseInbounds.filter((i) => scopedClientIds.includes(i.clientId));

        // Guardar el último documento para paginación
        const lastDocSnap = snap.docs[snap.docs.length - 1] ?? null;
        setLastDoc(lastDocSnap);
        setHasMore(snap.docs.length === PAGE_SIZE);
        setInbounds(filteredInbounds);
      } catch (err) {
        console.error("[PartnerHistorial] Error loading inbounds:", err);
        setInbounds([]);
        setLastDoc(null);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    }
    void loadInbounds();
  }, [uid, roleResolved, dateFrom, dateTo, statusFilter, scopedClientIds, qTracking, qClient, trackingTokens]);

  // Función para cargar más inbounds
  async function loadMore() {
    if (!hasMore || loadingMore || !lastDoc || !uid || scopedClientIds.length === 0) return;

    setLoadingMore(true);
    try {
      // Construir query con el mismo orden que loadInbounds pero con startAfter
      let qBase: Query<DocumentData>;
      if (trackingSearchMode) {
        // A) Búsqueda global por trackingTokens usando array-contains-any (multi-token)
        qBase = query(
          collection(db, "inboundPackages"),
          where("managerUid", "==", uid),
          where("trackingTokens", "array-contains-any", trackingTokens),
          orderBy("receivedAt", "desc"),
          startAfter(lastDoc),
          limit(PAGE_SIZE)
        );
        if (dateFrom) qBase = query(qBase, where("receivedAt", ">=", zonedStartOfDayUtcMs(dateFrom)));
        if (dateTo) qBase = query(qBase, where("receivedAt", "<=", zonedEndOfDayUtcMs(dateTo)));
      } else if (clientSearchMode) {
        // B) Búsqueda global por clientTokens
        qBase = query(
          collection(db, "inboundPackages"),
          where("managerUid", "==", uid),
          where("clientTokens", "array-contains", qClientNorm),
          orderBy("receivedAt", "desc"),
          startAfter(lastDoc),
          limit(PAGE_SIZE)
        );
        if (dateFrom) qBase = query(qBase, where("receivedAt", ">=", zonedStartOfDayUtcMs(dateFrom)));
        if (dateTo) qBase = query(qBase, where("receivedAt", "<=", zonedEndOfDayUtcMs(dateTo)));
      } else {
        // C) Query normal (con statusFilter server-side)
        let qBaseStart = query(
          collection(db, "inboundPackages"),
          where("managerUid", "==", uid)
        );
        
        // Agregar filtro de status si corresponde (antes de orderBy)
        if (statusFilter === "received" || statusFilter === "boxed") {
          qBaseStart = query(qBaseStart, where("status", "==", statusFilter));
        }
        
        // Ahora agregar orderBy, startAfter y limit
        qBase = query(qBaseStart, orderBy("receivedAt", "desc"), startAfter(lastDoc), limit(PAGE_SIZE));
        
        // Filtros de fecha después de orderBy (están permitidos)
        if (dateFrom) qBase = query(qBase, where("receivedAt", ">=", zonedStartOfDayUtcMs(dateFrom)));
        if (dateTo) qBase = query(qBase, where("receivedAt", "<=", zonedEndOfDayUtcMs(dateTo)));
      }

      const snap = await getDocs(qBase);
      const newInbounds: Inbound[] = [];

      snap.docs.forEach((d) => {
        const inboundId = d.id;
        if (inboundId) {
          const rec = asRecord(d.data());
          if (rec) {
            const tracking = asString(rec.tracking) ?? "";
            const carrierRaw = asString(rec.carrier);
            const carrier = carrierRaw as Inbound["carrier"] | undefined;
            const clientId = asString(rec.clientId) ?? "";
            if (!clientId) {
              return;
            }
            const weightLb = asNumber(rec.weightLb) ?? 0;
            const photoUrl = asString(rec.photoUrl);
            const status = asString(rec.status);
            const receivedAt = asNumber(rec.receivedAt);
            newInbounds.push({
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

      // Filtrar por precisión cuando trackingSearchMode está activo (evitar falsos positivos)
      let preciseNewInbounds = newInbounds;
      if (trackingSearchMode) {
        const needle = qTrackingNorm;
        preciseNewInbounds = newInbounds.filter((i) => {
          const tn = (i.tracking || "").toUpperCase().replaceAll(" ", "");
          return tn.includes(needle);
        });
      }

      // Filtrar por scopedClientIds
      const filteredNewInbounds = preciseNewInbounds.filter((i) => scopedClientIds.includes(i.clientId));

      // Evitar duplicados por id
      const existingIds = new Set(inbounds.map((i) => i.id));
      const uniqueNewInbounds = filteredNewInbounds.filter((i) => !existingIds.has(i.id));

      // Combinar y ordenar
      const combined = [...inbounds, ...uniqueNewInbounds];
      combined.sort((a, b) => {
        const aTime = a.receivedAt || 0;
        const bTime = b.receivedAt || 0;
        return bTime - aTime; // desc
      });

      const lastDocSnap = snap.docs[snap.docs.length - 1] ?? null;
      setLastDoc(lastDocSnap);
      setHasMore(snap.docs.length === PAGE_SIZE);
      setInbounds(combined);
    } catch (err) {
      console.error("[PartnerHistorial] Error loading more inbounds:", err);
    } finally {
      setLoadingMore(false);
    }
  }

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

  // Filtro en memoria solo para qClient y qTracking cuando NO están en modo búsqueda global
  // statusFilter se aplica server-side, no aquí
  // trackingSearchMode y clientSearchMode ya vienen filtrados desde el servidor
  const filteredInbounds = useMemo(() => {
    return inbounds.filter((r) => {
      // Si estamos en modo búsqueda global, el filtro ya se hizo en Firestore
      // Solo aplicar filtro en memoria si NO estamos en ningún modo de búsqueda global
      if (!trackingSearchMode && !clientSearchMode) {
        const c = clientsById[r.clientId];
        const clientText = c ? `${c.code} ${c.name}`.toLowerCase() : r.clientId.toLowerCase();
        if (qClient && !clientText.includes(qClient.toLowerCase())) return false;
        if (qTracking && !r.tracking.toLowerCase().includes(qTracking.toLowerCase())) return false;
      }
      return true;
    });
  }, [inbounds, clientsById, qClient, qTracking, trackingSearchMode, clientSearchMode]);

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
        <div className="flex flex-col gap-1">
          <input
            className={inputCls}
            style={INPUT_BG_STYLE}
            placeholder="Buscar por cliente"
            value={qClient}
            onChange={(e) => setQClient(e.target.value)}
          />
          {qClient.trim().length > 0 && qClient.trim().length < 3 && (
            <p className="text-xs text-white/40">Escribí al menos 3 caracteres para búsqueda global por nombre.</p>
          )}
          {clientSearchMode && (
            <p className="text-xs text-white/60">Búsqueda global por nombre (tokens).</p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <input
            className={inputCls}
            style={INPUT_BG_STYLE}
            placeholder="Buscar por tracking"
            value={qTracking}
            onChange={(e) => setQTracking(e.target.value)}
          />
          {qTracking.trim().length > 0 && qTracking.trim().length < 3 && (
            <p className="text-xs text-white/40">Escribí al menos 3 caracteres para búsqueda global.</p>
          )}
          {trackingSearchMode && (
            <p className="text-xs text-white/60">Búsqueda global por tracking (multi-token).</p>
          )}
        </div>
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
          onChange={(val) => {
            if (val === "all" || val === "received" || val === "boxed") {
              setStatusFilter(val);
            }
          }}
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

          {/* Paginación */}
          <div className="flex flex-col items-center justify-center gap-3 pt-4">
            <p className="text-sm text-white/60">
              Mostrando últimos {inbounds.length}. Cargar más para ampliar.
            </p>
            {hasMore ? (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="h-10 px-4 rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white/90 font-medium hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingMore ? "Cargando…" : "Cargar más"}
              </button>
            ) : (
              <p className="text-sm text-white/40">No hay más</p>
            )}
          </div>
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
