// src/components/RequireAuth.tsx
"use client";
import { ReactNode, useEffect, useState } from "react";
import { onIdTokenChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, limit, getDocs } from "firebase/firestore";

type Role = "superadmin" | "admin" | "operador" | "partner_admin" | "client";
const ROLE_SET: ReadonlySet<string> = new Set(["superadmin", "admin", "operador", "partner_admin", "client"]);
function isRole(v: unknown): v is Role {
  return typeof v === "string" && ROLE_SET.has(v);
}
function getStringClaim(claims: Record<string, unknown>, key: string): string | undefined {
  const v = claims[key];
  return typeof v === "string" ? v : undefined;
}
function getBooleanClaim(claims: Record<string, unknown>, key: string): boolean {
  return claims[key] === true;
}

export default function RequireAuth({ children, requireAdmin = false }: { children: ReactNode; requireAdmin?: boolean }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (u) => {
      if (!u) {
        router.replace("/acceder");
        return;
      }

      let isAdmin = false;
      try {
        // 1) Intentar con custom claims
        const tok = await u.getIdTokenResult(true);
        const claims = tok.claims as Record<string, unknown>;
        const claimRoleRaw = getStringClaim(claims, "role");
        const claimRole = isRole(claimRoleRaw) ? claimRoleRaw : undefined;
        const isSuperAdminClaim = getBooleanClaim(claims, "superadmin");
        const isStaff = Boolean(
          isSuperAdminClaim ||
            claimRole === "admin" ||
            claimRole === "superadmin" ||
            claimRole === "operador"
        );
        isAdmin = isStaff;

        // 2) Si no hay rol en claims, mirar en Firestore users
        if (!isAdmin) {
          // Doc id = uid
          const snap = await getDoc(doc(db, "users", u.uid));
          let role: string | null = null;
          if (snap.exists()) {
            const data = snap.data() as Record<string, unknown>;
            const r = data["role"];
            role = isRole(r) ? r : null;
          } else {
            // fallback por si la app guardó con addDoc
            const q = query(collection(db, "users"), where("uid", "==", u.uid), limit(1));
            const s = await getDocs(q);
            if (!s.empty) {
              const data = s.docs[0].data() as Record<string, unknown>;
              const r = data["role"];
              role = isRole(r) ? r : null;
            }
          }
          // Least privilege: partner_admin in Firestore must NOT be treated as staff.
          isAdmin = role === "admin" || role === "superadmin" || role === "operador";
        }

        // 3) Último fallback: si existe un doc en `admins/{uid}`, tratarlo como staff privilegiado (admin/superadmin).
        // Para evitar que un partner termine tratado como staff por accidente, NO elevamos acá.
        if (!isAdmin) {
          // intentionally no-op (deprecated fallback)
        }
      } catch {
        isAdmin = false;
      }

      if (requireAdmin && !isAdmin) {
        // Logueado pero no admin: llevar al portal cliente
        router.replace("/mi");
        return;
      }

      setReady(true);
    });
    return () => unsub();
  }, [router, requireAdmin]);

  if (!ready) return null;
  return <>{children}</>;
}