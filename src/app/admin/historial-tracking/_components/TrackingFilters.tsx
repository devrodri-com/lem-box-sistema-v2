// src/app/admin/historial-tracking/_components/TrackingFilters.tsx
"use client";

import { BrandSelect } from "@/components/ui/BrandSelect";

interface TrackingFiltersProps {
  qClient: string;
  onChangeClient: (v: string) => void;
  clientHintMode: "none" | "min3" | "global";
  qTracking: string;
  onChangeTracking: (v: string) => void;
  trackingHintMode: "none" | "min3" | "global";
  dateFrom: string;
  onChangeDateFrom: (v: string) => void;
  dateTo: string;
  onChangeDateTo: (v: string) => void;
  statusFilter: 'all' | 'alerted' | 'received' | 'boxed';
  onChangeStatusFilter: (v: 'all' | 'alerted' | 'received' | 'boxed') => void;
  inputCls: string;
  inputStyle: React.CSSProperties;
  tzLabel?: string;
}

export function TrackingFilters({
  qClient,
  onChangeClient,
  clientHintMode,
  qTracking,
  onChangeTracking,
  trackingHintMode,
  dateFrom,
  onChangeDateFrom,
  dateTo,
  onChangeDateTo,
  statusFilter,
  onChangeStatusFilter,
  inputCls,
  inputStyle,
  tzLabel,
}: TrackingFiltersProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
      <div className="flex flex-col gap-1">
        <input
          className={inputCls}
          style={inputStyle}
          placeholder="Buscar por cliente"
          value={qClient}
          onChange={(e) => onChangeClient(e.target.value)}
        />
        {clientHintMode === "min3" && (
          <p className="text-xs text-white/40">Escribí al menos 3 caracteres para búsqueda global por nombre.</p>
        )}
        {clientHintMode === "global" && (
          <p className="text-xs text-white/60">Búsqueda global por nombre (tokens).</p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <input
          className={inputCls}
          style={inputStyle}
          placeholder="Buscar por tracking"
          value={qTracking}
          onChange={(e) => onChangeTracking(e.target.value)}
        />
        {trackingHintMode === "min3" && (
          <p className="text-xs text-white/40">Escribí al menos 3 caracteres para búsqueda global.</p>
        )}
        {trackingHintMode === "global" && (
          <p className="text-xs text-white/60">Búsqueda global por tracking (tokens).</p>
        )}
      </div>
      {/* Filtro por fecha en TZ America/New_York (consulta en UTC) */}
      <input
        type="date"
        className={inputCls + " lem-date"}
        style={inputStyle}
        value={dateFrom}
        onChange={(e) => onChangeDateFrom(e.target.value)}
        title="Desde"
      />
      {/* Filtro por fecha en TZ America/New_York (consulta en UTC) */}
      <input
        type="date"
        className={inputCls + " lem-date"}
        style={inputStyle}
        value={dateTo}
        onChange={(e) => onChangeDateTo(e.target.value)}
        title="Hasta"
      />
      <BrandSelect
        value={statusFilter}
        onChange={(val) => onChangeStatusFilter(val as 'all' | 'alerted' | 'received' | 'boxed')}
        options={[
          { value: "all", label: "Todos" },
          { value: "alerted", label: "Alertados" },
          { value: "received", label: "Recibido" },
          { value: "boxed", label: "Consolidado" },
        ]}
        placeholder="Filtrar estado"
      />
    </div>
  );
}

