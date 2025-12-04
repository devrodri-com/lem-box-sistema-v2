// src/app/admin/historial-tracking/page.tsx
"use client";
import RequireAuth from "@/components/RequireAuth";
import { db } from "@/lib/firebase";
import { collection, getDocs, orderBy, query, getDoc, doc, deleteDoc, updateDoc, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import type { Carrier, Client } from "@/types/lem";
import { printBoxLabel as openPrintLabel } from "@/lib/printBoxLabel";
import StatusBadge from "@/components/ui/StatusBadge";
import { fmtWeightPairFromLb, lbToKg } from "@/lib/weight";

const btnPrimaryCls = "inline-flex items-center justify-center h-10 px-4 rounded-md bg-[#eb6619] text-white font-medium shadow-md hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619] disabled:opacity-50 disabled:cursor-not-allowed";
const btnSecondaryCls = "inline-flex items-center justify-center h-10 px-4 rounded-md border border-slate-300 bg-white text-slate-800 font-medium shadow-sm hover:bg-slate-50 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed";
const inputCls = "h-10 w-full rounded-md border border-slate-300 px-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#005f40]";

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

function IconPhoto({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/>
      <circle cx="12" cy="13" r="3"/>
    </svg>
  );
}
function IconTrash({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M3 6h18"/>
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
    </svg>
  );
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

  const [boxDetailOpen, setBoxDetailOpen] = useState(false);
  const [detailBox, setDetailBox] = useState<Box | null>(null);
  type DetailItem = { id: string; tracking: string; weightLb: number; photoUrl?: string };
  const [detailItems, setDetailItems] = useState<DetailItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editType, setEditType] = useState<"COMERCIAL" | "FRANQUICIA">("COMERCIAL");
  const [labelRef, setLabelRef] = useState<string>("");

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

  const boxByInbound = useMemo(() => {
    const m: Record<string, Box> = {};
    for (const b of boxes) {
      for (const id of b.itemIds || []) m[id] = b;
    }
    return m;
  }, [boxes]);

  useEffect(() => {
    async function load() {
            let inboundQ: any = query(collection(db, "inboundPackages"), orderBy("receivedAt", "desc"));
      if (dateFrom) {
        inboundQ = query(inboundQ, where("receivedAt", ">=", zonedStartOfDayUtcMs(dateFrom)));
      }
      if (dateTo) {
        inboundQ = query(inboundQ, where("receivedAt", "<=", zonedEndOfDayUtcMs(dateTo)));
      }
      const [cs, is, bs] = await Promise.all([
        getDocs(collection(db, "clients")),
        getDocs(inboundQ),
        getDocs(collection(db, "boxes")),
      ]);
      setClients(cs.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Client,"id">) })));
      setRows(is.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Inbound,"id">) })));
      setBoxes(bs.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Box,"id">) })));
    }
    void load();
  }, [dateFrom, dateTo]);

  async function openBoxDetailByInbound(inboundId: string) {
    const b = boxByInbound[inboundId];
    if (!b) return;
    setDetailBox(b);
    setEditType((b.type as any) || "COMERCIAL");
    setLabelRef((b as any).labelRef || "");
    setBoxDetailOpen(true);
    setLoadingDetail(true);
    try {
      const items: DetailItem[] = [];
      for (const id of b.itemIds || []) {
        const snap = await getDoc(doc(db, "inboundPackages", id));
        if (snap.exists()) {
          const d = snap.data() as any;
          items.push({ id: snap.id, tracking: d.tracking, weightLb: d.weightLb || 0, photoUrl: d.photoUrl });
        }
      }
      setDetailItems(items);
    } finally {
      setLoadingDetail(false);
    }
  }

  // Abrir modal de caja por id de caja
  async function openBoxDetailByBoxId(boxId: string) {
    const b = boxes.find(x => x.id === boxId);
    if (!b) return;
    setDetailBox(b);
    setEditType((b.type as any) || "COMERCIAL");
    setLabelRef((b as any).labelRef || "");
    setBoxDetailOpen(true);
    setLoadingDetail(true);
    try {
      const items: DetailItem[] = [];
      for (const id of b.itemIds || []) {
        const snap = await getDoc(doc(db, "inboundPackages", id));
        if (snap.exists()) {
          const d = snap.data() as any;
          items.push({ id: snap.id, tracking: d.tracking, weightLb: d.weightLb || 0, photoUrl: d.photoUrl });
        }
      }
      setDetailItems(items);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function removeItemFromBox(itemId: string) {
    if (!detailBox) return;
    const remainingIds = (detailBox.itemIds || []).filter(id => id !== itemId);
    const remainingItems = detailItems.filter(i => remainingIds.includes(i.id));
    const newWeight = remainingItems.reduce((acc, i) => acc + (Number(i.weightLb) || 0), 0);
    await updateDoc(doc(db, "boxes", detailBox.id), { itemIds: remainingIds, weightLb: newWeight });
    await updateDoc(doc(db, "inboundPackages", itemId), { status: "received" });
    setDetailItems(remainingItems);
    setDetailBox({ ...detailBox, itemIds: remainingIds, weightLb: newWeight });
    setBoxes(prev => prev.map(b => b.id === detailBox.id ? { ...b, itemIds: remainingIds, weightLb: newWeight } : b));
    setRows(prev => prev.map(r => r.id === itemId ? { ...r, status: "received" } : r));
  }

  async function applyBoxTypeChange() {
    if (!detailBox) return;
    await updateDoc(doc(db, "boxes", detailBox.id), { type: editType });
    setDetailBox({ ...detailBox, type: editType });
    setBoxes(prev => prev.map(b => b.id === detailBox.id ? { ...b, type: editType } : b));
  }

  function handlePrintLabel() {
    if (!detailBox) return;
    const clientCode = clientsById[detailBox.clientId]?.code || detailBox.clientId;
    openPrintLabel({ reference: labelRef, clientCode: String(clientCode), boxCode: String(detailBox.code) });
  }

  async function saveLabelRef() {
    if (!detailBox) return;
    await updateDoc(doc(db, "boxes", detailBox.id), { labelRef });
    setDetailBox({ ...detailBox, labelRef });
  }

  async function deleteTracking(row: Inbound) {
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
// Reemplaza toda la función
async function handleExportCsv() {
  // Mapear id → nombre de cliente
  const cs = await getDocs(collection(db, "clients"));
  const clientsById: Record<string, { name?: string; code?: string }> = {};
  cs.docs.forEach(d => {
    const data = d.data() as any;
    clientsById[d.id] = { name: data?.name, code: data?.code };
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

  // --- BrandSelect helper types and component ---
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
      inputCls +
      " flex items-center justify-between pr-8 bg-white text-slate-900" +
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

  return (
    <main className="min-h-[100dvh] bg-[#02120f] text-white flex flex-col items-center p-4 md:p-8 pt-24 md:pt-28">
      <div className="w-full max-w-6xl bg-white text-neutral-900 rounded-xl shadow-md ring-1 ring-slate-200 p-4 md:p-6 space-y-6">
        <h1 className="text-2xl font-semibold">Historial de tracking</h1>
        <p className="text-sm text-neutral-600">
          Todos los trackings: empacados (en caja) y sin empacar (sueltos en warehouse).
        </p>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <input
            className="border rounded p-2"
            placeholder="Buscar por cliente"
            value={qClient}
            onChange={(e) => setQClient(e.target.value)}
          />
          <input
            className="border rounded p-2"
            placeholder="Buscar por tracking"
            value={qTracking}
            onChange={(e) => setQTracking(e.target.value)}
          />
          {/* Filtro por fecha en TZ America/New_York (consulta en UTC) */}
          <input
            type="date"
            className="border rounded p-2"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="Desde"
          />
          {/* Filtro por fecha en TZ America/New_York (consulta en UTC) */}
          <input
            type="date"
            className="border rounded p-2"
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
          <button
            type="button"
            className="inline-flex items-center justify-center h-10 px-4 rounded-md border border-slate-300 bg-white text-slate-800 font-medium shadow-sm hover:bg-slate-50 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40]"
            onClick={handleExportCsv}
          >
            Exportar CSV
          </button>
        </div>

        <div className="overflow-x-auto border rounded">
          {statusFilter === "boxed" ? (
            <table className="w-full text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="text-left p-2">Caja</th>
                  <th className="text-left p-2">Cliente</th>
                  <th className="text-left p-2">Tipo</th>
                  <th className="text-left p-2">Items</th>
                  <th className="text-left p-2">Peso</th>
                  <th className="text-left p-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredBoxes.map((b) => {
                  const c = clientsById[b.clientId];
                  const cliente = c?.code ? `${c.code} — ${c.name}` : b.clientId;
                  return (
                    <tr key={b.id} className="border-t">
                      <td className="p-2">
                        <button
                          className="underline text-sm text-neutral-700 hover:text-black"
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
                      <td className="p-2">{fmtWeightPairFromLb(Number(b.weightLb || 0))}</td>
                      <td className="p-2">
                        <button
                          className="px-2 py-1 border rounded"
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
                    <td className="p-3 text-neutral-500" colSpan={6}>
                      Sin cajas.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="text-left p-2">Fecha</th>
                  <th className="text-left p-2">Tracking</th>
                  <th className="text-left p-2">Cliente</th>
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
                    ? `${c.code} — ${c.name}`
                    : r.clientId;
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="p-2">
                        {r.receivedAt
                          ? new Date(r.receivedAt).toLocaleDateString()
                          : "-"}
                      </td>
                      <td className="p-2 font-mono text-sm">
                        <a
                          className="underline text-neutral-700 hover:text-black"
                          href={`/admin/trackings/${r.id}`}
                        >
                          {r.tracking}
                        </a>
                      </td>
                      <td className="p-2">{cliente}</td>
                      <td className="p-2">{r.carrier}</td>
                      <td className="p-2">
                        {fmtWeightPairFromLb(Number(r.weightLb || 0))}
                      </td>
                      <td className="p-2">
                        {boxByInbound[r.id]?.code ? (
                          <button
                            className="underline text-sm text-neutral-700 hover:text-black"
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
                            className="inline-flex items-center justify-center text-neutral-700 hover:text-black"
                          >
                            <IconPhoto />
                          </a>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="p-2">
                        {!boxByInbound[r.id] && r.status === "received" ? (
                          <button
                            className="inline-flex items-center justify-center rounded border px-1.5 py-1 text-neutral-700 hover:text-red-600 hover:border-red-400"
                            title="Eliminar"
                            onClick={() => deleteTracking(r)}
                          >
                            <IconTrash />
                          </button>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!rows.length ? (
                  <tr>
                    <td className="p-3 text-neutral-500" colSpan={9}>
                      Sin datos aún.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </div>

        {boxDetailOpen && detailBox ? (
          <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center">
            <div className="bg-white w-[95vw] max-w-3xl rounded-2xl shadow-xl ring-1 ring-slate-200 p-6">
              <div className="flex flex-col gap-3 mb-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold">
                    CAJA: {detailBox.code}
                  </h3>
                  <button
                    className={btnSecondaryCls}
                    onClick={() => {
                      setBoxDetailOpen(false);
                      setDetailBox(null);
                    }}
                  >
                    Cerrar
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <label className="text-sm text-neutral-600">Tipo:</label>
                  <div className="min-w-[180px]">
                    <BrandSelect
                      value={editType}
                      onChange={(val) => setEditType(val as any)}
                      options={[
                        { value: "COMERCIAL", label: "Comercial" },
                        { value: "FRANQUICIA", label: "Franquicia" },
                      ]}
                      placeholder="Seleccionar tipo"
                    />
                  </div>
                  <button
                    className={btnSecondaryCls}
                    onClick={() => {
                      void applyBoxTypeChange();
                    }}
                  >
                    Aplicar
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <label className="text-sm text-neutral-600 md:col-span-2">
                    Referencia
                    <input
                      className={inputCls}
                      value={labelRef}
                      onChange={(e) => setLabelRef(e.target.value)}
                      onBlur={() => {
                        void saveLabelRef();
                      }}
                      placeholder="Campo editable"
                    />
                  </label>
                  <div className="flex justify-end">
                    <button className={btnSecondaryCls} onClick={handlePrintLabel}>
                      Imprimir etiqueta
                    </button>
                  </div>
                </div>
              </div>
              {loadingDetail ? (
                <div className="text-sm text-neutral-500">Cargando…</div>
              ) : (
                <div className="overflow-x-auto border rounded">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-neutral-700">
                      <tr>
                        <th className="text-left p-2">Tracking</th>
                        <th className="text-left p-2">Peso</th>
                        <th className="text-left p-2">Foto</th>
                        <th className="text-left p-2">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailItems.map((i) => (
                        <tr
                          key={i.id}
                          className="border-t odd:bg-white even:bg-neutral-50 hover:bg-slate-50"
                        >
                          <td className="p-2 font-mono">{i.tracking}</td>
                          <td className="p-2">
                            {fmtWeightPairFromLb(Number(i.weightLb || 0))}
                          </td>
                          <td className="p-2">
                            {i.photoUrl ? (
                              <a
                                href={i.photoUrl}
                                target="_blank"
                                aria-label="Ver foto"
                              >
                                📷
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="p-2">
                            <button
                              className="inline-flex items-center justify-center rounded border px-1.5 py-1 text-neutral-700 hover:text-red-600 hover:border-red-400"
                              title="Eliminar de la caja"
                              onClick={() => {
                                void removeItemFromBox(i.id);
                              }}
                            >
                              <IconTrash />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!detailItems.length ? (
                        <tr>
                          <td className="p-3 text-neutral-500" colSpan={4}>
                            Caja sin items.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-4 text-sm font-medium">
                Peso total: {fmtWeightPairFromLb(Number(detailBox.weightLb || 0))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}