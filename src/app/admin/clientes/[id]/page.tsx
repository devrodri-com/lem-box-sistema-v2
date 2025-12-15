// src/app/admin/clientes/[id]/page.tsx
"use client";

import RequireAuth from "@/components/RequireAuth";
import { ClientProfile } from "@/components/clients/ClientProfile";
import { db, auth } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getIdTokenResult } from "firebase/auth";

export default function ClientDetailPage() {
  return (
    <RequireAuth requireAdmin>
      <PageInner />
    </RequireAuth>
  );
}

function PageInner() {
  const params = useParams();
  const id = params?.id as string;
  const [partnerAdmins, setPartnerAdmins] = useState<
    Array<{ uid: string; email: string; displayName?: string }>
  >([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [isStaff, setIsStaff] = useState<boolean>(false);
  const [effectiveRole, setEffectiveRole] = useState<string | null>(null);
  const [roleResolved, setRoleResolved] = useState<boolean>(false);

  // Helper to normalize role from inputRole or legacy claims (back-compat)
  function normalizeRole(inputRole: string | null, claims: Record<string, unknown>): string | null {
    if (typeof inputRole === "string" && inputRole.trim()) {
      return inputRole;
    }
    if (claims.superadmin === true) {
      return "superadmin";
    }
    if (claims.admin === true) {
      return "admin";
    }
    return null;
  }

  function isStaffRole(role: string | null): boolean {
    return role === "superadmin" || role === "admin" || role === "operador";
  }

  // Load role and partner admins
  useEffect(() => {
    const u = auth.currentUser;
    if (!u) {
      setRoleResolved(true);
      return;
    }

    getIdTokenResult(u)
      .then((r) => {
        const claims = r.claims as Record<string, unknown>;
        const role = (claims.role as string) || null;
        const normalized = normalizeRole(role, claims);
        const ok = isStaffRole(normalized);
        setIsSuperAdmin(ok && normalized === "superadmin");
        setIsStaff(ok);
        setEffectiveRole(normalized);
        setRoleResolved(true);

        if (ok) {
          getDocs(query(collection(db, "users"), where("role", "==", "partner_admin")))
            .then((snap) => {
              const admins = snap.docs.map((d) => {
                const data = d.data();
                return {
                  uid: d.id,
                  email: data.email || "",
                  displayName: data.displayName || "",
                };
              });
              setPartnerAdmins(admins);
            })
            .catch(() => setPartnerAdmins([]));
        }
      })
      .catch(() => {
        // Fallback: try Firestore
        getDoc(doc(db, "users", u.uid))
          .then((snap) => {
            if (snap.exists()) {
              const data = snap.data();
              const role = data.role || null;
              const normalized = normalizeRole(role, {});
              const ok = isStaffRole(normalized);
              setIsSuperAdmin(ok && normalized === "superadmin");
              setIsStaff(ok);
              setEffectiveRole(normalized);
              setRoleResolved(true);

              if (ok) {
                getDocs(query(collection(db, "users"), where("role", "==", "partner_admin")))
                  .then((snap) => {
                    const admins = snap.docs.map((d) => {
                      const data = d.data();
                      return {
                        uid: d.id,
                        email: data.email || "",
                        displayName: data.displayName || "",
                      };
                    });
                    setPartnerAdmins(admins);
                  })
                  .catch(() => setPartnerAdmins([]));
              }
            } else {
              setRoleResolved(true);
            }
          })
          .catch(() => {
            setRoleResolved(true);
          });
      });
  }, []);

  if (!roleResolved || !id) {
    return (
      <main className="min-h-[100dvh] bg-[#02120f] text-white p-4 md:p-8 pt-24 md:pt-28">
        <p className="text-sm text-white/60">Cargando permisos…</p>
      </main>
    );
  }

  // Determinar mode y permisos según el rol
  const isPartner = effectiveRole === "partner_admin";
  const mode = isPartner ? "partner" : "admin";

  return (
    <ClientProfile
      clientId={id}
      mode={mode}
      permissions={{
        canDelete: false, // Not implemented yet
        canResetPassword: isSuperAdmin && isStaff,
        canEditManagerUid: isStaff,
      }}
      backHref="/admin/clientes"
      backLabel="Volver a clientes"
      partnerAdmins={isStaff ? partnerAdmins : []}
    />
  );
}
