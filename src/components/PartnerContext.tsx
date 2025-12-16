// src/components/PartnerContext.tsx
"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";

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

interface PartnerContextValue {
  uid: string;
  effectiveRole: string | null;
  scopedClientIds: string[];
  roleResolved: boolean;
  error: string | null;
}

const PartnerContext = createContext<PartnerContextValue | undefined>(undefined);

export function usePartnerContext() {
  const context = useContext(PartnerContext);
  if (context === undefined) {
    throw new Error("usePartnerContext must be used within PartnerContextProvider");
  }
  return context;
}

// Helper to normalize role, enforcing least-privilege: Firestore partner_admin wins over stale claims
function normalizeRole(
  claimRole: string | null | undefined,
  claims: Record<string, unknown>,
  firestoreRole: string | null | undefined
): string | null {
  // Back-compat: superadmin legacy claim wins
  if (getBooleanClaim(claims, "superadmin")) return "superadmin";

  // Least privilege: if Firestore says partner_admin, treat as partner regardless of stale claims
  if (firestoreRole === "partner_admin") return "partner_admin";

  // Otherwise prefer claimRole if valid
  if (claimRole && isRole(claimRole)) return claimRole;

  // Fallback to Firestore role
  if (firestoreRole && isRole(firestoreRole)) return firestoreRole;

  return null;
}

export function PartnerContextProvider({ children }: { children: ReactNode }) {
  const [uid, setUid] = useState<string>("");
  const [effectiveRole, setEffectiveRole] = useState<string | null>(null);
  const [scopedClientIds, setScopedClientIds] = useState<string[]>([]);
  const [roleResolved, setRoleResolved] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) {
        setUid("");
        setEffectiveRole(null);
        setScopedClientIds([]);
        setRoleResolved(true);
        setError("No hay usuario autenticado");
        return;
      }

      setUid(u.uid);
      setError(null);

      try {
        // 1) Get token claims
        const tok = await u.getIdTokenResult(true);
        const claims = tok.claims as Record<string, unknown>;
        const claimRoleRaw = getStringClaim(claims, "role");
        const claimRole = isRole(claimRoleRaw) ? claimRoleRaw : undefined;

        // 2) Get Firestore role
        let firestoreRole: string | null | undefined = undefined;
        try {
          const snap = await getDoc(doc(db, "users", u.uid));
          if (snap.exists()) {
            const data = snap.data() as Record<string, unknown>;
            const r = data["role"];
            firestoreRole = isRole(r) ? r : null;
          }
        } catch (err) {
          console.error("[PartnerContext] Error reading users/{uid}:", err);
        }

        // 3) Normalize role (Firestore partner_admin wins)
        const normalized = normalizeRole(claimRole, claims, firestoreRole);
        setEffectiveRole(normalized);

        // 4) Resolve scopedClientIds
        let clientIds: string[] = [];

        // First: try users/{uid}.managedClientIds
        try {
          const userSnap = await getDoc(doc(db, "users", u.uid));
          if (userSnap.exists()) {
            const userData = userSnap.data() as Record<string, unknown>;
            const managedIds = userData["managedClientIds"];
            if (Array.isArray(managedIds) && managedIds.length > 0) {
              clientIds = managedIds.filter((id: unknown) => typeof id === "string" && id.trim());
            }
          }
        } catch (err) {
          console.error("[PartnerContext] Error reading managedClientIds:", err);
        }

        // Fallback: query clients where managerUid == uid
        if (clientIds.length === 0) {
          try {
            const clientsQuery = query(
              collection(db, "clients"),
              where("managerUid", "==", u.uid)
            );
            const clientsSnap = await getDocs(clientsQuery);
            clientIds = clientsSnap.docs.map((d) => d.id);
          } catch (err) {
            console.error("[PartnerContext] Error querying clients by managerUid:", err);
          }
        }

        setScopedClientIds(clientIds);

        // Logs temporales para dev
        if (process.env.NODE_ENV === "development") {
          console.log("[PartnerContext] uid:", u.uid);
          console.log("[PartnerContext] effectiveRole:", normalized);
          console.log("[PartnerContext] scopedClientIds.length:", clientIds.length);
          console.log("[PartnerContext] scopedClientIds:", clientIds);
        }

        setRoleResolved(true);
      } catch (err: any) {
        console.error("[PartnerContext] Error resolving context:", err);
        setError(err?.message || "Error al obtener permisos");
        setRoleResolved(true);
      }
    });

    return () => unsub();
  }, []);

  return (
    <PartnerContext.Provider
      value={{
        uid,
        effectiveRole,
        scopedClientIds,
        roleResolved,
        error,
      }}
    >
      {children}
    </PartnerContext.Provider>
  );
}

