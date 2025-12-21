// src/app/mi/layout.tsx
"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, limit, getDocs, setDoc } from "firebase/firestore";

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
    throw new Error("useMiContext must be used within MiLayout");
  }
  return context;
}

const tabBtn = (active: boolean) =>
  `px-4 h-10 text-sm font-semibold rounded-full flex items-center justify-center transition ${
    active
      ? "bg-[#005f40] text-white font-bold shadow"
      : "text-white/80 hover:text-white hover:bg-white/10"
  }`;

export default function MiLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
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
      // Enforce that only client users can access /mi (defense-in-depth).
      // We check token claims first (source of truth for privileged roles).
      const tokenResult = await u.getIdTokenResult(true);
      const claimRole = String((tokenResult.claims as any)?.role || "");
      if (claimRole && claimRole !== "client") {
        setLoading(false);
        router.replace("/acceder");
        return;
      }
      // mapear user->clientId (users/{uid} o query por uid)
      type UserDocData = { clientId?: string; role?: string; uid?: string; email?: string; displayName?: string };
      let userDocData: UserDocData | null = null;

      // 1) users/{uid}
      const directSnap = await getDoc(doc(db, "users", u.uid));
      if (directSnap.exists()) {
        userDocData = directSnap.data() as UserDocData;
      } else {
        // 2) query por campo uid
        const uq = query(collection(db, "users"), where("uid", "==", u.uid), limit(1));
        const us = await getDocs(uq);
        if (!us.empty) {
          userDocData = us.docs[0].data() as UserDocData;
        } else if (u.email) {
          // 3) fallback: intentar vincular por email -> clients.email == auth.email
          const cq = query(collection(db, "clients"), where("email", "==", u.email), limit(1));
          const cs = await getDocs(cq);
          if (!cs.empty) {
            const cidFound = cs.docs[0].id;
            const payload = {
              uid: u.uid,
              email: u.email!,
              displayName: u.displayName ?? "",
              clientId: cidFound,
              managedClientIds: [],
              termsAcceptedAt: Date.now(),
              lang: "es" as const,
              role: "client" as const,
            };
            await setDoc(doc(db, "users", u.uid), payload, { merge: true });
            userDocData = payload;
          }
        }
      }

      if (!userDocData) {
        setErr("No se encontró tu perfil.");
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
        setErr("No hay un cliente asignado a esta cuenta.");
        setLoading(false);
        return;
      }
      setClientId(cid);
      setLoading(false);
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

  const isActive = (path: string) => pathname === path;

  return (
    <MiContext.Provider value={{ uid, clientId, loading: false, error: null }}>
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
    </MiContext.Provider>
  );
}

