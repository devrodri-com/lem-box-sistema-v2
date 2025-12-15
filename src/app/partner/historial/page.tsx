// src/app/partner/historial/page.tsx
"use client";

import { usePartnerContext } from "@/components/PartnerContext";

export default function PartnerHistorialPage() {
  const { scopedClientIds, effectiveRole, uid } = usePartnerContext();

  return (
    <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 space-y-4">
      <h2 className="text-xl font-semibold text-white">Historial</h2>
      <p className="text-sm text-white/60">
        Esta sección está en construcción. Aquí podrás ver el historial de tracking de tus clientes.
      </p>
      {process.env.NODE_ENV === "development" && (
        <div className="mt-4 p-3 rounded-md bg-[#0f2a22] border border-[#1f3f36] text-xs font-mono text-white/70 space-y-1">
          <div>uid: {uid}</div>
          <div>effectiveRole: {effectiveRole}</div>
          <div>scopedClientIds.length: {scopedClientIds.length}</div>
        </div>
      )}
    </div>
  );
}

