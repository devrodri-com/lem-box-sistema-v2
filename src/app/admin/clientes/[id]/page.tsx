// src/app/admin/clientes/[id]/page.tsx
"use client";
import RequireAuth from "@/components/RequireAuth";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Client, Inbound, Box } from "@/types/lem";
import { auth } from "@/lib/firebase";
import { getIdTokenResult } from "firebase/auth";

const COUNTRIES: string[] = [
  'Uruguay','Argentina','United States'
];

const STATES_BY_COUNTRY: Record<string, string[]> = {
  Uruguay: [
    'Artigas','Canelones','Cerro Largo','Colonia','Durazno','Flores','Florida','Lavalleja','Maldonado','Montevideo','Paysandú','Río Negro','Rivera','Rocha','Salto','San José','Soriano','Tacuarembó','Treinta y Tres'
  ],
  'United States': [
    'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'
  ]
};

const DOC_TYPES: string[] = ["Cédula", "DNI", "Pasaporte", "RUT", "Otro"];

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
  const [client, setClient] = useState<Client | null>(null);
  const [form, setForm] = useState<Partial<Client> & { state?: string; city?: string }>({});
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"datos" | "trackings" | "cajas">("datos");
  const [inbounds, setInbounds] = useState<Inbound[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [boxDetailOpen, setBoxDetailOpen] = useState(false);
  const [detailBox, setDetailBox] = useState<Box | null>(null);
  type DetailItem = { id: string; tracking: string; weightLb: number; photoUrl?: string };
  const [detailItems, setDetailItems] = useState<DetailItem[]>([]);

  const boxByInbound = useMemo(() => {
    const map: Record<string, Box> = {};
    for (const b of boxes) {
      for (const iid of (b.itemIds || [])) map[iid] = b;
    }
    return map;
  }, [boxes]);

  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [pw1, setPw1] = useState<string>("");
  const [pw2, setPw2] = useState<string>("");
  const [pwSaving, setPwSaving] = useState<boolean>(false);
  const [pwMsg, setPwMsg] = useState<string>("");

  // User role and partner admins
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [effectiveRole, setEffectiveRole] = useState<string | null>(null);
  const [roleResolved, setRoleResolved] = useState<boolean>(false);
  const [roleResolveError, setRoleResolveError] = useState<string | null>(null);
  const [isStaff, setIsStaff] = useState<boolean>(false);
  const [partnerAdmins, setPartnerAdmins] = useState<Array<{ uid: string; email: string; displayName?: string }>>([]);
  const [hasAccess, setHasAccess] = useState<boolean>(false);

  // Helper to normalize role from inputRole or legacy claims (back-compat)
  function normalizeRole(inputRole: string | null, claims: Record<string, unknown>): string | null {
    // Si inputRole es string válido, usarlo
    if (typeof inputRole === "string" && inputRole.trim()) {
      return inputRole;
    }
    // Back-compat: si claims.superadmin === true, devolver "superadmin"
    if (claims.superadmin === true) {
      return "superadmin";
    }
    // Opcional: si claims.admin === true, devolver "admin"
    if (claims.admin === true) {
      return "admin";
    }
    return null;
  }

  // Helper functions for role checking (based on effectiveRole)
  function isStaffRole(role: string | null): boolean {
    return role === "superadmin" || role === "admin" || role === "operador";
  }

  function isPartnerRole(role: string | null): boolean {
    return role === "partner_admin";
  }

  // Unified styles
  const inputCls = "h-11 w-full rounded-md border border-[#1f3f36] !bg-[#0f2a22] px-3 !text-white caret-white placeholder:text-white/40 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#005f40]";
  const labelCls = "text-xs font-medium text-white/60";
  const cardCls = "rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-4 md:p-6";

  // Button utility classes
  const btnPrimaryCls = "inline-flex items-center justify-center h-11 px-5 rounded-md bg-[#eb6619] text-white font-medium shadow-md hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
  const btnSecondaryCls = "inline-flex items-center justify-center h-11 px-5 rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white/90 font-medium shadow-sm hover:bg-white/5 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
  const tabBtn = (active: boolean) =>
    `px-3 h-9 text-sm font-semibold rounded-full transition ${active ? 'bg-[#005f40] text-white shadow' : 'text-white/80 hover:bg-white/10'}`;

  // Validar acceso después de cargar cliente
  useEffect(() => {
    // BLOQUEAR validación hasta tener userId y role resueltos (usar roleResolved, no userRole === null)
    if (!userId || !roleResolved) {
      console.log("[DEBUG clientes/[id]/page] Bloqueando validación - userId:", userId, "roleResolved:", roleResolved);
      setHasAccess(false);
      return;
    }

    // Si role es desconocido, no autorizado
    if (!effectiveRole || (!isStaffRole(effectiveRole) && !isPartnerRole(effectiveRole))) {
      console.warn("[DEBUG clientes/[id]/page] Role desconocido:", effectiveRole);
      setHasAccess(false);
      return;
    }

    // Si es staff, tiene acceso a todos los clientes
    if (isStaffRole(effectiveRole)) {
      setHasAccess(true);
      return;
    }

    // Si es partner_admin, validar que el cliente le pertenece (solo si ya cargamos el cliente)
    if (isPartnerRole(effectiveRole) && userId && client) {
      const clientManagerUid = client.managerUid;
      if (clientManagerUid !== userId) {
        console.warn("[DEBUG clientes/[id]/page] Partner intentando acceder a cliente ajeno:", {
          userId,
          clientManagerUid,
          clientId: id
        });
        setHasAccess(false);
        return;
      }
      // Si el managerUid coincide, tiene acceso
      setHasAccess(true);
      return;
    }

    // Si es partner pero aún no cargamos el cliente, esperar (hasAccess queda false)
    if (isPartnerRole(effectiveRole) && !client) {
      setHasAccess(false);
      return;
    }
  }, [userId, effectiveRole, roleResolved, client, id]);

  // cargar cliente y movimientos (bloquear hasta tener userId y role)
  useEffect(() => {
    // BLOQUEAR carga hasta tener userId y role resueltos (usar roleResolved, no userRole === null)
    if (!id || !userId || !roleResolved) {
      console.log("[DEBUG clientes/[id]/page] Bloqueando carga de datos - id:", id, "userId:", userId, "roleResolved:", roleResolved);
      return;
    }

    // Si role es desconocido, no ejecutar query
    if (!effectiveRole || (!isStaffRole(effectiveRole) && !isPartnerRole(effectiveRole))) {
      console.warn("[DEBUG clientes/[id]/page] Role desconocido, no ejecutando query:", effectiveRole);
      return;
    }
    (async () => {
      const snap = await getDoc(doc(db, "clients", id));
      const data = snap.data() as (Omit<Client, "id"> | undefined);
      if (data) {
        const c: Client = { id: snap.id, ...data };
        setClient(c);
        setForm(c);
      }
      // Inbounds: try with index; fallback w/o orderBy and sort in-memory
      try {
        const qIn = query(
          collection(db, "inboundPackages"),
          where("clientId", "==", id),
          orderBy("receivedAt", "desc")
        );
        const inSn = await getDocs(qIn);
        setInbounds(
          inSn.docs.map((docSnap) => {
            const d = docSnap.data() as Omit<Inbound, "id">;
            return { id: docSnap.id, ...d } as Inbound;
          })
        );
      } catch {
        const qIn2 = query(
          collection(db, "inboundPackages"),
          where("clientId", "==", id)
        );
        const inSn2 = await getDocs(qIn2);
        const list = inSn2.docs.map((s) => ({ id: s.id, ...(s.data() as Omit<Inbound, "id">) })) as Inbound[];
        list.sort((a, b) => (Number(b.receivedAt || 0) - Number(a.receivedAt || 0)));
        setInbounds(list);
      }

      // Boxes: try with index; fallback w/o orderBy and sort in-memory
      try {
        const qBox = query(
          collection(db, "boxes"),
          where("clientId", "==", id),
          orderBy("createdAt", "desc")
        );
        const bxSn = await getDocs(qBox);
        setBoxes(
          bxSn.docs.map((docSnap) => {
            const d = docSnap.data() as Omit<Box, "id">;
            return { id: docSnap.id, ...d } as Box;
          })
        );
      } catch {
        const qBox2 = query(
          collection(db, "boxes"),
          where("clientId", "==", id)
        );
        const bxSn2 = await getDocs(qBox2);
        const listB = bxSn2.docs.map((s) => ({ id: s.id, ...(s.data() as Omit<Box, "id">) })) as Box[];
        listB.sort((a, b) => (Number(b.createdAt || 0) - Number(a.createdAt || 0)));
        setBoxes(listB);
      }
    })();
  }, [id, userId, effectiveRole, roleResolved]);

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) {
      setIsSuperAdmin(false);
      setUserId(null);
      return;
    }
    setUserId(u.uid);
    getIdTokenResult(u).then(r => {
      const claims = r.claims as Record<string, unknown>;
      // SOLO usar claims.role (no claims["admin"], claims["superadmin"], etc.)
      const role = (claims.role as string) || null;
      
      // Logs temporales para verificación manual
      console.log("[DEBUG clientes/[id]/page] role:", role, "userId:", u.uid, "claims:", claims);
      
      setUserRole(role);
      
      // Normalizar role usando helper (back-compat con claims legacy)
      const normalized = normalizeRole(role, claims);
      setEffectiveRole(normalized);
      setRoleResolved(true);
      setRoleResolveError(null);
      
      // Whitelist explícita para staff (no usar claims legacy)
      const ok = isStaffRole(normalized);
      setIsSuperAdmin(ok && normalized === "superadmin");
      setIsStaff(ok);
      
      // Si role es null/undefined o desconocido, no autorizado
      if (!normalized || (!isStaffRole(normalized) && !isPartnerRole(normalized))) {
        console.warn("[DEBUG clientes/[id]/page] Role desconocido o null:", normalized);
        setIsStaff(false);
        setIsSuperAdmin(false);
        return;
      }
      
      // If staff, load partner admins
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
    }).catch((err) => {
      setRoleResolveError(err?.message || "Error al obtener permisos");
      setRoleResolved(true);
      // Fallback: try Firestore
      getDoc(doc(db, "users", u.uid))
        .then((snap) => {
          if (snap.exists()) {
            const data = snap.data();
            const role = data.role || null;
            
            console.log("[DEBUG clientes/[id]/page] Fallback - role:", role, "userId:", u.uid);
            
            setUserRole(role);
            
            // Normalizar role (sin claims en fallback, solo usar role de Firestore)
            const normalized = normalizeRole(role, {});
            setEffectiveRole(normalized);
            setRoleResolved(true);
            setRoleResolveError(null);
            
            // Whitelist explícita para staff
            const ok = isStaffRole(normalized);
            setIsSuperAdmin(ok && normalized === "superadmin");
            setIsStaff(ok);
            
            // Si role es null/undefined o desconocido, no autorizado
            if (!normalized || (!isStaffRole(normalized) && !isPartnerRole(normalized))) {
              console.warn("[DEBUG clientes/[id]/page] Fallback - Role desconocido o null:", normalized);
              setIsStaff(false);
              setIsSuperAdmin(false);
              return;
            }
            
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
            setEffectiveRole(null);
          }
        })
        .catch((err) => {
          setRoleResolveError(err?.message || "Error al obtener permisos");
          setRoleResolved(true);
        });
    });
  }, []);

  // Si userRole es null pero hay userId, intentar resolver desde token claims
  useEffect(() => {
    if (!userId || userRole !== null || roleResolved) return;
    
    const u = auth.currentUser;
    if (!u) return;
    
    getIdTokenResult(u)
      .then((r) => {
        const claims = r.claims as Record<string, unknown>;
        const normalized = normalizeRole(null, claims);
        console.log("[DEBUG clientes/[id]/page] Resolviendo role desde claims - normalized:", normalized, "claims:", claims);
        setEffectiveRole(normalized);
        setRoleResolved(true);
        setRoleResolveError(null);
        
        const ok = isStaffRole(normalized);
        setIsSuperAdmin(ok && normalized === "superadmin");
        setIsStaff(ok);
        
        if (ok && normalized) {
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
      .catch((err) => {
        console.error("[DEBUG clientes/[id]/page] Error al resolver role desde claims:", err);
        setRoleResolveError(err?.message || "Error al obtener permisos");
        setRoleResolved(true);
      });
  }, [userId, userRole, roleResolved]);

  const canSave = useMemo(() => !!form?.name && !!form?.code && !!form?.country, [form]);

  const canSetPassword = useMemo(() => isSuperAdmin && pw1.length >= 8 && pw1 === pw2, [isSuperAdmin, pw1, pw2]);

  async function save() {
    if (!client || !canSave) return;
    setSaving(true);
    try {
      const payload: Partial<Client> & { state?: string; city?: string } = {
        code: form.code!,
        name: form.name!,
        email: form.email || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
        country: form.country!,
        state: form.state || undefined,
        city: form.city || undefined,
        contact: (form as any).contact || undefined,
        docType: (form as any).docType || undefined,
        docNumber: (form as any).docNumber || undefined,
        postalCode: (form as any).postalCode || undefined,
        emailAlt: (form as any).emailAlt || undefined,
        activo: form.activo !== false,
      };
      
      // Solo staff puede modificar managerUid
      if (isStaff && (form as any).managerUid !== undefined) {
        (payload as any).managerUid = (form as any).managerUid || null;
      }
      // partner_admin NO puede cambiar managerUid (se mantiene el valor original)
      
      const sanitized = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined)) as Partial<Client>;
      await updateDoc(doc(db, "clients", String(client.id)), sanitized as any);
      setClient({ ...(client as Client), ...(payload as Partial<Client>) });
    } finally {
      setSaving(false);
    }
  }

  async function setNewPassword() {
    if (!client || !canSetPassword) return;
    setPwSaving(true);
    setPwMsg("");
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/update-client-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ clientId: client.id, newPassword: pw1 })
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      setPwMsg("Contraseña actualizada");
      setPw1("");
      setPw2("");
    } catch (e: any) {
      setPwMsg(`Error: ${e?.message || e}`);
    } finally {
      setPwSaving(false);
    }
  }

  async function openBoxDetailByBoxId(boxId: string) {
    const b = boxes.find(x => x.id === boxId);
    if (!b) return;
    setDetailBox(b);
    setBoxDetailOpen(true);
    try {
      const items: DetailItem[] = [];
      for (const iid of (b.itemIds || [])) {
        const s = await getDoc(doc(db, "inboundPackages", iid));
        if (s.exists()) {
          const d = s.data() as any;
          items.push({ id: s.id, tracking: d.tracking, weightLb: d.weightLb || 0, photoUrl: d.photoUrl });
        }
      }
      setDetailItems(items);
    } catch {
      setDetailItems([]);
    }
  }

// Mostrar "Sin permisos" si roleResolved pero no hay effectiveRole
if (roleResolved && !effectiveRole) {
  return (
    <main className="min-h-[100dvh] bg-[#02120f] text-white flex flex-col items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-md rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 space-y-4 text-center">
        <h2 className="text-xl font-semibold text-white">Sin permisos</h2>
        <p className="text-sm text-white/60">
          No se pudieron obtener los permisos necesarios para acceder a esta página.
        </p>
        {roleResolveError && (
          <p className="text-xs text-red-300 bg-red-900/30 border border-red-500/50 rounded p-2">
            {roleResolveError}
          </p>
        )}
        <button
          onClick={async () => {
            const u = auth.currentUser;
            if (u) {
              await u.getIdToken(true);
              window.location.reload();
            }
          }}
          className="w-full h-11 px-4 rounded-md bg-[#eb6619] text-white font-medium hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#eb6619]"
        >
          Refrescar sesión
        </button>
      </div>
    </main>
  );
}

// Validación de acceso: bloquear render hasta tener userId y role resueltos (usar roleResolved, no userRole === null)
if (!userId || !roleResolved) {
  return (
    <main className="min-h-[100dvh] bg-[#02120f] text-white p-4 md:p-8 pt-24 md:pt-28">
      <p className="text-sm text-white/60">Cargando permisos…</p>
    </main>
  );
}

// Si role es desconocido, no autorizado
if (!effectiveRole || (!isStaffRole(effectiveRole) && !isPartnerRole(effectiveRole))) {
  return (
    <main className="min-h-[100dvh] bg-[#02120f] text-white p-4 md:p-8 pt-24 md:pt-28">
      <p className="text-sm text-white/60">Sin permisos para acceder a esta página.</p>
    </main>
  );
}

// Si es partner_admin, validar que el cliente le pertenece (después de cargar)
if (isPartnerRole(effectiveRole) && userId) {
  // Si aún no cargamos el cliente, mostrar loading
  if (!client) {
    return (
      <main className="min-h-[100dvh] bg-[#02120f] text-white p-4 md:p-8 pt-24 md:pt-28">
        <p className="text-sm text-white/60">Cargando cliente…</p>
      </main>
    );
  }
  // Si el cliente existe pero no le pertenece, mostrar sin permisos
  const clientManagerUid = client.managerUid;
  if (clientManagerUid !== userId) {
    console.warn("[DEBUG clientes/[id]/page] Partner intentando acceder a cliente ajeno:", {
      userId,
      clientManagerUid,
      clientId: id
    });
    return (
      <main className="min-h-[100dvh] bg-[#02120f] text-white p-4 md:p-8 pt-24 md:pt-28">
        <p className="text-sm text-white/60">Sin permisos para acceder a este cliente.</p>
      </main>
    );
  }
}

// Si es staff y no hay cliente, puede ser que no exista
if (isStaffRole(effectiveRole) && !client) {
  return (
    <main className="min-h-[100dvh] bg-[#02120f] text-white p-4 md:p-8 pt-24 md:pt-28">
      <p className="text-sm text-white/60">Cargando cliente…</p>
    </main>
  );
}

// Si no hay cliente después de cargar, mostrar error
if (!client) {
  return (
    <main className="min-h-[100dvh] bg-[#02120f] text-white p-4 md:p-8 pt-24 md:pt-28">
      <p className="text-sm text-white/60">Cliente no encontrado.</p>
    </main>
  );
}

return (
  <main className="min-h-[100dvh] bg-[#02120f] text-white p-4 md:p-8 pt-24 md:pt-28 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/admin/clientes" className="text-sm text-white/70 hover:text-white" aria-label="Volver a clientes">← Volver a clientes</Link>
          <h1 className="text-2xl font-semibold text-white">Cliente: {client.code} {client.name}</h1>
        </div>
        <div>
          <div className="inline-flex items-center gap-1 rounded-full bg-[#0f2a22] p-1 ring-1 ring-[#1f3f36]">
            <button onClick={() => setTab("datos")} className={tabBtn(tab === "datos")}>
              Datos personales
            </button>
            <button onClick={() => setTab("trackings")} className={tabBtn(tab === "trackings")}>
              Trackings
            </button>
            <button onClick={() => setTab("cajas")} className={tabBtn(tab === "cajas")}>
              Cajas
            </button>
          </div>
        </div>
      </header>

      {tab === "datos" ? (
        <section className={cardCls}>
          <form
            onSubmit={(e) => { e.preventDefault(); save(); }}
            className="grid gap-4 md:grid-cols-20"
          >
            {/* Fila 1: Código 20% · Nombre 40% · Contacto/Referencia 40% */}
            <label className="grid gap-1 md:col-span-4">
              <span className={labelCls}>Código</span>
              <input className={`${inputCls} !bg-[#071f19] !text-white/70`} value={form.code || ""} readOnly aria-readonly="true" />
            </label>
            <label className="grid gap-1 md:col-span-8">
              <span className={labelCls}>Nombre</span>
              <input className={inputCls} value={form.name || ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <label className="grid gap-1 md:col-span-8">
              <span className={labelCls}>Contacto / Referente</span>
              <input className={inputCls} value={(form as any).contact || ""} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} />
            </label>

            {/* Fila 2: Tipo doc 20% · Nº doc 40% (el resto queda libre para futuro) */}
            <label className="grid gap-1 md:col-span-4">
              <span className={labelCls}>Tipo de documento</span>
              <BrandSelect
                value={(form as any).docType || ""}
                onChange={(val) => setForm((f) => ({ ...f, docType: val }))}
                options={[
                  { value: "", label: "Seleccionar…" },
                  ...DOC_TYPES.map((t) => ({ value: t, label: t })),
                ]}
                placeholder="Seleccionar…"
              />
            </label>
            <label className="grid gap-1 md:col-span-8">
              <span className={labelCls}>Número de documento</span>
              <input className={inputCls} value={(form as any).docNumber || ""} onChange={(e) => setForm((f) => ({ ...f, docNumber: e.target.value }))} />
            </label>
            <div className="md:col-span-8" />

            {/* Fila 3: País 30% · Estado 30% · Ciudad 40% */}
            <label className="grid gap-1 md:col-span-6">
              <span className={labelCls}>País</span>
              <BrandSelect
                value={form.country || ""}
                onChange={(val) => setForm((f) => ({ ...f, country: val, state: "" }))}
                options={COUNTRIES.map((p) => ({ value: p, label: p }))}
                placeholder="Seleccionar país…"
              />
            </label>
            <label className="grid gap-1 md:col-span-6">
              <span className={labelCls}>Estado / Depto / Provincia</span>
              <BrandSelect
                value={form.state || ""}
                onChange={(val) => setForm((f) => ({ ...f, state: val }))}
                options={(STATES_BY_COUNTRY[form.country as string] || []).map((s) => ({
                  value: s,
                  label: s,
                }))}
                placeholder="Seleccionar…"
                disabled={!form.country || !STATES_BY_COUNTRY[form.country as string]}
              />
            </label>
            <label className="grid gap-1 md:col-span-8">
              <span className={labelCls}>Ciudad</span>
              <input
                className={inputCls}
                value={form.city || ''}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </label>

            {/* Fila 4: Dirección 80% · Código postal 20% */}
            <label className="grid gap-1 md:col-span-16">
              <span className={labelCls}>Dirección</span>
              <input className={inputCls} value={form.address || ""} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </label>
            <label className="grid gap-1 md:col-span-4">
              <span className={labelCls}>Código postal</span>
              <input className={inputCls} value={(form as any).postalCode || ""} onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))} />
            </label>

            {/* Fila 5: Teléfono 30% · Email 35% · Email adicional 35% */}
            <label className="grid gap-1 md:col-span-6">
              <span className={labelCls}>Teléfono</span>
              <input className={inputCls} value={form.phone || ""} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </label>
            <label className="grid gap-1 md:col-span-7">
              <span className={labelCls}>Email</span>
              <input className={inputCls} value={form.email || ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </label>
            <label className="grid gap-1 md:col-span-7">
              <span className={labelCls}>Email adicional</span>
              <input className={inputCls} value={(form as any).emailAlt || ""} onChange={(e) => setForm((f) => ({ ...f, emailAlt: e.target.value }))} />
            </label>

            {isStaff && partnerAdmins.length > 0 ? (
              <label className="grid gap-1 md:col-span-20">
                <span className={labelCls}>Admin asociado</span>
                <BrandSelect
                  value={(form as any).managerUid || ""}
                  onChange={(val) => setForm((f) => ({ ...f, managerUid: val || null }))}
                  options={[
                    { value: "", label: "Ninguno" },
                    ...partnerAdmins.map((pa) => ({
                      value: pa.uid,
                      label: pa.displayName ? `${pa.displayName} (${pa.email})` : pa.email,
                    })),
                  ]}
                  placeholder="Seleccionar admin asociado…"
                />
              </label>
            ) : effectiveRole === "partner_admin" ? (
              <div className="md:col-span-20 text-xs text-neutral-500">
                No puedes cambiar el admin asociado de este cliente.
              </div>
            ) : null}

            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.activo !== false} onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))} />
              <span className="text-sm">Activo</span>
            </label>

            <div className="md:col-span-20 flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => client && setForm(client)} className={btnSecondaryCls}>Cancelar</button>
              <button type="submit" disabled={!canSave || saving} className={btnPrimaryCls}>
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </form>

          {isSuperAdmin ? (
            <div className="mt-6 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-4 md:p-6 grid gap-3 md:max-w-xl">
              <h3 className="font-medium">Administración · Resetear contraseña</h3>
              <p className="text-xs text-white/60">Solo super admin. Mínimo 8 caracteres. Esto cambia la contraseña del usuario del cliente.</p>
              <label className="grid gap-1">
                <span className={labelCls}>Nueva contraseña</span>
                <input type="password" className={inputCls} value={pw1} onChange={(e)=> setPw1(e.target.value)} />
              </label>
              <label className="grid gap-1">
                <span className={labelCls}>Repetir contraseña</span>
                <input type="password" className={inputCls} value={pw2} onChange={(e)=> setPw2(e.target.value)} />
              </label>
              <div className="flex items-center gap-3">
                <button onClick={setNewPassword} disabled={!canSetPassword || pwSaving} className={btnPrimaryCls}>
                  {pwSaving ? "Actualizando…" : "Actualizar contraseña"}
                </button>
                <span className="text-xs text-white/60">{pwMsg}</span>
              </div>
            </div>
          ) : null}
        </section>
      ) : tab === "trackings" ? (
        <section className="space-y-6">
          <div>
            <h2 className="font-medium mb-2">Trackings del cliente</h2>
            <div className="overflow-x-auto rounded-md border border-[#1f3f36] bg-[#071f19] ring-1 ring-white/10">
              <table className="w-full text-sm tabular-nums">
                <thead className="sticky top-0 z-10 bg-[#0f2a22] shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)]">
                  <tr>
                    <th className="text-left p-2 text-white/80 text-xs font-medium">Fecha de llegada</th>
                    <th className="text-left p-2 text-white/80 text-xs font-medium">Tracking</th>
                    <th className="text-left p-2 text-white/80 text-xs font-medium">Peso</th>
                    <th className="text-left p-2 text-white/80 text-xs font-medium">Estado</th>
                    <th className="text-left p-2 text-white/80 text-xs font-medium">Caja</th>
                    <th className="text-left p-2 text-white/80 text-xs font-medium">Factura</th>
                    <th className="text-left p-2 text-white/80 text-xs font-medium">Warehouse</th>
                  </tr>
                </thead>
                <tbody>
                  {inbounds.map((r) => (
                    <tr key={r.id} className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10">
                      <td className="p-2 text-white">{r.receivedAt ? new Date(r.receivedAt).toLocaleDateString() : '-'}</td>
                      <td className="p-2 font-mono text-white">{r.tracking}</td>
                      <td className="p-2 text-white">{Number(r.weightLb || 0).toFixed(2)} lb / {Number(r.weightKg || 0).toFixed(2)} kg</td>
                      <td className="p-2 text-white">{r.status === 'boxed' ? 'consolidado' : r.status === 'received' ? 'recibido' : r.status}</td>
                      <td className="p-2 text-white">
                        {r.id ? (boxByInbound[r.id as string]?.code || '-') : '-'}
                      </td>
                      <td className="p-2 text-white">{r.invoiceUrl ? '✔︎' : '-'}</td>
                      <td className="p-2 text-white">
                        {r.photoUrl ? (
                          <a
                            href={r.photoUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Ver foto"
                            aria-label="Ver foto"
                            className="underline text-white/90 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#005f40] rounded-sm"
                          >
                            📷
                          </a>
                        ) : (
                          ' '
                        )}
                      </td>
                    </tr>
                  ))}
                  {!inbounds.length ? (
                    <tr><td className="p-3 text-white/60" colSpan={7}>Sin paquetes aún.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "cajas" ? (
        <section className="space-y-6">
          <div>
            <h2 className="font-medium mb-2">Cajas del cliente</h2>
            <div className="overflow-x-auto rounded-md border border-[#1f3f36] bg-[#071f19] ring-1 ring-white/10">
              <table className="w-full text-sm tabular-nums">
                <thead className="sticky top-0 z-10 bg-[#0f2a22] shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)]">
                  <tr>
                    <th className="text-left p-2 text-white/80 text-xs font-medium">Código</th>
                    <th className="text-left p-2 text-white/80 text-xs font-medium">Estado</th>
                    <th className="text-left p-2 text-white/80 text-xs font-medium">Items</th>
                    <th className="text-left p-2 text-white/80 text-xs font-medium">Creada</th>
                  </tr>
                </thead>
                <tbody>
                  {boxes.map((b) => (
                    <tr key={b.id} className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10">
                      <td className="p-2 text-white">
                        <button
                          className="underline text-white/90 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#005f40] rounded-sm"
                          title="Ver caja"
                          onClick={() => { if (b.id) openBoxDetailByBoxId(b.id as string); }}
                        >
                          {b.code}
                        </button>
                      </td>
                      <td className="p-2 text-white">{b.status}</td>
                      <td className="p-2 text-white">{b.itemIds?.length || 0}</td>
                      <td className="p-2 text-white">{b.createdAt ? new Date(b.createdAt).toLocaleDateString() : '-'}</td>
                    </tr>
                  ))}
                  {!boxes.length ? (
                    <tr><td className="p-3 text-white/60" colSpan={4}>Sin cajas aún.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {boxDetailOpen && detailBox ? (
            <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center">
              <div className="w-[95vw] max-w-3xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm shadow-xl p-4 md:p-6 text-white">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Caja {detailBox.code}</h3>
                  <button className={btnSecondaryCls} onClick={() => { setBoxDetailOpen(false); setDetailBox(null); }}>Cerrar</button>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-[#0f2a22]">
                    <tr>
                      <th className="text-left p-2 text-white/80 text-xs font-medium">Tracking</th>
                      <th className="text-left p-2 text-white/80 text-xs font-medium">Peso</th>
                      <th className="text-left p-2 text-white/80 text-xs font-medium">Foto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailItems.map(i => (
                      <tr key={i.id} className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10">
                        <td className="p-2 font-mono text-white">{i.tracking}</td>
                        <td className="p-2 text-white">{(Number(i.weightLb||0)).toFixed(2)} lb</td>
                        <td className="p-2 text-white">{i.photoUrl ? (<a href={i.photoUrl} target="_blank" aria-label="Ver foto" className="underline text-white/90 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#005f40] rounded-sm">📷</a>) : (' ')}</td>
                      </tr>
                    ))}
                    {!detailItems.length ? (<tr><td className="p-3 text-white/60" colSpan={3}>Caja vacía.</td></tr>) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

interface BrandOption {
  value: string;
  label: string;
}

interface BrandSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: BrandOption[];
  placeholder: string;
  disabled?: boolean;
}

function BrandSelect({ value, onChange, options, placeholder, disabled }: BrandSelectProps) {
  const [open, setOpen] = useState(false);

  const showLabel = value
    ? options.find((o) => o.value === value)?.label ?? value
    : placeholder;

  const baseClasses =
    "h-11 w-full rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white px-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#005f40] flex items-center justify-between" +
    (disabled ? " opacity-60 cursor-not-allowed" : " cursor-pointer");

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        disabled={disabled}
        className={baseClasses + (!value ? " text-slate-400" : "")}
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev);
        }}
      >
        <span className="truncate text-left">{showLabel}</span>
        <span className="ml-2 text-white/50">▾</span>
      </button>
      {open && !disabled && options.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md bg-[#071f19] py-1 text-sm shadow-lg ring-1 ring-white/10">
          {options.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-white/90 hover:bg-white/5"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}