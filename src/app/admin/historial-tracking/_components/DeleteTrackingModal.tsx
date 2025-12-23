// src/app/admin/historial-tracking/_components/DeleteTrackingModal.tsx
"use client";

const CONTROL_BORDER = "border-[#1f3f36]";
const btnSecondaryCls = `inline-flex items-center justify-center h-10 px-4 rounded-md border ${CONTROL_BORDER} bg-white/5 text-white/90 font-medium hover:bg-white/10 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed`;

interface DeleteTrackingModalProps {
  open: boolean;
  tracking?: string;
  error?: string | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteTrackingModal({
  open,
  tracking,
  error,
  deleting,
  onCancel,
  onConfirm,
}: DeleteTrackingModalProps) {
  if (!open) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-w-md w-full rounded-xl bg-[#071f19] border border-[#1f3f36] ring-1 ring-white/10 p-4 text-white">
        <div className="text-lg font-semibold text-white mb-2">Eliminar tracking</div>
        <div className="text-sm text-white/80 mb-4">
          ¿Seguro que querés eliminar el tracking {tracking}?
        </div>
        {error && (
          <div className="mb-4 text-sm text-rose-300">
            {error}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <button
            className={btnSecondaryCls}
            onClick={onCancel}
            disabled={deleting}
          >
            Cancelar
          </button>
          <button
            className="inline-flex items-center justify-center h-10 px-4 rounded-md border border-rose-400/60 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30 focus:outline-none focus:ring-2 focus:ring-rose-400 disabled:opacity-50"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? "Eliminando…" : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}

