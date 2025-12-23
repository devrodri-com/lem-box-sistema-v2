// src/app/mi/layout.tsx
"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { MiProvider } from "./_context/MiContext";

const tabBtn = (active: boolean) =>
  `px-4 h-10 text-sm font-semibold rounded-full flex items-center justify-center transition ${
    active
      ? "bg-[#005f40] text-white font-bold shadow"
      : "text-white/80 hover:text-white hover:bg-white/10"
  }`;

export default function MiLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isActive = (path: string) => pathname === path;

  return (
    <MiProvider>
      <main className="min-h-[100dvh] p-4 md:p-8 space-y-6 bg-[#02120f]">
        <header className="flex flex-col items-center gap-3">
          <h1 className="text-2xl font-semibold text-white">Mi cuenta</h1>
          <nav className="inline-flex items-center gap-1 rounded-full bg-white/5 backdrop-blur-sm p-1 ring-1 ring-white/10">
            <Link href="/mi/historial" className={tabBtn(isActive("/mi/historial"))}>
              Historial
            </Link>
            <Link href="/mi/cajas" className={tabBtn(isActive("/mi/cajas"))}>
              Cajas
            </Link>
            <Link href="/mi/envios" className={tabBtn(isActive("/mi/envios"))}>
              Envíos
            </Link>
            <Link href="/mi/pagos" className={tabBtn(isActive("/mi/pagos"))}>
              Pagos
            </Link>
            <Link href="/mi/cuenta" className={tabBtn(isActive("/mi/cuenta"))}>
              Cuenta
            </Link>
          </nav>
        </header>
        {children}
      </main>
    </MiProvider>
  );
}
