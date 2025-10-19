// src/components/ui/StepProgress.tsx
import clsx from "clsx";

export type StepId =
  | "recibido"
  | "consolidado"
  | "enviado"
  | "en-transito"
  | "en-destino";

type Step = { id: StepId; label: string };

const DEFAULT_STEPS: Step[] = [
  { id: "recibido",    label: "Recibido" },
  { id: "consolidado", label: "Consolidado" },
  { id: "enviado",     label: "Enviado" },
  { id: "en-transito", label: "En tránsito" },
  { id: "en-destino",  label: "En destino" },
];

type Props = {
  current: StepId;
  steps?: Step[];
  className?: string;
};

export default function StepProgress({ current, steps = DEFAULT_STEPS, className }: Props) {
  const currentIdx = Math.max(steps.findIndex(s => s.id === current), 0);

  return (
    <nav aria-label="Progreso" className={clsx("w-full", className)}>
      <ol className="flex items-center gap-3">
        {steps.map((s, i) => {
          const state: "complete" | "current" | "upcoming" =
            i < currentIdx ? "complete" : i === currentIdx ? "current" : "upcoming";

          return (
            <li key={s.id} className="flex items-center gap-3">
              <StepIcon state={state} label={s.label} />
              <span className="text-xs text-slate-600 min-w-16">{s.label}</span>
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className={clsx(
                    "h-[2px] w-8 sm:w-12 md:w-16 rounded",
                    i < currentIdx ? "bg-sky-400" : "bg-slate-200"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepIcon({ state, label }: { state: "complete" | "current" | "upcoming"; label: string }) {
  const base =
    "grid place-items-center size-6 rounded-full ring-1 ring-inset transition-all duration-300 motion-reduce:transition-none";
  if (state === "complete") {
    return (
      <span className={clsx(base, "bg-sky-600 text-white ring-sky-600")} aria-label={label}>
        <Check />
      </span>
    );
  }
  if (state === "current") {
    return (
      <span
        className={clsx(base, "bg-sky-50 text-sky-700 ring-sky-300")}
        aria-current="step"
        aria-label={label}
      >
        <Dot />
      </span>
    );
  }
  return (
    <span className={clsx(base, "bg-slate-100 text-slate-500 ring-slate-200")} aria-label={label}>
      <Dot />
    </span>
  );
}

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7.5 13.5l-3-3 1.4-1.4 1.6 1.6 6-6 1.4 1.4z" />
    </svg>
  );
}
function Dot() {
  return (
    <svg width="6" height="6" viewBox="0 0 8 8" aria-hidden="true">
      <circle cx="4" cy="4" r="3" />
    </svg>
  );
}