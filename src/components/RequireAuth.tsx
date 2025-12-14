// src/components/RequireAuth.tsx
"use client";
import { ReactNode, useEffect, useState } from "react";
import { onIdTokenChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, limit, getDocs } from "firebase/firestore";

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
        const c = tok.claims as any;
        isAdmin = Boolean(
          c?.superadmin ||
            c?.role === "admin" ||
            c?.role === "superadmin" ||
            c?.role === "partner_admin"
        );

        // 2) Si no hay rol en claims, mirar en Firestore users
        if (!isAdmin) {
          // Doc id = uid
          const snap = await getDoc(doc(db, "users", u.uid));
          let role: string | null = null;
          if (snap.exists()) {
            role = (snap.data() as any)?.role || null;
          } else {
            // fallback por si la app guardó con addDoc
            const q = query(collection(db, "users"), where("uid", "==", u.uid), limit(1));
            const s = await getDocs(q);
            if (!s.empty) role = (s.docs[0].data() as any)?.role || null;
          }
          isAdmin = role === "admin" || role === "superadmin" || role === "partner_admin";
        }

        // 3) Último fallback: si existe un doc en `admins/{uid}`, tratarlo como admin
        if (!isAdmin) {
          const a = await getDoc(doc(db, "admins", u.uid));
          if (a.exists()) isAdmin = true;
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