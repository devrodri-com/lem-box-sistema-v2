// src/app/admin/historial-tracking/page.tsx
"use client";
import RequireAuth from "@/components/RequireAuth";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs, orderBy, query, getDoc, doc, deleteDoc, updateDoc, where, documentId, limit, startAfter, type QueryDocumentSnapshot, type Query, type DocumentData } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import type { Carrier, Client, Shipment } from "@/types/lem";
import StatusBadge from "@/components/ui/StatusBadge";
import { fmtWeightPairFromLb, lbToKg } from "@/lib/weight";
import { BoxDetailModal } from "@/components/boxes/BoxDetailModal";
import { useBoxDetailModal } from "@/components/boxes/useBoxDetailModal";
import { chunk } from "@/lib/utils";
import { IconPhoto, IconTrash } from "@/components/ui/icons";
import { BrandSelect, type BrandOption } from "@/components/ui/BrandSelect";
import { TZ, zonedStartOfDayUtcMs, zonedEndOfDayUtcMs } from "@/lib/timezone";
import { csvEscape, downloadCsvWithBom } from "@/lib/csv";
import { DeleteTrackingModal } from "./_components/DeleteTrackingModal";
import { ReindexSection } from "./_components/ReindexSection";
import { PaginationFooter } from "./_components/PaginationFooter";
import { TrackingFilters } from "./_components/TrackingFilters";
import { BoxesTable } from "./_components/BoxesTable";
import { InboundsTable } from "./_components/InboundsTable";
import { loadShipmentsById } from "./_lib/loadShipmentsById";
import { loadAlertedTrackings } from "./_lib/loadAlertedTrackings";
import { loadOpenAlerts, type OpenAlert } from "./_lib/loadOpenAlerts";
import { PhotoGalleryModal } from "@/components/inbounds/PhotoGalleryModal";

const CONTROL_BORDER = "border-[#1f3f36]";
const btnPrimaryCls = "inline-flex items-center justify-center h-10 px-4 rounded-md bg-[#eb6619] text-white font-medium shadow-md hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619] disabled:opacity-50 disabled:cursor-not-allowed";
const btnSecondaryCls = `inline-flex items-center justify-center h-10 px-4 rounded-md border ${CONTROL_BORDER} bg-white/5 text-white/90 font-medium hover:bg-white/10 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed`;
const inputCls = `h-10 w-full rounded-md border ${CONTROL_BORDER} bg-[#0f2a22] px-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#005f40]`;
const INPUT_BG_STYLE = {
  backgroundColor: "#0f2a22",
  WebkitBoxShadow: "0 0 0px 1000px #0f2a22 inset",
  WebkitTextFillColor: "#ffffff",
} as const;


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
  const [gallery, setGallery] = useState<{ photoUrls: string[]; tracking?: string; initialIndex?: number } | null>(null);

  // --- Auth state for clearer behavior ---
  const [authError, setAuthError] = useState<string | null>(null);
  const [roleState, setRoleState] = useState<string | undefined>(undefined);
  const [isStaffState, setIsStaffState] = useState<boolean>(false);
  const [isPartnerState, setIsPartnerState] = useState<boolean>(false);

  // --- Pagination state ---
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [managedClientIds, setManagedClientIds] = useState<string[]>([]);

  const [qClient, setQClient] = useState("");
  const [qTracking, setQTracking] = useState("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<'all' | 'alerted' | 'received' | 'boxed'>('all');
  const [alertedTrackings, setAlertedTrackings] = useState<Set<string>>(new Set());
  const [openAlerts, setOpenAlerts] = useState<OpenAlert[]>([]);
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

  // --- Bootstrap clients state ---
  const [bootstrapRunning, setBootstrapRunning] = useState(false);
  const [bootstrapStats, setBootstrapStats] = useState<{
    processed: number;
    linked: number;
    created: number;
    skipped: number;
    errors: number;
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
        const data = snap.data() as Record<string, unknown>;
        const role = typeof data?.role === "string" ? data.role : undefined;
        if (role) firestoreRole = role;
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
        const data = snap.data() as Record<string, unknown>;
        const ids = Array.isArray(data?.managedClientIds)
          ? data.managedClientIds.filter((x): x is string => typeof x === "string" && x.length > 0)
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
        let qBase: Query<DocumentData>;
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
          let qBaseStart: Query<DocumentData> = query(
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

          const shipmentsMap = await loadShipmentsById(db, shipmentIds);
          if (!alive) return;
          setShipmentsById(shipmentsMap);
            } catch (e) {
          console.error("Error loading shipments:", e);
          if (!alive) return;
          setShipmentsById({});
            }

        // Cargar alertas para los trackings visibles
        const trackings = nextRows.map((r) => r.tracking.toUpperCase());
        const alertSet = await loadAlertedTrackings(db, trackings);
        if (!alive) return;
        setAlertedTrackings(alertSet);

        // Cargar todas las alertas abiertas (para partner: solo de sus clientes gestionados)
        let allAlerts = await loadOpenAlerts(db);
        
        // Para partner: filtrar en memoria solo alertas de sus clientes gestionados
        if (isPartner && managedIds.length > 0) {
          const managedSet = new Set(managedIds);
          allAlerts = allAlerts.filter((a) => managedSet.has(a.clientId));
        }

        if (!alive) return;
        setOpenAlerts(allAlerts);
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
      let inboundQ: Query<DocumentData>;
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
        let inboundQStart: Query<DocumentData> = query(collection(db, "inboundPackages"));
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

        const shipmentsMap = await loadShipmentsById(db, shipmentIds);
        if (!alive) return;
        setShipmentsById(shipmentsMap);
      } catch (e) {
        console.error("Error loading shipments:", e);
        if (!alive) return;
        setShipmentsById({});
      }

      // Cargar alertas para los trackings visibles
      const trackings = nextRows.map((r) => r.tracking.toUpperCase());
      const alertSet = await loadAlertedTrackings(db, trackings);
      if (!alive) return;
      setAlertedTrackings(alertSet);

      // Cargar todas las alertas abiertas (para staff: todas)
      const allAlerts = await loadOpenAlerts(db);
      if (!alive) return;
      setOpenAlerts(allAlerts);
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
      const newAlertSet = await loadAlertedTrackings(db, newTrackings);
      const alertSet = new Set(alertedTrackings);
      newAlertSet.forEach((t) => alertSet.add(t));
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
          const newMap = await loadShipmentsById(db, missingShipmentIds);
          setShipmentsById((prev) => ({ ...prev, ...newMap }));
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

        let qBase: Query<DocumentData>;
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
          let qBaseStart: Query<DocumentData> = query(
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
        let inboundQ: Query<DocumentData>;
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
          let inboundQStart: Query<DocumentData> = query(collection(db, "inboundPackages"));
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[HistorialTracking] Error reindexing:", msg);
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[HistorialTracking] Error reindexing names:", msg);
      alert("Error al reindexar nombres.");
    } finally {
      setReindexNamesRunning(false);
    }
  }

  async function handleBootstrap() {
    const user = auth.currentUser;
    if (!user) {
      alert("Debes estar autenticado para vincular clientes.");
      return;
    }

    setBootstrapRunning(true);
    try {
      const idToken = await user.getIdToken(true);
      const body: Record<string, unknown> = {
        batchSize: 200,
      };

      if (bootstrapStats?.lastId) {
        body.startAfterId = bootstrapStats.lastId;
      }

      const res = await fetch("/api/admin/bootstrap-all-clients", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Error: ${data.error || data.message || "Error al vincular clientes"}`);
        return;
      }

      const data = await res.json();
      setBootstrapStats({
        processed: (bootstrapStats?.processed || 0) + data.processed,
        linked: (bootstrapStats?.linked || 0) + data.linked,
        created: (bootstrapStats?.created || 0) + data.created,
        skipped: (bootstrapStats?.skipped || 0) + data.skipped,
        errors: (bootstrapStats?.errors || 0) + data.errors,
        lastId: data.lastId,
        hasMore: data.hasMore,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[HistorialTracking] Error bootstrapping clients:", msg);
      alert(`Error al vincular clientes: ${msg}`);
    } finally {
      setBootstrapRunning(false);
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

        <TrackingFilters
          qClient={qClient}
          onChangeClient={setQClient}
          clientHintMode={qClient.trim().length > 0 && qClient.trim().length < 3 ? "min3" : (clientSearchMode ? "global" : "none")}
          qTracking={qTracking}
          onChangeTracking={setQTracking}
          trackingHintMode={qTracking.trim().length > 0 && qTracking.trim().length < 3 ? "min3" : (searchMode ? "global" : "none")}
          dateFrom={dateFrom}
          onChangeDateFrom={setDateFrom}
          dateTo={dateTo}
          onChangeDateTo={setDateTo}
          statusFilter={statusFilter}
          onChangeStatusFilter={setStatusFilter}
          inputCls={inputCls}
          inputStyle={INPUT_BG_STYLE}
        />

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
            <BoxesTable
              boxes={filteredBoxes}
              clientsById={clientsById}
              onOpenBox={(boxId) => openBoxDetailByBoxId(boxId)}
              emptyText="No hay cajas para mostrar."
            />
          ) : (
            <InboundsTable
              rows={filtered}
              clientsById={clientsById}
              boxByInbound={boxByInbound}
              shipmentsById={shipmentsById}
              alertedTrackings={alertedTrackings}
              openAlerts={openAlerts}
              isStaff={isStaffState}
              statusFilter={statusFilter}
              onOpenBox={openBoxDetailByInbound}
              onDelete={deleteTracking}
              onOpenGallery={(photoUrls, tracking) => {
                setGallery({ photoUrls, tracking, initialIndex: 0 });
              }}
            />
          )}
        </div>

        {/* Paginación */}
        <PaginationFooter
          count={rows.length}
          hasMore={hasMore}
          loading={loadingMore}
          onLoadMore={loadMore}
        />

        {/* Reindexación - Solo superadmin */}
        <ReindexSection
          visible={roleState === "superadmin"}
          btnClassName={btnSecondaryCls}
          onReindexTracking={handleReindex}
          onReindexNames={handleReindexNames}
          reindexing={reindexing}
          reindexNamesRunning={reindexNamesRunning}
          reindexStats={reindexStats && { processed: reindexStats.processed, updated: reindexStats.updated, skipped: reindexStats.skipped, hasMore: reindexStats.hasMore }}
          reindexNamesStats={reindexNamesStats && { processed: reindexNamesStats.processed, updated: reindexNamesStats.updated, skipped: reindexNamesStats.skipped, hasMore: reindexNamesStats.hasMore }}
        />

        {/* Bootstrap clients - Solo superadmin */}
        {roleState === "superadmin" && (
          <div className="space-y-3 pt-4 border-t border-white/10">
            {bootstrapStats && bootstrapStats.hasMore === false ? null : (
              <button
                className={btnSecondaryCls}
                onClick={handleBootstrap}
                disabled={bootstrapRunning || (bootstrapStats?.hasMore === false)}
              >
                {bootstrapRunning ? "Vinculando…" : (bootstrapStats?.hasMore === false) ? "Bootstrap completo" : "Vincular clientes existentes (200)"}
              </button>
            )}
            {bootstrapStats && (
              <div className="space-y-1 text-sm">
                <p className="text-white/80">Procesados {bootstrapStats.processed}</p>
                <p className="text-white/80">Vinculados {bootstrapStats.linked}</p>
                <p className="text-white/80">Creados {bootstrapStats.created}</p>
                <p className="text-white/80">Omitidos {bootstrapStats.skipped}</p>
                {bootstrapStats.errors > 0 && (
                  <p className="text-rose-300">Errores {bootstrapStats.errors}</p>
                )}
                {bootstrapStats.hasMore ? (
                  <p className="text-white/60">Volvé a apretar para continuar</p>
                ) : (
                  <p className="text-white/60">Bootstrap completo</p>
                )}
              </div>
            )}
          </div>
        )}

        <BoxDetailModal {...modalProps} />

        {/* Delete confirmation modal */}
        <DeleteTrackingModal
          open={deleteOpen}
          tracking={deleteTarget?.tracking}
          error={deleteErr}
          deleting={deleting}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={confirmDelete}
        />

        {/* Modal de galería de fotos */}
        {gallery && (
          <PhotoGalleryModal
            photoUrls={gallery.photoUrls}
            initialIndex={gallery.initialIndex}
            tracking={gallery.tracking}
            onClose={() => setGallery(null)}
          />
        )}
      </div>
    </main>
  );
}