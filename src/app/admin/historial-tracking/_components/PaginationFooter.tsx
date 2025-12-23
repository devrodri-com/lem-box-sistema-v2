// src/app/admin/historial-tracking/_components/PaginationFooter.tsx
"use client";

const CONTROL_BORDER = "border-[#1f3f36]";
const btnSecondaryCls = `inline-flex items-center justify-center h-10 px-4 rounded-md border ${CONTROL_BORDER} bg-white/5 text-white/90 font-medium hover:bg-white/10 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed`;

interface PaginationFooterProps {
  count: number;
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}

export function PaginationFooter({
  count,
  hasMore,
  loading,
  onLoadMore,
}: PaginationFooterProps) {
  return (
    <div className="space-y-3 pt-4 border-t border-white/10">
      <p className="text-sm text-white/60">
        Buscando en los últimos {count} cargados. Cargar más para ampliar.
      </p>
      {hasMore ? (
        <button
          className={btnSecondaryCls}
          onClick={onLoadMore}
          disabled={loading}
        >
          {loading ? "Cargando…" : "Cargar más"}
        </button>
      ) : (
        <p className="text-sm text-white/40">No hay más registros.</p>
      )}
    </div>
  );
}

