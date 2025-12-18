// src/app/admin/historial-tracking/page.tsx
"use client";
import RequireAuth from "@/components/RequireAuth";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs, orderBy, query, getDoc, doc, deleteDoc, updateDoc, where, documentId, limit } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import type { Carrier, Client } from "@/types/lem";
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
};

export default function HistorialTrackingPage() {
  return (
    <RequireAuth requireAdmin>
      <PageInner />
    </RequireAuth>
  );
}

function PageInner() {
  const [clients, setClients] = useState<Client[]>([]);
  const [rows, setRows] = useState<Inbound[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);

  // --- Auth state for clearer behavior ---
  const [authError, setAuthError] = useState<string | null>(null);
  const [roleState, setRoleState] = useState<string | undefined>(undefined);
  const [isStaffState, setIsStaffState] = useState<boolean>(false);
  const [isPartnerState, setIsPartnerState] = useState<boolean>(false);

  const [qClient, setQClient] = useState("");
  const [qTracking, setQTracking] = useState("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<'all' | 'received' | 'boxed'>('all');

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

  useEffect(() => {
    let alive = true;

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

        // Inbounds (by clientId)
        const inboundQueries = chunk(clientKeys, 10).map((ids) => {
          let qBase: any = query(collection(db, "inboundPackages"), where("clientId", "in", ids), orderBy("receivedAt", "desc"));
          if (dateFrom) qBase = query(qBase, where("receivedAt", ">=", zonedStartOfDayUtcMs(dateFrom)));
          if (dateTo) qBase = query(qBase, where("receivedAt", "<=", zonedEndOfDayUtcMs(dateTo)));
          return getDocs(qBase);
        });
        const inboundSnaps = await Promise.all(inboundQueries);
        const inboundDocs = inboundSnaps.flatMap((s) => s.docs);
        const nextRowsRaw = inboundDocs.map((d) => ({ id: d.id, ...(d.data() as Omit<Inbound, "id">) }));
        const seen = new Set<string>();
        const nextRows = nextRowsRaw.filter((r) => {
          if (seen.has(r.id)) return false;
          seen.add(r.id);
          return true;
        });
        nextRows.sort((a, b) => Number(b.receivedAt || 0) - Number(a.receivedAt || 0));

        // Boxes (by clientId)
        const boxSnaps = await Promise.all(
          chunk(clientKeys, 10).map((ids) => getDocs(query(collection(db, "boxes"), where("clientId", "in", ids))))
        );
        const boxDocs = boxSnaps.flatMap((s) => s.docs);
        const nextBoxes = boxDocs.map((d) => ({ id: d.id, ...(d.data() as Omit<Box, "id">) }));

        if (!alive) return;
        setClients(nextClients);
        setRows(nextRows);
        setBoxes(nextBoxes);
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
      // Staff/admin: existing global behavior
      let inboundQ: any = query(collection(db, "inboundPackages"), orderBy("receivedAt", "desc"));
      if (dateFrom) inboundQ = query(inboundQ, where("receivedAt", ">=", zonedStartOfDayUtcMs(dateFrom)));
      if (dateTo) inboundQ = query(inboundQ, where("receivedAt", "<=", zonedEndOfDayUtcMs(dateTo)));

      const [cs, is, bs] = await Promise.all([
        getDocs(collection(db, "clients")),
        getDocs(inboundQ),
        getDocs(collection(db, "boxes")),
      ]);

      if (!alive) return;
      setClients(cs.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Client, "id">) })));
      setRows(is.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Inbound, "id">) })));
      setBoxes(bs.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Box, "id">) })));
    }

    void load();
    return () => {
      alive = false;
    };
  }, [dateFrom, dateTo]);

  async function openBoxDetailByInbound(inboundId: string) {
    const b = boxByInbound[inboundId];
    if (!b) return;
    await openBoxDetailByBoxId(b.id);
  }

  async function deleteTracking(row: Inbound) {
    if (!isStaffState) {
      alert("Sin permisos para eliminar trackings.");
      return;
    }
    // Solo si está recibido y no pertenece a ninguna caja
    if (row.status !== 'received' || boxByInbound[row.id]) {
      alert('Solo se pueden eliminar trackings recibidos y que no estén dentro de una caja.');
      return;
    }
    const ok = confirm(`¿Seguro que quieres eliminar el tracking ${row.tracking}?`);
    if (!ok) return;
    await deleteDoc(doc(db, 'inboundPackages', row.id));
    setRows(prev => prev.filter(r => r.id !== row.id));
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
      const client = clientsById[r.clientId];
      const clientText = client ? `${client.code} ${client.name}`.toLowerCase() : "";
      if (qClient && !clientText.includes(qClient.toLowerCase())) return false;
      if (qTracking && !r.tracking.toLowerCase().includes(qTracking.toLowerCase())) return false;
      if (statusFilter === 'received') {
        if (r.status !== 'received') return false;
        if (boxByInbound[r.id]) return false; // sólo sueltos
      }
      return true;
    });
  }, [rows, clientsById, qClient, qTracking, statusFilter, boxByInbound]);

  const filteredBoxes = useMemo(() => {
    if (statusFilter !== 'boxed') return [] as Box[];
    // filtra por cliente y por fechas usando aprox fecha del primer item (si tuviera)
    return boxes
      .filter(b => (b.itemIds?.length || 0) > 0)
      .filter(b => {
        const c = clientsById[b.clientId];
        const clientText = c ? `${c.code} ${c.name}`.toLowerCase() : '';
        if (qClient && !clientText.includes(qClient.toLowerCase())) return false;
        return true;
      });
  }, [boxes, statusFilter, clientsById, qClient]);

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
                {(statusFilter === "received"
                  ? filtered.filter((r) => !boxByInbound[r.id])
                  : filtered
                ).map((r) => {
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
                        {r.status === "boxed" ? (
                          <StatusBadge scope="package" status="boxed" />
                        ) : r.status === "received" ? (
                          <StatusBadge scope="package" status="received" />
                        ) : (
                          <span className="text-xs">{r.status}</span>
                        )}
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

        <BoxDetailModal {...modalProps} />
      </div>
    </main>
  );
}