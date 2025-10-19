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
        const c = r.claims as any;
        const superadmin = Boolean(c?.superadmin || c?.role === "superadmin");
        let role: string | null = (c?.role as string) || (superadmin ? "admin" : null);

        // If no role in claims, try Firestore users collection
        if (!role) {
          // First try doc id = uid
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists()) {
            role = (snap.data() as any)?.role || null;
          } else {
            // Fallback: query by uid field
            const q = query(collection(db, "users"), where("uid", "==", user.uid), limit(1));
            const s = await getDocs(q);
            if (!s.empty) role = (s.docs[0].data() as any)?.role || null;
          }
        }

        setIsSuper(superadmin);
        setIsAdmin(superadmin || role === "admin");
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
  const adminTabs = showUsuarios ? [...baseTabs, { href: "/admin/usuarios", label: "Usuarios" }] : baseTabs;
  const tabs = isAdmin ? adminTabs : clientTabs;

  if (!mounted || !claimsChecked) return null;

  return (
    <header className="fixed top-0 inset-x-0 z-50 border-b border-black/10 bg-[#005f40] text-white">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
        <Link href={isAdmin ? "/admin/ingreso" : "/mi"} className="font-semibold tracking-tight">
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
          onClick={() => signOut(auth).then(() => (location.href = "/acceder"))}
          className="px-3 py-2 rounded text-sm bg-[#eb6619] hover:opacity-90"
          aria-label="Cerrar sesión"
        >
          Salir
        </button>
      </div>
    </header>
  );
}