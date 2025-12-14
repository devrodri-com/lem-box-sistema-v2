// src/components/ui/WeightCheckCard.tsx
import clsx from "clsx";
import { useWeightVerification, WeightStatus } from "@/hooks/useWeightVerification";

type Props = {
  expectedLb?: number;
  tolerancePct?: number; // ej: 0.02 = 2%
  onConfirm?: (actualLb: number, deltaLb: number, deltaPct: number) => void;
  onRetake?: () => void;
  onAttachPhoto?: () => void;
  className?: string;
};

export default function WeightCheckCard({
  expectedLb,
  tolerancePct = 0.02,
  onConfirm,
  onRetake,
  onAttachPhoto,
  className,
}: Props) {
  const { actual, setActual, deltaLb, deltaPct, status, isValid } = useWeightVerification({
    expectedLb,
    tolerancePct,
  });

  const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : " ");

  const conf = getStatusConf(status);

  function handleConfirm() {
    const val = typeof actual === "number" ? actual : parseFloat(String(actual));
    if (!Number.isFinite(val) || val <= 0) return;

    // Haptic suave si está disponible
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(10);
      } catch {}
    }
    onConfirm?.(val, deltaLb, deltaPct);
  }

  return (
    <section
      className={clsx(
        "rounded-lg p-4 ring-1 transition-[background,ring-color] duration-300 motion-reduce:transition-none",
        conf.classes,
        className
      )}
      aria-live="polite"
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Indicator kind={status} />
          <h3 className="font-medium">Verificar peso</h3>
        </div>
        {typeof expectedLb === "number" && expectedLb > 0 ? (
          <span className="text-xs text-slate-600">
            Esperado: <strong>{fmt(expectedLb)} lb</strong>
          </span>
        ) : null}
      </header>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-slate-600">Peso actual (lb)</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            value={actual === "" ? "" : actual}
            onChange={(e) => {
              const v = e.target.value;
              const parsed = v === "" ? "" : parseFloat(v);
              setActual(parsed);
            }}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            placeholder="0.00"
          />
        </label>

        <div className="text-sm grid content-center">
          {Number.isFinite(deltaLb) && Number.isFinite(deltaPct) ? (
            <div>
              <p className="text-slate-600">Diferencia</p>
              <p className="mt-1 font-medium">
                {fmt(deltaLb)} lb
                <span className="text-slate-500"> ({(deltaPct * 100).toFixed(1)}%)</span>
              </p>
              <p className={clsx("mt-1 text-xs", conf.noteClass)}>{conf.note}</p>
            </div>
          ) : (
            <p className="text-slate-600">Ingresá un peso y confirmá.</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!isValid}
          className="rounded-md bg-sky-600 text-white px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-sky-700 transition-colors"
        >
          Confirmar
        </button>
        <button
          type="button"
          onClick={onRetake}
          className="rounded-md ring-1 ring-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Re-pesar
        </button>
        <button
          type="button"
          onClick={onAttachPhoto}
          className="rounded-md ring-1 ring-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Adjuntar foto
        </button>
      </div>
    </section>
  );
}

function getStatusConf(kind: WeightStatus) {
  if (kind === "ok")
    return {
      classes: "bg-sky-50 ring-sky-200",
      note: "Peso dentro de tolerancia.",
      noteClass: "text-sky-700",
    };
  if (kind === "warn")
    return {
      classes: "bg-amber-50 ring-amber-200",
      note: "Diferencia leve. Revisá si corresponde.",
      noteClass: "text-amber-700",
    };
  if (kind === "error")
    return {
      classes: "bg-rose-50 ring-rose-200",
      note: "Diferencia alta. Recomendado re-pesar o documentar.",
      noteClass: "text-rose-700",
    };
  return {
    classes: "bg-white ring-slate-200",
    note: "Ingresá el peso para verificar.",
    noteClass: "text-slate-500",
  };
}

function Indicator({ kind }: { kind: WeightStatus }) {
  const base =
    "grid place-items-center size-6 rounded-full ring-1 ring-inset transition-all duration-300 motion-reduce:transition-none";
  if (kind === "ok") {
    return (
      <span className={clsx(base, "bg-sky-600 text-white ring-sky-600")} aria-label="OK">
        <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M7.5 13.5l-3-3 1.4-1.4 1.6 1.6 6-6 1.4 1.4z" />
        </svg>
      </span>
    );
  }
  if (kind === "warn") {
    return (
      <span className={clsx(base, "bg-amber-100 text-amber-700 ring-amber-200")} aria-label="Advertencia">
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2l10 18H2L12 2zm0 6v6m0 4h.01" />
        </svg>
      </span>
    );
  }
  if (kind === "error") {
    return (
      <span className={clsx(base, "bg-rose-100 text-rose-700 ring-rose-200")} aria-label="Error">
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2l10 18H2L12 2zm0 6v6m0 4h.01" />
        </svg>
      </span>
    );
  }
  return (
    <span className={clsx(base, "bg-slate-100 text-slate-500 ring-slate-200")} aria-label="Pendiente">
      <svg width="6" height="6" viewBox="0 0 8 8" aria-hidden="true">
        <circle cx="4" cy="4" r="3" />
      </svg>
    </span>
  );
}