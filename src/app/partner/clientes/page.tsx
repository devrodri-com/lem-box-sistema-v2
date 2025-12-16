// src/app/partner/clientes/page.tsx
"use client";

import { ClientsManager } from "@/components/clients/ClientsManager";
import { usePartnerContext } from "@/components/PartnerContext";

export default function PartnerClientesPage() {
  const { roleResolved, effectiveRole } = usePartnerContext();

  if (!roleResolved) {
    return (
      <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 space-y-4">
        <p className="text-sm text-white/60">Cargando permisos…</p>
      </div>
    );
  }

  if (roleResolved && effectiveRole !== "partner_admin") {
    return (
      <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-red-400/30 backdrop-blur-sm p-6 space-y-2">
        <h2 className="text-lg font-semibold text-white">Sin permisos</h2>
        <p className="text-sm text-white/70">No tenés permisos para acceder a esta sección.</p>
      </div>
    );
  }

  return <ClientsManager detailHref={(id) => `/partner/clientes/${id}`} />;
}
