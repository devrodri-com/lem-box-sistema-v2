// src/components/AdminNav.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

const tabs = [
  { href: "/admin/ingreso", label: "Ingreso" },
  { href: "/admin/preparado", label: "Preparado de carga" },
  { href: "/admin/estado-envios", label: "Estado de envíos" },
  { href: "/admin/historial-envios", label: "Historial de envíos" },
  { href: "/admin/historial-tracking", label: "Historial de tracking" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/usuarios", label: "Usuarios" },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <header className="fixed top-0 inset-x-0 z-50 border-b border-black/10 bg-[#005f40] text-white">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
        <Link href="/admin/ingreso" className="font-semibold tracking-tight">
          LEM-BOX
        </Link>
        <nav className="flex items-center gap-2">
          {tabs.map((t) => {
            const active = pathname?.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`px-3 py-2 rounded text-sm hover:bg-white/10 ${active ? "bg-white/15" : ""}`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={() => signOut(auth).then(() => (location.href = "/login"))}
          className="px-3 py-2 rounded text-sm bg-[#eb6619] hover:opacity-90"
          aria-label="Cerrar sesión"
        >
          Salir
        </button>
      </div>
    </header>
  );
}