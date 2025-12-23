// src/app/admin/historial-tracking/page.tsx
"use client";
import RequireAuth from "@/components/RequireAuth";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs, orderBy, query, getDoc, doc, deleteDoc, updateDoc, where, documentId, limit, startAfter, type QueryDocumentSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import type { Carrier, Client, Shipment } from "@/types/lem";
import StatusBadge from "@/components/ui/StatusBadge";
import { fmtWeightPairFromLb, lbToKg } from "@/lib/weight";
import { BoxDetailModal } from "@/components/boxes/BoxDetailModal";
import { useBoxDetailModal } from "@/components/boxes/useBoxDetailModal";
import { chunk } from "@/lib/utils";
import { IconPhoto, IconTrash } from "@/components/ui/icons";
import { BrandSelect, type BrandOption } from "@/components/ui/BrandSelect";

const CONTROL_BORDER = "border-[#1f3f36]";
const btnPrimaryCls = "inline-flex items-center justify-center h-10 px-4 rounded-md bg-[#eb6619] text-white font-medium shadow-md hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619] disabled:opacity-50 disabled:cursor-not-allowed";
const btnSecondaryCls = `inline-flex items-center justify-center h-10 px-4 rounded-md border ${CONTROL_BORDER} bg-white/5 text-white/90 font-medium hover:bg-white/10 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed`;
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


type Inbound = {
  id: string;
  tracking: string;
  carrier: Carrier;
  clientId: string;
  weightLb: number;
  status: "received" | "boxed" | "void";
  photoUrl?: string;
  receivedAt?: number;
};

type Box = {
  id: string;
  code: string;
  itemIds: string[];
  clientId: string;
  country?: string;
  type?: "COMERCIAL" | "FRANQUICIA";
  weightLb?: number;
  labelRef?: string;
  shipmentId?: string | null;
};

export default function HistorialTrackingPage() {
  return (
    <RequireAuth requireAdmin>
      <PageInner />
    </RequireAuth>
  );
}

const PAGE_SIZE = 25;

function PageInner() {
  const [clients, setClients] = useState<Client[]>([]);
  const [rows, setRows] = useState<Inbound[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);

  // --- Auth state for clearer behavior ---
  const [authError, setAuthError] = useState<string | null>(null);
  const [roleState, setRoleState] = useState<string | undefined>(undefined);
  const [isStaffState, setIsStaffState] = useState<boolean>(false);
  const [isPartnerState, setIsPartnerState] = useState<boolean>(false);

  // --- Pagination state ---
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<any, any> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [managedClientIds, setManagedClientIds] = useState<string[]>([]);

  const [qClient, setQClient] = useState("");
  const [qTracking, setQTracking] = useState("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<'all' | 'alerted' | 'received' | 'boxed'>('all');
  const [alertedTrackings, setAlertedTrackings] = useState<Set<string>>(new Set());
  const [openAlerts, setOpenAlerts] = useState<Array<{ id: string; tracking: string; clientId: string; createdAt?: number; note?: string }>>([]);
  const [shipmentsById, setShipmentsById] = useState<Record<string, Shipment>>({});

  // --- Reindex state ---
  const [reindexing, setReindexing] = useState(false);
  const [reindexStats, setReindexStats] = useState<{
    processed: number;
    updated: number;
    skipped: number;
    lastId: string | null;
    hasMore: boolean;
  } | null>(null);
  
  const [reindexNamesRunning, setReindexNamesRunning] = useState(false);
  const [reindexNamesStats, setReindexNamesStats] = useState<{
    processed: number;
    updated: number;
    skipped: number;
    lastId: string | null;
    hasMore: boolean;
  } | null>(null);

  // --- Delete modal state ---
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Inbound | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const clientsById = useMemo(() => {
    const m: Record<string, Client> = {};
    for (const c of clients) if (c.id) m[c.id] = c;
    return m;
  }, [clients]);

  // Box detail modal hook
  const { openBoxDetailByBoxId, modalProps } = useBoxDetailModal({
    boxes: boxes as Array<{ id: string; code: string; itemIds?: string[]; clientId: string; type?: "COMERCIAL" | "FRANQUICIA"; weightLb?: number; weightOverrideLb?: number | null; labelRef?: string; status?: "open" | "closed" | "shipped" | "delivered" }>,
    setBoxes: setBoxes as unknown as React.Dispatch<React.SetStateAction<Array<Record<string, unknown> & { id: string }>>>,
    setRows: setRows as unknown as React.Dispatch<React.SetStateAction<Array<Record<string, unknown> & { id: string }>>>,
    clientsById,
    hideItemsWhenOverride: false, // Admin siempre ve items
  });

  const boxByInbound = useMemo(() => {
    const m: Record<string, Box> = {};
    for (const b of boxes) {
      for (const id of b.itemIds || []) m[id] = b;
    }
    return m;
  }, [boxes]);

  // Mapeo de inboundId -> receivedAt para ordenamiento de boxes
  const rowsById = useMemo(() => {
    const m: Record<string, Inbound> = {};
    for (const r of rows) if (r.id) m[r.id] = r;
    return m;
  }, [rows]);

  async function getMyRole(): Promise<string | undefined> {
    const u = auth.currentUser;
    if (!u) return undefined;

    // Read token claims (may be stale)
    const tok = await u.getIdTokenResult(true);
    const claims = (tok?.claims ?? {}) as Record<string, unknown>;
    const claimRole = typeof claims["role"] === "string" ? (claims["role"] as string) : undefined;

    // Back-compat: legacy superadmin claim
    if (claims["superadmin"] === true) return "superadmin";

    // Read Firestore role as second source of truth
    let firestoreRole: string | undefined = undefined;
    try {
      const snap = await getDoc(doc(db, "users", u.uid));
      if (snap.exists()) {
        const data = snap.data() as any;
        if (typeof data?.role === "string") firestoreRole = data.role;
      }
    } catch {
      // ignore
    }

    // Least privilege: if Firestore says partner_admin, treat as partner even if claims are stale
    if (firestoreRole === "partner_admin") return "partner_admin";

    // Otherwise prefer claimRole, then Firestore
    return claimRole ?? firestoreRole;
  }

  async function getManagedClientIds(): Promise<string[]> {
    const u = auth.currentUser;
    if (!u) return [];

    // 1) Preferred: users/{uid}.managedClientIds
    try {
      const snap = await getDoc(doc(db, "users", u.uid));
      if (snap.exists()) {
        const data = snap.data() as any;
        const ids = Array.isArray(data?.managedClientIds)
          ? data.managedClientIds.filter((x: any) => typeof x === "string" && x.length > 0)
          : [];
        if (ids.length) return ids;
      }
    } catch {
      // ignore and fallback
    }

    // 2) Fallback: derive allowed clients from clients.managerUid
    try {
      const qs = await getDocs(
        query(collection(db, "clients"), where("managerUid", "==", u.uid), limit(200))
      );
      return qs.docs.map((d) => d.id);
    } catch {
      return [];
    }
  }

  // Normalizar query de tracking
  const qNorm = qTracking.trim().toUpperCase().replaceAll(" ", "");
  const searchMode = qNorm.length >= 3;

  // Normalizar query de cliente
  const qClientNorm = qClient.trim().toUpperCase().replaceAll(" ", "");
  const clientSearchMode = !searchMode && qClientNorm.length >= 3;

  useEffect(() => {
    let alive = true;

    // Resetear paginación cuando cambian los filtros o la query
    setLastDoc(null);
    setHasMore(true);
    setLoadingMore(false);

    async function load() {
      const role = await getMyRole();
      setRoleState(role);
      const isStaff = role === "admin" || role === "superadmin" || role === "operador";
      const isPartner = role === "partner_admin";
      setIsStaffState(isStaff);
      setIsPartnerState(isPartner);
      setAuthError(null);

      // If role is missing/unknown, do not load any data.
      if (!role) {
        if (!alive) return;
        setClients([]);
        setRows([]);
        setBoxes([]);
        setAuthError("Sin permisos para acceder a esta página");
        return;
      }

      let managedIds: string[] = [];
      if (isPartner) {
        try {
          managedIds = await getManagedClientIds();
        } catch (e) {
          managedIds = [];
        }
      }
      setManagedClientIds(managedIds);

      console.log("[HistorialTracking] role:", role, "isStaff:", isStaff, "isPartner:", isPartner);
      console.log("[HistorialTracking] resolved role:", role);
      console.log("[HistorialTracking] scopedClientIds:", managedIds);

      // Partner: scope everything to managedClientIds to avoid permission errors.
      if (isPartner) {
        if (!alive) return;

        if (!managedIds.length) {
          setClients([]);
          setRows([]);
          setBoxes([]);
          setAuthError(
            "No se encontraron clientes asociados para filtrar trackings. Si recién creaste clientes, verificá que estén vinculados a tu usuario (managerUid) o que tu perfil tenga managedClientIds."
          );
          return;
        }

        // Clients (by doc id)
        const clientSnaps = await Promise.all(
          chunk(managedIds, 10).map((ids) => getDocs(query(collection(db, "clients"), where(documentId(), "in", ids))))
        );
        const clientDocs = clientSnaps.flatMap((s) => s.docs);
        const nextClients = clientDocs.map((d) => ({ id: d.id, ...(d.data() as Omit<Client, "id">) }));

        // Some collections store clientId as the client doc id, others as client.code.
        // Build a combined key list to support both.
        const clientKeys = Array.from(
          new Set(
            [
              ...managedIds,
              ...nextClients
                .map((c: any) => (typeof c?.code === "string" ? c.code : null))
                .filter((x: any) => typeof x === "string" && x.length > 0),
            ].filter((x: any) => typeof x === "string" && x.length > 0)
          )
        );
        console.log("[HistorialTracking] clientKeys(for queries):", clientKeys);

        // Inbounds - Búsqueda global o por clientId según searchMode/clientSearchMode
        let qBase: any;
        if (searchMode) {
          // Búsqueda global por trackingTokens (prioridad más alta - sin filtrar por clientId ni statusFilter)
          qBase = query(
            collection(db, "inboundPackages"),
            where("trackingTokens", "array-contains", qNorm),
            orderBy("receivedAt", "desc"),
            limit(PAGE_SIZE)
          );
          if (dateFrom) qBase = query(qBase, where("receivedAt", ">=", zonedStartOfDayUtcMs(dateFrom)));
          if (dateTo) qBase = query(qBase, where("receivedAt", "<=", zonedEndOfDayUtcMs(dateTo)));
        } else if (clientSearchMode) {
          // Búsqueda global por clientTokens (sin filtrar por clientId ni statusFilter - clientSearchMode tiene prioridad)
          qBase = query(
            collection(db, "inboundPackages"),
            where("clientTokens", "array-contains", qClientNorm),
            orderBy("receivedAt", "desc"),
            limit(PAGE_SIZE)
          );
          if (dateFrom) qBase = query(qBase, where("receivedAt", ">=", zonedStartOfDayUtcMs(dateFrom)));
          if (dateTo) qBase = query(qBase, where("receivedAt", "<=", zonedEndOfDayUtcMs(dateTo)));
        } else {
          // Listado normal paginado por clientId
          const firstChunk = clientKeys.slice(0, 10);
          let qBaseStart: any = query(
            collection(db, "inboundPackages"),
            where("clientId", "in", firstChunk)
          );
          // Agregar filtro por status si corresponde (antes de orderBy)
          if (statusFilter === "received" || statusFilter === "boxed") {
            qBaseStart = query(qBaseStart, where("status", "==", statusFilter));
          }
          // Ahora agregar orderBy y limit
          qBase = query(qBaseStart, orderBy("receivedAt", "desc"), limit(PAGE_SIZE));
          // Filtros de fecha después de orderBy (están permitidos)
          if (dateFrom) qBase = query(qBase, where("receivedAt", ">=", zonedStartOfDayUtcMs(dateFrom)));
          if (dateTo) qBase = query(qBase, where("receivedAt", "<=", zonedEndOfDayUtcMs(dateTo)));
        }
        
        const inboundSnap = await getDocs(qBase);
        const inboundDocs = inboundSnap.docs;
        const nextRowsRaw = inboundDocs.map((d) => ({ id: d.id, ...(d.data() as Omit<Inbound, "id">) }));
        const seen = new Set<string>();
        const nextRows = nextRowsRaw.filter((r) => {
          if (seen.has(r.id)) return false;
          seen.add(r.id);
          return true;
        });
        nextRows.sort((a, b) => Number(b.receivedAt || 0) - Number(a.receivedAt || 0));

        if (!alive) return;
        setClients(nextClients);
        setRows(nextRows);
        const lastDocSnap = inboundDocs[inboundDocs.length - 1] ?? null;
        setLastDoc(lastDocSnap);
        setHasMore(inboundDocs.length === PAGE_SIZE);

        // Cargar boxes relevantes para los inbounds cargados
        const inboundIds = nextRows.map((r) => r.id);
        let nextBoxes: Box[] = [];
        if (inboundIds.length > 0) {
          const chunks = chunk(inboundIds, 10);
          const boxSnaps = await Promise.all(
            chunks.map((ids) =>
              getDocs(query(collection(db, "boxes"), where("itemIds", "array-contains-any", ids)))
            )
          );
          nextBoxes = boxSnaps.flatMap((s) => s.docs).map((d) => ({ id: d.id, ...(d.data() as Omit<Box, "id">) }));
          // Deduplicar boxes por id
          const uniq = new Map<string, Box>();
          for (const b of nextBoxes) uniq.set(b.id, b);
          nextBoxes = Array.from(uniq.values());
          if (!alive) return;
          setBoxes(nextBoxes);
        } else {
          if (!alive) return;
          setBoxes([]);
        }

        // Cargar shipments en batch (sin N+1) - después de setBoxes
        try {
          const shipmentIds = Array.from(
            new Set(
              nextBoxes
                .map((b) => (b as any).shipmentId)
                .filter((x): x is string => !!x && typeof x === "string")
            )
          );

          if (shipmentIds.length > 0) {
            let shipmentDocs: any[] = [];
            if (shipmentIds.length <= 10) {
              const q = query(
                collection(db, "shipments"),
                where(documentId(), "in", shipmentIds)
              );
              const snap = await getDocs(q);
              shipmentDocs = snap.docs;
            } else {
              const chunks = chunk(shipmentIds, 10);
              const snaps = await Promise.all(
                chunks.map((ids) =>
                  getDocs(
                    query(
                      collection(db, "shipments"),
                      where(documentId(), "in", ids)
                    )
                  )
                )
              );
              shipmentDocs = snaps.flatMap((s) => s.docs);
            }

            const shipmentsMap: Record<string, Shipment> = {};
            shipmentDocs.forEach((d) => {
              const data = d.data();
              shipmentsMap[d.id] = {
                id: d.id,
                code: typeof data.code === "string" ? data.code : "",
                status: (["open", "shipped", "arrived", "closed"].includes(
                  data.status
                )
                  ? data.status
                  : "open") as Shipment["status"],
                country: typeof data.country === "string" ? data.country : "",
                type:
                  data.type === "COMERCIAL" || data.type === "FRANQUICIA"
                    ? data.type
                    : "COMERCIAL",
              };
            });

            if (!alive) return;
            setShipmentsById(shipmentsMap);
          } else {
            if (!alive) return;
            setShipmentsById({});
          }
        } catch (e) {
          console.error("Error loading shipments:", e);
          if (!alive) return;
          setShipmentsById({});
        }

        // Cargar alertas para los trackings visibles
        const trackings = nextRows.map((r) => r.tracking.toUpperCase());
        if (trackings.length > 0) {
          const alertSet = new Set<string>();
          const trackingChunks = chunk(trackings, 10);
          for (const chunk of trackingChunks) {
            try {
              const alertQuery = query(
                collection(db, "trackingAlerts"),
                where("tracking", "in", chunk),
                where("status", "==", "open")
              );
              const alertSnap = await getDocs(alertQuery);
              alertSnap.docs.forEach((d) => {
                const data = d.data();
                if (data.tracking && typeof data.tracking === "string") {
                  alertSet.add(data.tracking.toUpperCase());
                }
              });
            } catch (e) {
              console.error("Error loading alerts:", e);
            }
          }
          if (!alive) return;
          setAlertedTrackings(alertSet);
        } else {
          setAlertedTrackings(new Set());
        }

        // Cargar todas las alertas abiertas (para partner: solo de sus clientes gestionados)
        try {
          const allAlertsQuery = query(
            collection(db, "trackingAlerts"),
            where("status", "==", "open")
          );
          const allAlertsSnap = await getDocs(allAlertsQuery);
          let allAlerts = allAlertsSnap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              tracking: typeof data.tracking === "string" ? data.tracking.toUpperCase() : "",
              clientId: typeof data.clientId === "string" ? data.clientId : "",
              createdAt: typeof data.createdAt === "number" ? data.createdAt : undefined,
              note: typeof data.note === "string" ? data.note : undefined,
            };
          }).filter((a) => a.tracking && a.clientId);

          // Para partner: filtrar en memoria solo alertas de sus clientes gestionados
          if (isPartner && managedIds.length > 0) {
            const managedSet = new Set(managedIds);
            allAlerts = allAlerts.filter((a) => managedSet.has(a.clientId));
          }

          if (!alive) return;
          setOpenAlerts(allAlerts);
        } catch (e) {
          console.error("Error loading all alerts:", e);
          if (!alive) return;
          setOpenAlerts([]);
        }
        return;
      }

      // Antes de correr queries globales, verificar que es staff/admin
      if (!isStaff) {
        if (!alive) return;
        setClients([]);
        setRows([]);
        setBoxes([]);
        setAuthError("Sin permisos para acceder a esta página");
        return;
      }
      // Staff/admin: búsqueda global o listado normal según searchMode/clientSearchMode
      let inboundQ: any;
      if (searchMode) {
        // Búsqueda global por trackingTokens (prioridad más alta - sin filtrar por statusFilter)
        inboundQ = query(
          collection(db, "inboundPackages"),
          where("trackingTokens", "array-contains", qNorm),
          orderBy("receivedAt", "desc"),
          limit(PAGE_SIZE)
        );
        if (dateFrom) inboundQ = query(inboundQ, where("receivedAt", ">=", zonedStartOfDayUtcMs(dateFrom)));
        if (dateTo) inboundQ = query(inboundQ, where("receivedAt", "<=", zonedEndOfDayUtcMs(dateTo)));
      } else if (clientSearchMode) {
        // Búsqueda global por clientTokens (sin filtrar por statusFilter - clientSearchMode tiene prioridad)
        inboundQ = query(
          collection(db, "inboundPackages"),
          where("clientTokens", "array-contains", qClientNorm),
          orderBy("receivedAt", "desc"),
          limit(PAGE_SIZE)
        );
        if (dateFrom) inboundQ = query(inboundQ, where("receivedAt", ">=", zonedStartOfDayUtcMs(dateFrom)));
        if (dateTo) inboundQ = query(inboundQ, where("receivedAt", "<=", zonedEndOfDayUtcMs(dateTo)));
      } else {
        // Listado normal paginado
        let inboundQStart: any = query(collection(db, "inboundPackages"));
        // Agregar filtro por status si corresponde (antes de orderBy)
        if (statusFilter === "received" || statusFilter === "boxed") {
          inboundQStart = query(inboundQStart, where("status", "==", statusFilter));
        }
        // Ahora agregar orderBy y limit
        inboundQ = query(inboundQStart, orderBy("receivedAt", "desc"), limit(PAGE_SIZE));
        // Filtros de fecha después de orderBy (están permitidos)
        if (dateFrom) inboundQ = query(inboundQ, where("receivedAt", ">=", zonedStartOfDayUtcMs(dateFrom)));
        if (dateTo) inboundQ = query(inboundQ, where("receivedAt", "<=", zonedEndOfDayUtcMs(dateTo)));
      }

      const [cs, is] = await Promise.all([
        getDocs(collection(db, "clients")),
        getDocs(inboundQ),
      ]);

      if (!alive) return;
      setClients(cs.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Client, "id">) })));
      const nextRows = is.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Inbound, "id">) }));
      setRows(nextRows);
      setLastDoc(is.docs[is.docs.length - 1] ?? null);
      setHasMore(is.docs.length === PAGE_SIZE);

      // Cargar boxes relevantes para los inbounds cargados
      const inboundIds = nextRows.map((r) => r.id);
      let nextBoxes: Box[] = [];
      if (inboundIds.length > 0) {
        const chunks = chunk(inboundIds, 10);
        const boxSnaps = await Promise.all(
          chunks.map((ids) =>
            getDocs(query(collection(db, "boxes"), where("itemIds", "array-contains-any", ids)))
          )
        );
        nextBoxes = boxSnaps.flatMap((s) => s.docs).map((d) => ({ id: d.id, ...(d.data() as Omit<Box, "id">) }));
        // Deduplicar boxes por id
        const uniq = new Map<string, Box>();
        for (const b of nextBoxes) uniq.set(b.id, b);
        nextBoxes = Array.from(uniq.values());
        if (!alive) return;
        setBoxes(nextBoxes);
      } else {
        if (!alive) return;
        setBoxes([]);
      }

      // Cargar shipments en batch (sin N+1) - después de setBoxes
      try {
        const shipmentIds = Array.from(
          new Set(
            nextBoxes
              .map((b) => (b as any).shipmentId)
              .filter((x): x is string => !!x && typeof x === "string")
          )
        );

        if (shipmentIds.length > 0) {
          let shipmentDocs: any[] = [];
          if (shipmentIds.length <= 10) {
            const q = query(
              collection(db, "shipments"),
              where(documentId(), "in", shipmentIds)
            );
            const snap = await getDocs(q);
            shipmentDocs = snap.docs;
          } else {
            const chunks = chunk(shipmentIds, 10);
            const snaps = await Promise.all(
              chunks.map((ids) =>
                getDocs(
                  query(
                    collection(db, "shipments"),
                    where(documentId(), "in", ids)
                  )
                )
              )
            );
            shipmentDocs = snaps.flatMap((s) => s.docs);
          }

          const shipmentsMap: Record<string, Shipment> = {};
          shipmentDocs.forEach((d) => {
            const data = d.data();
            shipmentsMap[d.id] = {
              id: d.id,
              code: typeof data.code === "string" ? data.code : "",
              status: (["open", "shipped", "arrived", "closed"].includes(
                data.status
              )
                ? data.status
                : "open") as Shipment["status"],
              country: typeof data.country === "string" ? data.country : "",
              type:
                data.type === "COMERCIAL" || data.type === "FRANQUICIA"
                  ? data.type
                  : "COMERCIAL",
            };
          });

          if (!alive) return;
          setShipmentsById(shipmentsMap);
        } else {
          if (!alive) return;
          setShipmentsById({});
        }
      } catch (e) {
        console.error("Error loading shipments:", e);
        if (!alive) return;
        setShipmentsById({});
      }

      // Cargar alertas para los trackings visibles
      const trackings = nextRows.map((r) => r.tracking.toUpperCase());
      if (trackings.length > 0) {
        const alertSet = new Set<string>();
        const trackingChunks = chunk(trackings, 10);
        for (const chunk of trackingChunks) {
          try {
            const alertQuery = query(
              collection(db, "trackingAlerts"),
              where("tracking", "in", chunk),
              where("status", "==", "open")
            );
            const alertSnap = await getDocs(alertQuery);
            alertSnap.docs.forEach((d) => {
              const data = d.data();
              if (data.tracking && typeof data.tracking === "string") {
                alertSet.add(data.tracking.toUpperCase());
              }
            });
          } catch (e) {
            console.error("Error loading alerts:", e);
          }
        }
        if (!alive) return;
        setAlertedTrackings(alertSet);
      } else {
        setAlertedTrackings(new Set());
      }

      // Cargar todas las alertas abiertas (para staff: todas)
      try {
        const allAlertsQuery = query(
          collection(db, "trackingAlerts"),
          where("status", "==", "open")
        );
        const allAlertsSnap = await getDocs(allAlertsQuery);
        const allAlerts = allAlertsSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            tracking: typeof data.tracking === "string" ? data.tracking.toUpperCase() : "",
            clientId: typeof data.clientId === "string" ? data.clientId : "",
            createdAt: typeof data.createdAt === "number" ? data.createdAt : undefined,
            note: typeof data.note === "string" ? data.note : undefined,
          };
        }).filter((a) => a.tracking && a.clientId);

        if (!alive) return;
        setOpenAlerts(allAlerts);
      } catch (e) {
        console.error("Error loading all alerts:", e);
        if (!alive) return;
        setOpenAlerts([]);
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, [dateFrom, dateTo, qTracking, qClient, statusFilter]);

  async function loadAlertsAndShipmentsForRows(newRows: Inbound[], currentBoxes?: Box[]) {
    // Cargar alertas para los nuevos trackings
    const newTrackings = newRows.map((r) => r.tracking.toUpperCase());
    if (newTrackings.length > 0) {
      const alertSet = new Set(alertedTrackings);
      const trackingChunks = chunk(newTrackings, 10);
      for (const chunk of trackingChunks) {
        try {
          const alertQuery = query(
            collection(db, "trackingAlerts"),
            where("tracking", "in", chunk),
            where("status", "==", "open")
          );
          const alertSnap = await getDocs(alertQuery);
          alertSnap.docs.forEach((d) => {
            const data = d.data();
            if (data.tracking && typeof data.tracking === "string") {
              alertSet.add(data.tracking.toUpperCase());
            }
          });
        } catch (e) {
          console.error("Error loading alerts:", e);
        }
      }
      setAlertedTrackings(alertSet);
    }

    // Cargar shipments para las nuevas boxes (usar boxes proporcionadas o estado actual)
    const boxesToUse = currentBoxes ?? boxes;
    const currentBoxByInbound: Record<string, Box> = {};
    for (const b of boxesToUse) {
      for (const id of b.itemIds || []) currentBoxByInbound[id] = b;
    }

    const newBoxIds = new Set<string>();
    newRows.forEach((r) => {
      const box = currentBoxByInbound[r.id];
      if (box?.shipmentId) {
        newBoxIds.add(box.shipmentId);
      }
    });

    if (newBoxIds.size > 0) {
      const shipmentIds = Array.from(newBoxIds);
      // Filtrar los que ya tenemos cargados
      const missingShipmentIds = shipmentIds.filter((id) => !shipmentsById[id]);
      
      if (missingShipmentIds.length > 0) {
        try {
          let shipmentDocs: any[] = [];
          if (missingShipmentIds.length <= 10) {
            const q = query(
              collection(db, "shipments"),
              where(documentId(), "in", missingShipmentIds)
            );
            const snap = await getDocs(q);
            shipmentDocs = snap.docs;
          } else {
            const chunks = chunk(missingShipmentIds, 10);
            const snaps = await Promise.all(
              chunks.map((ids) =>
                getDocs(
                  query(
                    collection(db, "shipments"),
                    where(documentId(), "in", ids)
                  )
                )
              )
            );
            shipmentDocs = snaps.flatMap((s) => s.docs);
          }

          const newShipmentsMap: Record<string, Shipment> = {};
          shipmentDocs.forEach((d) => {
            const data = d.data();
            newShipmentsMap[d.id] = {
              id: d.id,
              code: typeof data.code === "string" ? data.code : "",
              status: (["open", "shipped", "arrived", "closed"].includes(
                data.status
              )
                ? data.status
                : "open") as Shipment["status"],
              country: typeof data.country === "string" ? data.country : "",
              type:
                data.type === "COMERCIAL" || data.type === "FRANQUICIA"
                  ? data.type
                  : "COMERCIAL",
            };
          });

          setShipmentsById((prev) => ({ ...prev, ...newShipmentsMap }));
        } catch (e) {
          console.error("Error loading shipments:", e);
        }
      }
    }
  }

  async function loadMore() {
    if (!hasMore || loadingMore || !lastDoc) return;

    setLoadingMore(true);
    try {
      if (isPartnerState) {
        // Partner: usar managedClientIds
        if (!managedClientIds.length) {
          setHasMore(false);
          return;
        }

        const clientKeys = Array.from(
          new Set(
            [
              ...managedClientIds,
              ...clients
                .map((c: any) => (typeof c?.code === "string" ? c.code : null))
                .filter((x: any) => typeof x === "string" && x.length > 0),
            ].filter((x: any) => typeof x === "string" && x.length > 0)
          )
        );

        let qBase: any;
        if (searchMode) {
          // Búsqueda global por trackingTokens (prioridad más alta)
          qBase = query(
            collection(db, "inboundPackages"),
            where("trackingTokens", "array-contains", qNorm),
            orderBy("receivedAt", "desc"),
            startAfter(lastDoc),
            limit(PAGE_SIZE)
          );
          if (dateFrom) qBase = query(qBase, where("receivedAt", ">=", zonedStartOfDayUtcMs(dateFrom)));
          if (dateTo) qBase = query(qBase, where("receivedAt", "<=", zonedEndOfDayUtcMs(dateTo)));
        } else if (clientSearchMode) {
          // Búsqueda global por clientTokens
          qBase = query(
            collection(db, "inboundPackages"),
            where("clientTokens", "array-contains", qClientNorm),
            orderBy("receivedAt", "desc"),
            startAfter(lastDoc),
            limit(PAGE_SIZE)
          );
          if (dateFrom) qBase = query(qBase, where("receivedAt", ">=", zonedStartOfDayUtcMs(dateFrom)));
          if (dateTo) qBase = query(qBase, where("receivedAt", "<=", zonedEndOfDayUtcMs(dateTo)));
        } else {
          // Listado normal paginado por clientId
          const firstChunk = clientKeys.slice(0, 10);
          let qBaseStart: any = query(
            collection(db, "inboundPackages"),
            where("clientId", "in", firstChunk)
          );
          // Agregar filtro por status si corresponde (antes de orderBy)
          if (statusFilter === "received" || statusFilter === "boxed") {
            qBaseStart = query(qBaseStart, where("status", "==", statusFilter));
          }
          // Ahora agregar orderBy, startAfter y limit
          qBase = query(qBaseStart, orderBy("receivedAt", "desc"), startAfter(lastDoc), limit(PAGE_SIZE));
          // Filtros de fecha después de orderBy (están permitidos)
          if (dateFrom) qBase = query(qBase, where("receivedAt", ">=", zonedStartOfDayUtcMs(dateFrom)));
          if (dateTo) qBase = query(qBase, where("receivedAt", "<=", zonedEndOfDayUtcMs(dateTo)));
        }

        const inboundSnap = await getDocs(qBase);
        const inboundDocs = inboundSnap.docs;
        const newRowsRaw = inboundDocs.map((d) => ({ id: d.id, ...(d.data() as Omit<Inbound, "id">) }));

        // Evitar duplicados
        const existingIds = new Set(rows.map((r) => r.id));
        const uniqueNewRows = newRowsRaw.filter((r) => !existingIds.has(r.id));
        uniqueNewRows.sort((a, b) => Number(b.receivedAt || 0) - Number(a.receivedAt || 0));

        const combinedRows = [...rows, ...uniqueNewRows];
        combinedRows.sort((a, b) => Number(b.receivedAt || 0) - Number(a.receivedAt || 0));
        setRows(combinedRows);
        setLastDoc(inboundDocs[inboundDocs.length - 1] ?? null);
        setHasMore(inboundDocs.length === PAGE_SIZE);

        // Cargar boxes adicionales para los nuevos inbounds
        const newInboundIds = uniqueNewRows.map((r) => r.id);
        let updatedBoxes = boxes;
        if (newInboundIds.length > 0) {
          const chunks = chunk(newInboundIds, 10);
          const boxSnaps = await Promise.all(
            chunks.map((ids) =>
              getDocs(query(collection(db, "boxes"), where("itemIds", "array-contains-any", ids)))
            )
          );
          const newBoxes = boxSnaps.flatMap((s) => s.docs).map((d) => ({ id: d.id, ...(d.data() as Omit<Box, "id">) }));
          
          // Deduplicar newBoxes por id (una caja puede matchear varios chunks)
          const uniqNew = Array.from(new Map(newBoxes.map(b => [b.id, b])).values());
          
          // Merge sin duplicados
          const existingBoxIds = new Set(boxes.map((b) => b.id));
          const uniqueNewBoxes = uniqNew.filter((b) => !existingBoxIds.has(b.id));
          updatedBoxes = [...boxes, ...uniqueNewBoxes];
          setBoxes(updatedBoxes);
        }

        // Cargar alertas y shipments para los nuevos rows (después de setBoxes, usando boxes actualizadas)
        await loadAlertsAndShipmentsForRows(uniqueNewRows, updatedBoxes);
      } else if (isStaffState) {
        // Staff: búsqueda global o listado normal según searchMode/clientSearchMode
        let inboundQ: any;
        if (searchMode) {
          // Búsqueda global por trackingTokens (prioridad más alta)
          inboundQ = query(
            collection(db, "inboundPackages"),
            where("trackingTokens", "array-contains", qNorm),
            orderBy("receivedAt", "desc"),
            startAfter(lastDoc),
            limit(PAGE_SIZE)
          );
          if (dateFrom) inboundQ = query(inboundQ, where("receivedAt", ">=", zonedStartOfDayUtcMs(dateFrom)));
          if (dateTo) inboundQ = query(inboundQ, where("receivedAt", "<=", zonedEndOfDayUtcMs(dateTo)));
        } else if (clientSearchMode) {
          // Búsqueda global por clientTokens
          inboundQ = query(
            collection(db, "inboundPackages"),
            where("clientTokens", "array-contains", qClientNorm),
            orderBy("receivedAt", "desc"),
            startAfter(lastDoc),
            limit(PAGE_SIZE)
          );
          if (dateFrom) inboundQ = query(inboundQ, where("receivedAt", ">=", zonedStartOfDayUtcMs(dateFrom)));
          if (dateTo) inboundQ = query(inboundQ, where("receivedAt", "<=", zonedEndOfDayUtcMs(dateTo)));
        } else {
          // Listado normal paginado
          let inboundQStart: any = query(collection(db, "inboundPackages"));
          // Agregar filtro por status si corresponde (antes de orderBy)
          if (statusFilter === "received" || statusFilter === "boxed") {
            inboundQStart = query(inboundQStart, where("status", "==", statusFilter));
          }
          // Ahora agregar orderBy, startAfter y limit
          inboundQ = query(inboundQStart, orderBy("receivedAt", "desc"), startAfter(lastDoc), limit(PAGE_SIZE));
          // Filtros de fecha después de orderBy (están permitidos)
          if (dateFrom) inboundQ = query(inboundQ, where("receivedAt", ">=", zonedStartOfDayUtcMs(dateFrom)));
          if (dateTo) inboundQ = query(inboundQ, where("receivedAt", "<=", zonedEndOfDayUtcMs(dateTo)));
        }

        const inboundSnap = await getDocs(inboundQ);
        const inboundDocs = inboundSnap.docs;
        const newRows = inboundDocs.map((d) => ({ id: d.id, ...(d.data() as Omit<Inbound, "id">) }));

        // Evitar duplicados
        const existingIds = new Set(rows.map((r) => r.id));
        const uniqueNewRows = newRows.filter((r) => !existingIds.has(r.id));

        const combinedRows = [...rows, ...uniqueNewRows];
        combinedRows.sort((a, b) => Number(b.receivedAt || 0) - Number(a.receivedAt || 0));
        setRows(combinedRows);
        setLastDoc(inboundDocs[inboundDocs.length - 1] ?? null);
        setHasMore(inboundDocs.length === PAGE_SIZE);

        // Cargar boxes adicionales para los nuevos inbounds
        const newInboundIds = uniqueNewRows.map((r) => r.id);
        let updatedBoxes = boxes;
        if (newInboundIds.length > 0) {
          const chunks = chunk(newInboundIds, 10);
          const boxSnaps = await Promise.all(
            chunks.map((ids) =>
              getDocs(query(collection(db, "boxes"), where("itemIds", "array-contains-any", ids)))
            )
          );
          const newBoxes = boxSnaps.flatMap((s) => s.docs).map((d) => ({ id: d.id, ...(d.data() as Omit<Box, "id">) }));
          
          // Deduplicar newBoxes por id (una caja puede matchear varios chunks)
          const uniqNew = Array.from(new Map(newBoxes.map(b => [b.id, b])).values());
          
          // Merge sin duplicados
          const existingBoxIds = new Set(boxes.map((b) => b.id));
          const uniqueNewBoxes = uniqNew.filter((b) => !existingBoxIds.has(b.id));
          updatedBoxes = [...boxes, ...uniqueNewBoxes];
          setBoxes(updatedBoxes);
        }

        // Cargar alertas y shipments para los nuevos rows (después de setBoxes, usando boxes actualizadas)
        await loadAlertsAndShipmentsForRows(uniqueNewRows, updatedBoxes);
      }
    } catch (e) {
      console.error("[HistorialTracking] Error loading more:", e);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }

  async function openBoxDetailByInbound(inboundId: string) {
    const b = boxByInbound[inboundId];
    if (!b) return;
    await openBoxDetailByBoxId(b.id);
  }

  async function handleReindex() {
    const user = auth.currentUser;
    if (!user) {
      alert("Debes estar autenticado para reindexar.");
      return;
    }

    setReindexing(true);
    try {
      const idToken = await user.getIdToken();
      const body: any = {
        batchSize: 200,
      };

      if (reindexStats?.lastId) {
        body.startAfterId = reindexStats.lastId;
      }

      const res = await fetch("/api/admin/search/reindex-inbounds", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Error: ${data.error || "Error al reindexar"}`);
        return;
      }

      const data = await res.json();
      setReindexStats({
        processed: (reindexStats?.processed || 0) + data.processed,
        updated: (reindexStats?.updated || 0) + data.updated,
        skipped: (reindexStats?.skipped || 0) + data.skipped,
        lastId: data.lastId,
        hasMore: data.hasMore,
      });
    } catch (e: any) {
      console.error("[HistorialTracking] Error reindexing:", e);
      alert("Error al reindexar.");
    } finally {
      setReindexing(false);
    }
  }

  async function handleReindexNames() {
    const user = auth.currentUser;
    if (!user) {
      alert("Debes estar autenticado para reindexar.");
      return;
    }

    setReindexNamesRunning(true);
    try {
      const idToken = await user.getIdToken();
      const body: any = {
        batchSize: 200,
      };

      if (reindexNamesStats?.lastId) {
        body.startAfterId = reindexNamesStats.lastId;
      }

      const res = await fetch("/api/admin/search/reindex-inbounds-clienttokens", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Error: ${data.error || "Error al reindexar nombres"}`);
        return;
      }

      const data = await res.json();
      setReindexNamesStats({
        processed: (reindexNamesStats?.processed || 0) + data.processed,
        updated: (reindexNamesStats?.updated || 0) + data.updated,
        skipped: (reindexNamesStats?.skipped || 0) + data.skipped,
        lastId: data.lastId,
        hasMore: data.hasMore,
      });
    } catch (e: any) {
      console.error("[HistorialTracking] Error reindexing names:", e);
      alert("Error al reindexar nombres.");
    } finally {
      setReindexNamesRunning(false);
    }
  }

  function deleteTracking(row: Inbound) {
    if (!isStaffState) {
      alert("Sin permisos para eliminar trackings.");
      return;
    }
    // Solo si está recibido y no pertenece a ninguna caja
    if (row.status !== 'received' || boxByInbound[row.id]) {
      alert('Solo se pueden eliminar trackings recibidos y que no estén dentro de una caja.');
      return;
    }
    setDeleteTarget(row);
    setDeleteErr(null);
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'inboundPackages', deleteTarget.id));
      setRows(prev => prev.filter(r => r.id !== deleteTarget.id));
      setDeleteOpen(false);
      setDeleteTarget(null);
    } catch (e) {
      setDeleteErr("No se pudo eliminar. Intentá nuevamente.");
    } finally {
      setDeleting(false);
    }
  }

  // CSV helpers
  function csvEscape(value: any): string {
    const s = String(value ?? "");
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function downloadCsvWithBom(rows: Record<string, any>[], headers: { key: string; label: string }[], filename: string) {
    const headerLine = headers.map(h => csvEscape(h.label)).join(",");
    const dataLines = rows.map(r => headers.map(h => csvEscape(r[h.key])).join(","));
    const csv = "\uFEFF" + [headerLine, ...dataLines].join("\r\n"); // BOM + CRLF
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Export CSV handler for boxes
  // Export CSV handler for boxes
  async function handleExportCsv() {
    // Staff only. Partners must not export global data.
    if (!isStaffState) {
      alert("Sin permisos para exportar.");
      return;
    }

    // Use already-loaded clients in state (avoids global read surprises).
    const clientsById: Record<string, { name?: string; code?: string }> = {};
    clients.forEach((c: any) => {
      if (!c?.id) return;
      clientsById[c.id] = { name: c?.name, code: c?.code };
    });

    const rows = boxes.map(b => ({
      code: b.code,
      client: clientsById[b.clientId]?.name || b.clientId, // nombre visible
      country: b.country,
      type: b.type,
      items: (b.itemIds?.length || 0),
      weightLb: (Number(b.weightLb || 0)).toFixed(2),
      weightKg: lbToKg(Number(b.weightLb || 0), 2).toFixed(2),
    }));

    const headers = [
      { key: "code", label: "Caja" },
      { key: "client", label: "Cliente" },
      { key: "country", label: "País" },
      { key: "type", label: "Tipo" },
      { key: "items", label: "Items" },
      { key: "weightLb", label: "Peso (lb)" },
      { key: "weightKg", label: "Peso (kg)" },
    ];

    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");

    downloadCsvWithBom(rows, headers, `preparado-${yyyy}${mm}${dd}.csv`);
  }
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      // Si estamos en modo búsqueda global (searchMode o clientSearchMode), el filtro ya se hizo en Firestore
      // Solo aplicar filtro en memoria si NO estamos en ningún modo de búsqueda global
      if (!searchMode && !clientSearchMode) {
        const client = clientsById[r.clientId];
        const clientText = client ? `${client.code} ${client.name}`.toLowerCase() : "";
        if (qClient && !clientText.includes(qClient.toLowerCase())) return false;
        if (qTracking && !r.tracking.toLowerCase().includes(qTracking.toLowerCase())) return false;
      }
      
      // Para "received" y "boxed", el filtro ya se aplicó server-side cuando NO estamos en searchMode/clientSearchMode
      // Solo aplicar filtro adicional en memoria:
      // - "received": verificar que no esté en una box (sólo sueltos) - solo cuando NO es searchMode/clientSearchMode
      // - "alerted": mantener lógica especial de alertas (siempre en memoria)
      // - searchMode/clientSearchMode: no aplicar filtro por status (búsquedas globales tienen prioridad)
      if (searchMode || clientSearchMode) {
        // En búsqueda global, no filtramos por status (búsquedas globales tienen prioridad)
      } else if (statusFilter === 'received' || statusFilter === 'boxed') {
        // El status ya está filtrado server-side, pero para "received" verificamos que no esté en box
        if (statusFilter === 'received' && boxByInbound[r.id]) return false; // sólo sueltos
        // Para "boxed", el status ya está filtrado server-side, no necesitamos verificación adicional
      }
      
      if (statusFilter === 'alerted') {
        // "alerted" siempre se filtra en memoria (lógica especial)
        if (!alertedTrackings.has(r.tracking.toUpperCase())) return false;
      }
      
      return true;
    });
  }, [rows, clientsById, qClient, qTracking, statusFilter, boxByInbound, alertedTrackings, searchMode, clientSearchMode]);

  // Función para obtener timestamp de una box (para ordenamiento)
  function getBoxTs(b: Box): number {
    const tsFromItems = Math.max(
      ...(b.itemIds || []).map((id) => rowsById[id]?.receivedAt || 0),
      0
    );
    return Number(
      (b as any).updatedAt ||
      (b as any).closedAt ||
      (b as any).createdAt ||
      tsFromItems ||
      0
    );
  }

  const filteredBoxes = useMemo(() => {
    if (statusFilter !== 'boxed') return [] as Box[];
    // filtra por cliente y por fechas usando aprox fecha del primer item (si tuviera)
    const filtered = boxes
      .filter(b => (b.itemIds?.length || 0) > 0)
      .filter(b => {
        const c = clientsById[b.clientId];
        const clientText = c ? `${c.code} ${c.name}`.toLowerCase() : '';
        if (qClient && !clientText.includes(qClient.toLowerCase())) return false;
        return true;
      });
    // Ordenar por más reciente arriba
    filtered.sort((a, b) => getBoxTs(b) - getBoxTs(a));
    return filtered;
  }, [boxes, statusFilter, clientsById, qClient, rowsById]);

  return (
    <main className="min-h-[100dvh] bg-[#02120f] text-white flex flex-col items-center p-4 md:p-8 pt-24 md:pt-28">
      <style jsx global>{`
        .lem-date { color-scheme: dark; }
        .lem-date::-webkit-calendar-picker-indicator {
          filter: invert(1) brightness(1.8) !important;
          opacity: 0.95;
        }
      `}</style>
      {authError ? (
        <div className="w-full max-w-6xl mb-4 rounded-lg border border-white/10 bg-white/5 p-4 text-white/80">
          {authError}
        </div>
      ) : null}
      <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-4 md:p-6 space-y-6">
        <h1 className="text-2xl font-semibold">Historial de tracking</h1>
        <p className="text-sm text-white/60">
          Todos los trackings: empacados (en caja) y sin empacar (sueltos en warehouse).
        </p>

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
            {searchMode && (
              <p className="text-xs text-white/60">Búsqueda global por tracking (tokens).</p>
            )}
          </div>
          {/* Filtro por fecha en TZ America/New_York (consulta en UTC) */}
          <input
            type="date"
            className={inputCls + " lem-date"}
            style={INPUT_BG_STYLE}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="Desde"
          />
          {/* Filtro por fecha en TZ America/New_York (consulta en UTC) */}
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
            onChange={(val) => setStatusFilter(val as any)}
            options={[
              { value: "all", label: "Todos" },
              { value: "alerted", label: "Alertados" },
              { value: "received", label: "Recibido" },
              { value: "boxed", label: "Consolidado" },
            ]}
            placeholder="Filtrar estado"
          />
        </div>

        <div className="flex flex-row gap-2 mb-2">
          {isStaffState ? (
            <button
              type="button"
              className={btnSecondaryCls}
              onClick={handleExportCsv}
            >
              Exportar CSV
            </button>
          ) : null}
        </div>

        <div className="overflow-x-auto border rounded">
          {statusFilter === "boxed" ? (
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-white/80">
                <tr>
                  <th className="text-left p-2">Caja</th>
                  <th className="text-left p-2">Cliente</th>
                  <th className="text-left p-2">Tipo</th>
                  <th className="text-left p-2">Items</th>
                  <th className="text-left p-2">Peso</th>
                  <th className="text-left p-2">Estado</th>
                  <th className="text-left p-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredBoxes.map((b) => {
                  const c = clientsById[b.clientId];
                  const cliente = c?.code ? `${c.code} ${c.name}` : b.clientId;
                  return (
                    <tr key={b.id} className="border-t border-white/10">
                      <td className="p-2">
                        <button
                          className="underline text-sm text-white/80 hover:text-white"
                          onClick={() => openBoxDetailByBoxId(b.id)}
                        >
                          {b.code}
                        </button>
                      </td>
                      <td className="p-2">{cliente}</td>
                      <td className="p-2">
                        {b.type === "FRANQUICIA" ? "Franquicia" : "Comercial"}
                      </td>
                      <td className="p-2">{b.itemIds?.length || 0}</td>
                      <td className="p-2 whitespace-nowrap">{fmtWeightPairFromLb(Number(b.weightLb || 0))}</td>
                      <td className="p-2">
                        <StatusBadge scope="package" status="boxed" />
                      </td>
                      <td className="p-2">
                        <button
                          className="inline-flex items-center justify-center rounded-md border border-[#1f3f36] bg-white/5 px-3 py-1.5 text-white/90 hover:bg-white/10"
                          onClick={() => openBoxDetailByBoxId(b.id)}
                        >
                          Ver
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!filteredBoxes.length ? (
                  <tr>
                    <td className="p-3 text-white/40" colSpan={7}>
                      Sin cajas.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-white/80">
                <tr>
                  <th className="text-left p-2">Fecha</th>
                  <th className="text-left p-2">Cliente</th>
                  <th className="text-left p-2">Tracking</th>
                  <th className="text-left p-2">Carrier</th>
                  <th className="text-left p-2">Peso</th>
                  <th className="text-left p-2">Caja</th>
                  <th className="text-left p-2">Estado</th>
                  <th className="text-left p-2">Foto</th>
                  <th className="text-left p-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Para filtro "alerted": mostrar inboundPackages alertados + alertas sin inboundPackage
                  if (statusFilter === "alerted") {
                    const rowTrackings = new Set(filtered.map((r) => String(r.tracking || "").toUpperCase()));
                    const inboundRows = filtered.filter((r) => alertedTrackings.has(String(r.tracking || "").toUpperCase()));
                    const alertOnlyRows = openAlerts.filter((alert) => !rowTrackings.has(alert.tracking));
                    
                    return (
                      <>
                        {/* InboundPackages alertados */}
                        {inboundRows.map((r) => {
                          const c = clientsById[r.clientId];
                          const cliente = c?.code
                            ? `${c.code} ${c.name}`
                            : r.clientId;
                          return (
                            <tr key={r.id} className="border-t border-white/10">
                              <td className="p-2">
                                {r.receivedAt
                                  ? new Date(r.receivedAt).toLocaleDateString()
                                  : "-"}
                              </td>
                              <td className="p-2">{cliente}</td>
                              <td className="p-2 font-mono text-sm">
                                <a
                                  className="underline text-white/80 hover:text-white"
                                  href={`/admin/trackings/${r.id}`}
                                >
                                  {r.tracking}
                                </a>
                              </td>
                              <td className="p-2">{r.carrier}</td>
                              <td className="p-2 whitespace-nowrap">
                                {fmtWeightPairFromLb(Number(r.weightLb || 0))}
                              </td>
                              <td className="p-2">
                                {boxByInbound[r.id]?.code ? (
                                  <button
                                    className="underline text-sm text-white/80 hover:text-white"
                                    onClick={() => openBoxDetailByInbound(r.id)}
                                  >
                                    {boxByInbound[r.id]?.code}
                                  </button>
                                ) : (
                                  "-"
                                )}
                              </td>
                              <td className="p-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {(() => {
                                    const box = boxByInbound[r.id];
                                    const sid = box?.shipmentId;
                                    const sh = sid ? shipmentsById[sid] : undefined;
                                    const shipStatus = sh?.status;

                                    if (r.status === "received") {
                                      return (
                                        <>
                                          <StatusBadge scope="package" status="received" />
                                        </>
                                      );
                                    }

                                    if (r.status === "boxed") {
                                      if (shipStatus === "shipped") {
                                        return (
                                          <>
                                            <StatusBadge scope="shipment" status="shipped" />
                                          </>
                                        );
                                      }
                                      if (shipStatus === "arrived" || shipStatus === "closed") {
                                        return (
                                          <>
                                            <StatusBadge scope="shipment" status="arrived" />
                                          </>
                                        );
                                      }
                                      return (
                                        <>
                                          <StatusBadge scope="package" status="boxed" />
                                        </>
                                      );
                                    }

                                    return <span className="text-xs">{r.status}</span>;
                                  })()}
                                  {alertedTrackings.has(r.tracking.toUpperCase()) && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-900/40 text-yellow-300 border border-yellow-700/50">
                                      Alertado
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-2">
                                {r.photoUrl ? (
                                  <a
                                    href={r.photoUrl}
                                    target="_blank"
                                    title="Ver foto"
                                    aria-label="Ver foto"
                                    className="inline-flex items-center justify-center text-white/80 hover:text-white"
                                  >
                                    <IconPhoto />
                                  </a>
                                ) : (
                                  <span className="text-white/40">-</span>
                                )}
                              </td>
                              <td className="p-2">
                                {isStaffState && !boxByInbound[r.id] && r.status === "received" ? (
                                  <button
                                    className="inline-flex items-center justify-center rounded border px-1.5 py-1 text-white/80 hover:text-red-400 hover:border-red-400"
                                    title="Eliminar"
                                    onClick={() => deleteTracking(r)}
                                  >
                                    <IconTrash />
                                  </button>
                                ) : (
                                  <span className="text-white/40">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {/* Alertas sin inboundPackage */}
                        {alertOnlyRows.map((alert) => {
                          const c = clientsById[alert.clientId];
                          const cliente = c?.code
                            ? `${c.code} ${c.name}`
                            : alert.clientId;
                          return (
                            <tr key={`alert-${alert.id}`} className="border-t border-white/10 opacity-75">
                              <td className="p-2">
                                {alert.createdAt
                                  ? new Date(alert.createdAt).toLocaleDateString()
                                  : "-"}
                              </td>
                              <td className="p-2">{cliente}</td>
                              <td className="p-2 font-mono text-sm">{alert.tracking}</td>
                              <td className="p-2 text-white/40">-</td>
                              <td className="p-2 text-white/40">-</td>
                              <td className="p-2 text-white/40">-</td>
                              <td className="p-2">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-900/40 text-yellow-300 border border-yellow-700/50">
                                  Alertado
                                </span>
                              </td>
                              <td className="p-2 text-white/40">-</td>
                              <td className="p-2 text-white/40">-</td>
                            </tr>
                          );
                        })}
                      </>
                    );
                  }
                  
                  // Para otros filtros: comportamiento normal
                  const rowsToShow = statusFilter === "received"
                    ? filtered.filter((r) => !boxByInbound[r.id])
                    : filtered;
                  
                  return rowsToShow.map((r) => {
                    const c = clientsById[r.clientId];
                    const cliente = c?.code
                      ? `${c.code} ${c.name}`
                      : r.clientId;
                    return (
                      <tr key={r.id} className="border-t border-white/10">
                        <td className="p-2">
                          {r.receivedAt
                            ? new Date(r.receivedAt).toLocaleDateString()
                            : "-"}
                        </td>
                        <td className="p-2">{cliente}</td>
                        <td className="p-2 font-mono text-sm">
                          <a
                            className="underline text-white/80 hover:text-white"
                            href={`/admin/trackings/${r.id}`}
                          >
                            {r.tracking}
                          </a>
                        </td>
                        <td className="p-2">{r.carrier}</td>
                        <td className="p-2 whitespace-nowrap">
                          {fmtWeightPairFromLb(Number(r.weightLb || 0))}
                        </td>
                        <td className="p-2">
                          {boxByInbound[r.id]?.code ? (
                            <button
                              className="underline text-sm text-white/80 hover:text-white"
                              onClick={() => openBoxDetailByInbound(r.id)}
                            >
                              {boxByInbound[r.id]?.code}
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="p-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {(() => {
                              const box = boxByInbound[r.id];
                              const sid = box?.shipmentId;
                              const sh = sid ? shipmentsById[sid] : undefined;
                              const shipStatus = sh?.status;

                              if (r.status === "received") {
                                return (
                                  <>
                                    <StatusBadge scope="package" status="received" />
                                  </>
                                );
                              }

                              if (r.status === "boxed") {
                                if (shipStatus === "shipped") {
                                  return (
                                    <>
                                      <StatusBadge scope="shipment" status="shipped" />
                                    </>
                                  );
                                }
                                if (shipStatus === "arrived" || shipStatus === "closed") {
                                  return (
                                    <>
                                      <StatusBadge scope="shipment" status="arrived" />
                                    </>
                                  );
                                }
                                return (
                                  <>
                                    <StatusBadge scope="package" status="boxed" />
                                  </>
                                );
                              }

                              return <span className="text-xs">{r.status}</span>;
                            })()}
                            {alertedTrackings.has(r.tracking.toUpperCase()) && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-900/40 text-yellow-300 border border-yellow-700/50">
                                Alertado
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2">
                          {r.photoUrl ? (
                            <a
                              href={r.photoUrl}
                              target="_blank"
                              title="Ver foto"
                              aria-label="Ver foto"
                              className="inline-flex items-center justify-center text-white/80 hover:text-white"
                            >
                              <IconPhoto />
                            </a>
                          ) : (
                            <span className="text-white/40">-</span>
                          )}
                        </td>
                        <td className="p-2">
                          {isStaffState && !boxByInbound[r.id] && r.status === "received" ? (
                            <button
                              className="inline-flex items-center justify-center rounded border px-1.5 py-1 text-white/80 hover:text-red-400 hover:border-red-400"
                              title="Eliminar"
                              onClick={() => deleteTracking(r)}
                            >
                              <IconTrash />
                            </button>
                          ) : (
                            <span className="text-white/40">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  });
                })()}
                {!rows.length ? (
                  <tr>
                    <td className="p-3 text-white/40" colSpan={9}>
                      Sin datos aún.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </div>

        {/* Paginación */}
        <div className="space-y-3 pt-4 border-t border-white/10">
          <p className="text-sm text-white/60">
            Buscando en los últimos {rows.length} cargados. Cargar más para ampliar.
          </p>
          {hasMore ? (
            <button
              className={btnSecondaryCls}
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Cargando…" : "Cargar más"}
            </button>
          ) : (
            <p className="text-sm text-white/40">No hay más registros.</p>
          )}
        </div>

        {/* Reindexación - Solo superadmin */}
        {roleState === "superadmin" && (
          <div className="space-y-3 pt-4 border-t border-white/10">
            <button
              className={btnSecondaryCls}
              onClick={handleReindex}
              disabled={reindexing}
            >
              {reindexing ? "Reindexando…" : "Reindexar búsqueda (200)"}
            </button>
            {reindexStats && (
              <div className="space-y-1 text-sm">
                <p className="text-white/80">Procesados {reindexStats.processed}</p>
                <p className="text-white/80">Actualizados {reindexStats.updated}</p>
                <p className="text-white/80">Omitidos {reindexStats.skipped}</p>
                {reindexStats.hasMore ? (
                  <p className="text-white/60">Volvé a apretar</p>
                ) : (
                  <p className="text-white/60">Reindex completo</p>
                )}
              </div>
            )}
            
            <button
              className={btnSecondaryCls}
              onClick={handleReindexNames}
              disabled={reindexNamesRunning}
            >
              {reindexNamesRunning ? "Reindexando…" : "Reindexar nombres (200)"}
            </button>
            {reindexNamesStats && (
              <div className="space-y-1 text-sm">
                <p className="text-white/80">Procesados {reindexNamesStats.processed}</p>
                <p className="text-white/80">Actualizados {reindexNamesStats.updated}</p>
                <p className="text-white/80">Omitidos {reindexNamesStats.skipped}</p>
                {reindexNamesStats.hasMore ? (
                  <p className="text-white/60">Volvé a apretar</p>
                ) : (
                  <p className="text-white/60">Reindex completo</p>
                )}
              </div>
            )}
          </div>
        )}

        <BoxDetailModal {...modalProps} />

        {/* Delete confirmation modal */}
        {deleteOpen && deleteTarget && (
          <div 
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="max-w-md w-full rounded-xl bg-[#071f19] border border-[#1f3f36] ring-1 ring-white/10 p-4 text-white">
              <div className="text-lg font-semibold text-white mb-2">Eliminar tracking</div>
              <div className="text-sm text-white/80 mb-4">
                ¿Seguro que querés eliminar el tracking {deleteTarget.tracking}?
              </div>
              {deleteErr && (
                <div className="mb-4 text-sm text-rose-300">
                  {deleteErr}
                </div>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  className={btnSecondaryCls}
                  onClick={() => setDeleteOpen(false)}
                  disabled={deleting}
                >
                  Cancelar
                </button>
                <button
                  className="inline-flex items-center justify-center h-10 px-4 rounded-md border border-rose-400/60 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30 focus:outline-none focus:ring-2 focus:ring-rose-400 disabled:opacity-50"
                  onClick={confirmDelete}
                  disabled={deleting}
                >
                  {deleting ? "Eliminando…" : "Eliminar"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}