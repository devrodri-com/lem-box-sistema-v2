// src/app/partner/layout.tsx
"use client";

import { PartnerContextProvider, usePartnerContext } from "@/components/PartnerContext";

function PartnerLayoutInner({ children }: { children: React.ReactNode }) {
  const { effectiveRole, roleResolved, error } = usePartnerContext();

  if (!roleResolved) {
    return (
      <main className="min-h-[100dvh] bg-[#02120f] text-white flex flex-col items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-md rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 text-center">
          <p className="text-sm text-white/60">Cargando permisos…</p>
        </div>
      </main>
    );
  }

  if (effectiveRole !== "partner_admin") {
    return (
      <main className="min-h-[100dvh] bg-[#02120f] text-white flex flex-col items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-md rounded-xl bg-white/5 border border-red-400/30 backdrop-blur-sm p-6 space-y-4 text-center">
          <h2 className="text-xl font-semibold text-white">Sin permisos</h2>
          <p className="text-sm text-white/60">
            No tienes permisos para acceder al área de Partner.
          </p>
          {error && (
            <p className="text-xs text-red-300 bg-red-900/30 border border-red-500/50 rounded p-2">
              {error}
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#02120f] text-white p-4 md:p-8 pt-24 md:pt-28">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        {children}
      </div>
    </main>
  );
}

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <PartnerContextProvider>
      <PartnerLayoutInner>{children}</PartnerLayoutInner>
    </PartnerContextProvider>
  );
}

