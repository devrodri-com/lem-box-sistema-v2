// src/app/mi/_context/MiContext.tsx
"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

interface MiContextValue {
  uid: string;
  clientId: string;
  loading: boolean;
  error: string | null;
}

const MiContext = createContext<MiContextValue | undefined>(undefined);

export function useMiContext() {
  const context = useContext(MiContext);
  if (context === undefined) {
    throw new Error("useMiContext must be used within MiProvider");
  }
  return context;
}

export function MiProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [uid, setUid] = useState<string>("");
  const [clientId, setClientId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) {
        setLoading(false);
        router.replace("/acceder");
        return;
      }
      setUid(u.uid);
      
      try {
        // Enforce that only client users can access /mi (defense-in-depth).
        // We check token claims first (source of truth for privileged roles).
        const tokenResult = await u.getIdTokenResult(true);
        const claimRole = String((tokenResult.claims as any)?.role || "");
        if (claimRole && claimRole !== "client") {
          setLoading(false);
          router.replace("/acceder");
          return;
        }

        // Solo leer users/{uid} directamente (sin queries globales)
        type UserDocData = { clientId?: string; role?: string; uid?: string; email?: string; displayName?: string };
        let userDocData: UserDocData | null = null;

        try {
          const directSnap = await getDoc(doc(db, "users", u.uid));
          if (directSnap.exists()) {
            userDocData = directSnap.data() as UserDocData;
          }
        } catch (e) {
          console.error("Error reading user doc:", e);
          setErr("No se pudo cargar tu perfil. Contactá soporte.");
          setLoading(false);
          return;
        }

        if (!userDocData) {
          setErr("Tu usuario no está vinculado a un cliente. Contactá soporte.");
          setLoading(false);
          return;
        }

        const resolvedRole = String(userDocData.role ?? "");
        if (resolvedRole && resolvedRole !== "client") {
          setLoading(false);
          router.replace("/acceder");
          return;
        }

        const cid = String(userDocData.clientId ?? "");
        if (!cid) {
          setErr("Tu usuario no está vinculado a un cliente. Contactá soporte.");
          setLoading(false);
          return;
        }

        // Verificar que el cliente existe (solo lectura directa, sin queries)
        try {
          const clientSnap = await getDoc(doc(db, "clients", cid));
          if (!clientSnap.exists()) {
            setErr("No se pudo cargar tu cuenta. Contactá soporte.");
            setLoading(false);
            return;
          }
        } catch (e) {
          console.error("Error reading client doc:", e);
          setErr("No se pudo cargar tu cuenta. Contactá soporte.");
          setLoading(false);
          return;
        }

        setClientId(cid);
        setLoading(false);
      } catch (e) {
        console.error("Error in auth state change:", e);
        setErr("Error al cargar tu sesión. Intentá nuevamente.");
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  if (loading) {
    return (
      <main className="min-h-[100dvh] bg-[#02120f] grid place-items-center p-6">
        <div className="text-sm text-white/60">Cargando…</div>
      </main>
    );
  }
  if (err) {
    return (
      <main className="min-h-[100dvh] grid place-items-center p-6">
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>
      </main>
    );
  }

  return (
    <MiContext.Provider value={{ uid, clientId, loading: false, error: null }}>
      {children}
    </MiContext.Provider>
  );
}

