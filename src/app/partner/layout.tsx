// src/app/partner/layout.tsx
"use client";

import { PartnerContextProvider, usePartnerContext } from "@/components/PartnerContext";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabBtn = (active: boolean) =>
  `px-4 h-10 text-sm font-semibold rounded-full flex items-center justify-center transition ${
    active
      ? "bg-[#005f40] text-white font-bold shadow"
      : "text-white/80 hover:text-white hover:bg-white/10"
  }`;

function PartnerNav() {
  const pathname = usePathname();
  const isActive = (path: string) => pathname === path || pathname?.startsWith(path + "/");

  return (
    <nav className="inline-flex items-center gap-1 rounded-full bg-[#0f2a22] p-1 ring-1 ring-[#1f3f36]">
      <Link href="/partner/clientes" className={tabBtn(isActive("/partner/clientes"))}>
        Clientes
      </Link>
      <Link href="/partner/historial" className={tabBtn(isActive("/partner/historial"))}>
        Historial
      </Link>
      <Link href="/partner/cajas" className={tabBtn(isActive("/partner/cajas"))}>
        Cajas
      </Link>
      <Link href="/partner/envios" className={tabBtn(isActive("/partner/envios"))}>
        Envíos
      </Link>
    </nav>
  );
}

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
        <header className="flex flex-col items-center gap-3">
          <h1 className="text-2xl font-semibold text-white">Partner</h1>
          <PartnerNav />
        </header>
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

