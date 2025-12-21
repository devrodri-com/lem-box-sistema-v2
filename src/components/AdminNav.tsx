// src/components/AdminNav.tsx
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { signOut, onIdTokenChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, query, where, limit } from "firebase/firestore";

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

export default function AdminNav() {
  const pathname = usePathname();
  const [isSuper, setIsSuper] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [claimsChecked, setClaimsChecked] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

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

  const showUsuarios = isSuper || (email === "r.opalo@icloud.com" || email === "r.opali@icloud.com");
  const adminTabs = showUsuarios
    ? [...baseTabs, { href: "/admin/facturas", label: "Facturas" }, { href: "/admin/usuarios", label: "Usuarios" }]
    : baseTabs;
  const tabs = isAdmin ? adminTabs : clientTabs;

  if (!mounted || !claimsChecked) return null;

  return (
    <header className="fixed inset-x-0 top-0 z-[100] bg-[#02120f] h-20 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.35)] border-b border-white/10">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 md:px-6">
        <Link href={isAdmin ? "/admin/ingreso" : "/mi"} className="flex items-center">
          <img src="/logo.png" alt="LEM-BOX Logo" className="h-10 md:h-12 w-auto" />
        </Link>
        <nav className="flex space-x-6">
          {tabs.map((t) => {
            const active = pathname?.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`px-2 py-2 rounded-lg text-[15px] font-medium text-white/90 no-underline hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#eb6618] ${active ? "text-[#eb6618]" : ""}`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center space-x-4">
          <a
            href="https://instagram.com/lem_box"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            className="text-white/90 hover:text-white transition"
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
            className="text-white/90 hover:text-white transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="h-6 w-6">
              <path d="M20.52 3.478A11.94 11.94 0 0012 0C5.373 0 0 5.373 0 12a11.94 11.94 0 001.67 6.01L0 24l6.08-1.66A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12 0-3.2-1.25-6.21-3.48-8.522zm-8.15 16.03a8.07 8.07 0 01-4.3-1.27l-.31-.19-2.86.78.77-2.78-.2-.29a8.07 8.07 0 011.39-10.78 7.933 7.933 0 0111.3 0 7.933 7.933 0 011.45 8.38 7.996 7.996 0 01-7.1 5.6zm4.02-6.06c-.22-.11-1.3-.64-1.5-.71-.2-.07-.34-.11-.48.11s-.55.7-.67.85c-.12.15-.25.17-.47.06a6.31 6.31 0 01-1.85-1.14 7.05 7.05 0 01-1.3-1.62c-.14-.24 0-.37.1-.49.1-.1.22-.25.33-.38.11-.13.15-.22.22-.37.07-.15.03-.28-.02-.39-.06-.11-.48-1.17-.66-1.6-.17-.43-.35-.37-.48-.38l-.41-.01c-.14 0-.37.05-.57.28-.2.23-.77.75-.77 1.83s.79 2.13.9 2.28c.11.15 1.56 2.38 3.78 3.34a13.82 13.82 0 001.7.73c.23.08.44.13.6.2.25.1.76.31.87.6.11.28.11.52.08.57-.03.05-.2.07-.42.14z" />
            </svg>
          </a>
          <button
            onClick={() => signOut(auth).then(() => (location.href = "/acceder"))}
            className="inline-flex items-center justify-center h-11 px-5 rounded-full bg-[#eb6618] text-white hover:bg-[#d15612] text-sm font-semibold transition"
            aria-label="Cerrar sesión"
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}