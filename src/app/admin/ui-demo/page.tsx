// src/app/admin/ui-demo/page.tsx
"use client";

import StatusBadge from "@/components/ui/StatusBadge";
import StepProgress, { StepId } from "@/components/ui/StepProgress";
import WeightCheckCard from "@/components/ui/WeightCheckCard";
import { useState } from "react";

export default function Page() {
  const orden: StepId[] = ["recibido", "consolidado", "enviado", "en-transito", "en-destino"];
  const [step, setStep] = useState<StepId>("recibido");
  const idx = orden.indexOf(step);

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-xl font-semibold">UI Demo</h1>

      <div className="space-x-2">
        <StatusBadge scope="package" status="received" />
        <StatusBadge scope="package" status="boxed" />
        <StatusBadge scope="shipment" status="shipped" />
        <StatusBadge scope="shipment" status="arrived" />
        <StatusBadge scope="box" status="closed" />
      </div>

      <div className="space-y-4">
        <StepProgress current={step} />
        <div className="flex gap-2">
          <button
            className="rounded-md px-3 py-1.5 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
            onClick={() => setStep(orden[Math.max(0, idx - 1)])}
            disabled={idx <= 0}
          >
            Atrás
          </button>
          <button
            className="rounded-md px-3 py-1.5 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
            onClick={() => setStep(orden[Math.min(orden.length - 1, idx + 1)])}
            disabled={idx >= orden.length - 1}
          >
            Siguiente
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-medium text-slate-700">Verificación de peso (demo)</h2>
        <WeightCheckCard
          expectedLb={12.4}
          tolerancePct={0.02}
          onConfirm={(actual, deltaLb, deltaPct) => {
            console.log("confirm", { actual, deltaLb, deltaPct });
          }}
          onRetake={() => console.log("re-pesar")}
          onAttachPhoto={() => console.log("adjuntar foto")}
        />
      </div>
    </div>
  );
}