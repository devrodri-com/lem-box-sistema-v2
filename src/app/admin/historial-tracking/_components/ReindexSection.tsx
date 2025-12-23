// src/app/admin/historial-tracking/_components/ReindexSection.tsx
"use client";

interface ReindexStats {
  processed: number;
  updated: number;
  skipped: number;
  hasMore: boolean;
}

interface ReindexSectionProps {
  visible: boolean;
  btnClassName: string;
  onReindexTracking: () => void;
  onReindexNames: () => void;
  reindexing: boolean;
  reindexNamesRunning: boolean;
  reindexStats: ReindexStats | null;
  reindexNamesStats: ReindexStats | null;
}

export function ReindexSection({
  visible,
  btnClassName,
  onReindexTracking,
  onReindexNames,
  reindexing,
  reindexNamesRunning,
  reindexStats,
  reindexNamesStats,
}: ReindexSectionProps) {
  if (!visible) return null;

  return (
    <div className="space-y-3 pt-4 border-t border-white/10">
      <button
        className={btnClassName}
        onClick={onReindexTracking}
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
        className={btnClassName}
        onClick={onReindexNames}
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
  );
}

