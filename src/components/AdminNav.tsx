// src/components/AdminNav.tsx
"use client";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { signOut, onIdTokenChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, query, where, limit } from "firebase/firestore";
import { MessageCircle } from "lucide-react";

const baseTabs = [
  { href: "/admin/ingreso", label: "Ingreso" },
  { href: "/admin/preparado", label: "Preparado de carga" },
  { href: "/admin/estado-envios", label: "Estado de envíos" },
  { href: "/admin/historial-tracking", label: "Historial de tracking" },
  { href: "/admin/clientes", label: "Clientes" },
];

const clientTabs = [
  { href: "/mi", label: "Mi perfil" },
];

// Tipos mínimos para parse seguro
type NavItem = {
  href: string;
  label: string;
};

type UserLike = {
  role?: string;
  [key: string]: unknown;
};

// Helper para parse seguro
function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

// Helper tipado para determinar si un link está activo
function isActive(pathname: string, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(href + "/");
}

export default function AdminNav() {
  const pathname = usePathname() ?? "";
  const [isSuper, setIsSuper] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [claimsChecked, setClaimsChecked] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (user) => {
      if (!user) {
        setIsSuper(false);
        setIsAdmin(false);
        setEmail(null);
        setClaimsChecked(true);
        return;
      }
      try {
        const r = await user.getIdTokenResult(true);
        const c = asRecord(r.claims);
        const superadmin = Boolean(c?.superadmin === true || c?.role === "superadmin");
        const claimRole = c?.role;
        let role: string | null = (typeof claimRole === "string" ? claimRole : null) || (superadmin ? "admin" : null);

        // If no role in claims, try Firestore users collection
        if (!role) {
          // First try doc id = uid
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists()) {
            const data = snap.data();
            if (data && typeof data === "object") {
              const rec = data as Record<string, unknown>;
              const roleValue = rec.role;
              role = typeof roleValue === "string" ? roleValue : null;
            }
          } else {
            // Fallback: query by uid field
            const q = query(collection(db, "users"), where("uid", "==", user.uid), limit(1));
            const s = await getDocs(q);
            if (!s.empty) {
              const data = s.docs[0].data();
              if (data && typeof data === "object") {
                const rec = data as Record<string, unknown>;
                const roleValue = rec.role;
                role = typeof roleValue === "string" ? roleValue : null;
              }
            }
          }
        }

        setIsSuper(superadmin);
        setIsAdmin(superadmin || role === "admin" || role === "partner_admin");
        setEmail(user.email ?? null);
      } catch {
        setIsSuper(false);
        setIsAdmin(false);
        setEmail(user.email ?? null);
      } finally {
        setClaimsChecked(true);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => { setMounted(true); }, []);

  // Cerrar menú al hacer click fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  // Cerrar menú al cambiar de ruta
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const showUsuarios = isSuper || (email === "r.opalo@icloud.com" || email === "r.opali@icloud.com");
  const adminTabs = showUsuarios
    ? [...baseTabs, { href: "/admin/facturas", label: "Facturas" }, { href: "/admin/usuarios", label: "Usuarios" }]
    : baseTabs;
  const tabs = isAdmin ? adminTabs : clientTabs;

  if (!mounted || !claimsChecked) return null;

  return (
    <header className="fixed inset-x-0 top-0 z-[100] bg-[#02120f] h-20 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.35)] border-b border-white/10">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 md:px-6">
        <Link href={isAdmin ? "/admin/ingreso" : "/mi"} className="flex items-center cursor-pointer">
          <img src="/logo.png" alt="LEM-BOX Logo" className="h-10 md:h-12 w-auto" />
        </Link>
        {/* Desktop navigation - tabs horizontales */}
        <nav className="hidden lg:flex space-x-6">
          {tabs.map((t) => {
            const active = isActive(pathname, t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`px-2 py-2 text-[15px] no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#eb6618] cursor-pointer ${
                  active
                    ? "text-[#2f7d57] font-semibold border-b-2 border-[#2f7d57]"
                    : "text-white/70 hover:text-white font-medium"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        {/* Mobile/Tablet - botón hamburguesa */}
        <div className="lg:hidden relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Abrir menú"
            className="inline-flex items-center justify-center h-10 w-10 rounded-md text-white/90 hover:text-white hover:bg-white/10 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#eb6618] focus-visible:ring-offset-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-6 w-6"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          {/* Dropdown menu */}
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-[#071f19] border border-[#1f3f36] ring-1 ring-white/10 shadow-lg z-50"
            >
              {tabs.map((t) => {
                const active = isActive(pathname, t.href);
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    role="menuitem"
                    aria-current={active ? "page" : undefined}
                    className={`block px-4 py-3 text-sm no-underline hover:bg-white/10 focus:outline-none focus:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#eb6618] first:rounded-t-xl cursor-pointer ${
                      active
                        ? "text-[#2f7d57] font-semibold bg-white/5"
                        : "text-white/70 hover:text-white font-medium"
                    }`}
                    onClick={() => setMenuOpen(false)}
                  >
                    {t.label}
                  </Link>
                );
              })}
              {!isAdmin && (
                <>
                  <a
                    href="https://www.lem-box.com.uy"
                    target="_blank"
                    rel="noopener noreferrer"
                    role="menuitem"
                    className="block px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white/90 no-underline cursor-pointer hover:bg-white/10 focus:outline-none focus:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#eb6618] border-t border-white/10"
                    onClick={() => setMenuOpen(false)}
                  >
                    🇺🇾 URUGUAY
                  </a>
                  <a
                    href="https://www.lem-box.com.ar"
                    target="_blank"
                    rel="noopener noreferrer"
                    role="menuitem"
                    className="block px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white/90 no-underline cursor-pointer hover:bg-white/10 focus:outline-none focus:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#eb6618] last:rounded-b-xl"
                    onClick={() => setMenuOpen(false)}
                  >
                    🇦🇷 ARGENTINA
                  </a>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center space-x-4">
          {!isAdmin && (
            <div className="hidden md:flex items-center gap-3">
              <a
                href="https://www.lem-box.com.uy"
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-2 text-[13px] font-semibold uppercase tracking-wide text-white/80 hover:text-white cursor-pointer transition"
              >
                🇺🇾 URUGUAY
              </a>
              <a
                href="https://www.lem-box.com.ar"
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-2 text-[13px] font-semibold uppercase tracking-wide text-white/80 hover:text-white cursor-pointer transition"
              >
                🇦🇷 ARGENTINA
              </a>
            </div>
          )}
          <a
            href="https://instagram.com/lem_box"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            className="text-white/90 hover:text-white transition cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="h-6 w-6">
              <path d="M7.75 2h8.5A5.75 5.75 0 0122 7.75v8.5A5.75 5.75 0 0116.25 22h-8.5A5.75 5.75 0 012 16.25v-8.5A5.75 5.75 0 017.75 2zm0 1.5A4.25 4.25 0 003.5 7.75v8.5A4.25 4.25 0 007.75 20.5h8.5a4.25 4.25 0 004.25-4.25v-8.5A4.25 4.25 0 0016.25 3.5h-8.5zm8.75 2.25a1.25 1.25 0 110 2.5 1.25 1.25 0 010-2.5zM12 7a5 5 0 110 10 5 5 0 010-10zm0 1.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" />
            </svg>
          </a>
          <a
            href="https://wa.me/5491162152352"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="WhatsApp"
            className="text-white/90 hover:text-white transition cursor-pointer"
          >
            <MessageCircle size={22} strokeWidth={1.75} />
          </a>
          <button
            onClick={() => signOut(auth).then(() => (location.href = "/acceder"))}
            className="inline-flex items-center justify-center h-11 px-5 rounded-full bg-[#eb6618] text-white hover:bg-[#d15612] text-sm font-semibold transition cursor-pointer"
            aria-label="Cerrar sesión"
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}