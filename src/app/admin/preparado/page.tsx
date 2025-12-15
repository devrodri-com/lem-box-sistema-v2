// src/app/admin/preparado/page.tsx
"use client";
import RequireAuth from "@/components/RequireAuth";
import { PreparadoPageInner } from "./_components";
import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { getDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

function isStaffRole(role: string | null) {
  return role === "superadmin" || role === "admin" || role === "operador";
}

function StaffGate({ children }: { children: React.ReactNode }) {
  const [resolved, setResolved] = useState(false);
  const [isStaff, setIsStaff] = useState(false);

  useEffect(() => {
    let alive = true;
    async function resolve() {
      const auth = getAuth();
      const u = auth.currentUser;
      if (!u) {
        if (!alive) return;
        setIsStaff(false);
        setResolved(true);
        return;
      }

      // Token claims (may be stale)
      const tok = await u.getIdTokenResult(true);
      const claims = (tok?.claims ?? {}) as Record<string, unknown>;
      const claimRole = typeof claims.role === "string" ? (claims.role as string) : null;

      // Back-compat legacy superadmin
      if (claims.superadmin === true) {
        if (!alive) return;
        setIsStaff(true);
        setResolved(true);
        return;
      }

      // Firestore role as source of truth
      let firestoreRole: string | null = null;
      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) {
          const data = snap.data() as any;
          firestoreRole = typeof data?.role === "string" ? data.role : null;
        }
      } catch {
        firestoreRole = null;
      }

      const effectiveRole = firestoreRole === "partner_admin" ? "partner_admin" : (claimRole ?? firestoreRole);

      if (!alive) return;
      setIsStaff(isStaffRole(effectiveRole));
      setResolved(true);
    }
    void resolve();
    return () => {
      alive = false;
    };
  }, []);

  if (!resolved) {
    return (
      <main className="min-h-[100dvh] bg-[#02120f] text-white p-4 md:p-8 pt-24 md:pt-28 flex justify-center">
        <div className="w-full max-w-3xl">
          <div className="rounded-xl bg-white/5 border border-[#1f3f36] backdrop-blur-sm p-5 text-sm text-white/70">
            Cargando permisos…
          </div>
        </div>
      </main>
    );
  }

  if (!isStaff) {
    return (
      <main className="min-h-[100dvh] bg-[#02120f] text-white p-4 md:p-8 pt-24 md:pt-28 flex justify-center">
        <div className="w-full max-w-3xl">
          <div className="rounded-xl bg-white/5 border border-red-400/30 backdrop-blur-sm p-5 text-sm text-red-200">
            Sin permisos para acceder a Preparado.
          </div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}

export default function PreparadoPage() {
  return (
    <RequireAuth requireAdmin>
      <StaffGate>
        <PreparadoPageInner />
      </StaffGate>
    </RequireAuth>
  );
}
