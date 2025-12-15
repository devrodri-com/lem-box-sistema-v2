// src/app/partner/clientes/[id]/page.tsx
"use client";

import { ClientProfile } from "@/components/clients/ClientProfile";
import { usePartnerContext } from "@/components/PartnerContext";
import { useParams } from "next/navigation";

export default function PartnerClientDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { scopedClientIds, roleResolved } = usePartnerContext();

  if (!roleResolved) {
    return (
      <main className="min-h-[100dvh] bg-[#02120f] text-white p-4 md:p-8 pt-24 md:pt-28">
        <p className="text-sm text-white/60">Cargando permisos…</p>
      </main>
    );
  }

  // Validar que el cliente pertenece al scope del partner
  if (!id || !scopedClientIds.includes(id)) {
    return (
      <main className="min-h-[100dvh] bg-[#02120f] text-white p-4 md:p-8 pt-24 md:pt-28">
        <div className="w-full max-w-md rounded-xl bg-white/5 border border-red-400/30 backdrop-blur-sm p-6 space-y-4 text-center mx-auto">
          <h2 className="text-xl font-semibold text-white">Sin permisos</h2>
          <p className="text-sm text-white/60">
            No tenés acceso a este cliente.
          </p>
        </div>
      </main>
    );
  }

  return (
    <ClientProfile
      clientId={id}
      mode="partner"
      permissions={{
        canDelete: false,
        canResetPassword: false,
        canEditManagerUid: false,
      }}
      backHref="/partner/clientes"
      backLabel="Volver a clientes"
    />
  );
}

