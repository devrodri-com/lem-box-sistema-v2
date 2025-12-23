// src/components/clients/ClientsManager.tsx
"use client";

import { db, auth } from "@/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  runTransaction,
  where,
  limit,
  type QueryConstraint,
} from "firebase/firestore";
import { useEffect, useState, useMemo } from "react";
import type { Client } from "@/types/lem";
import { getIdTokenResult } from "firebase/auth";
import { BrandSelect } from "@/components/ui/BrandSelect";
import Link from "next/link";

// Helpers para parse seguro de datos de Firestore
function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}
function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function asBoolean(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

const COUNTRIES: string[] = ["Uruguay", "Argentina", "United States"];

// Estilos dark-green LEM-BOX
const CONTROL_BORDER = "border-[#1f3f36]";
const inputCls =
  "h-10 w-full rounded-md border border-[#1f3f36] bg-[#0f2a22] px-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#005f40]";
const btnSecondaryCls =
  "inline-flex items-center justify-center h-10 px-4 rounded-md border border-[#1f3f36] bg-white/5 text-white/90 font-medium hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#005f40]";
const INPUT_BG_STYLE = {
  backgroundColor: "#0f2a22",
  WebkitBoxShadow: "0 0 0px 1000px #0f2a22 inset",
  WebkitTextFillColor: "#ffffff",
} as const;

const STATES_BY_COUNTRY: Record<string, string[]> = {
  Uruguay: [
    "Artigas",
    "Canelones",
    "Cerro Largo",
    "Colonia",
    "Durazno",
    "Flores",
    "Florida",
    "Lavalleja",
    "Maldonado",
    "Montevideo",
    "Paysandú",
    "Río Negro",
    "Rivera",
    "Rocha",
    "Salto",
    "San José",
    "Soriano",
    "Tacuarembó",
    "Treinta y Tres",
  ],
  Argentina: [
    "Buenos Aires",
    "Catamarca",
    "Chaco",
    "Chubut",
    "Córdoba",
    "Corrientes",
    "Entre Ríos",
    "Formosa",
    "Jujuy",
    "La Pampa",
    "La Rioja",
    "Mendoza",
    "Misiones",
    "Neuquén",
    "Río Negro",
    "Salta",
    "San Juan",
    "San Luis",
    "Santa Cruz",
    "Santa Fe",
    "Santiago del Estero",
    "Tierra del Fuego",
    "Tucumán",
    "CABA",
  ],
  "United States": [
    "Alabama",
    "Alaska",
    "Arizona",
    "Arkansas",
    "California",
    "Colorado",
    "Connecticut",
    "Delaware",
    "Florida",
    "Georgia",
    "Hawaii",
    "Idaho",
    "Illinois",
    "Indiana",
    "Iowa",
    "Kansas",
    "Kentucky",
    "Louisiana",
    "Maine",
    "Maryland",
    "Massachusetts",
    "Michigan",
    "Minnesota",
    "Mississippi",
    "Missouri",
    "Montana",
    "Nebraska",
    "Nevada",
    "New Hampshire",
    "New Jersey",
    "New Mexico",
    "New York",
    "North Carolina",
    "North Dakota",
    "Ohio",
    "Oklahoma",
    "Oregon",
    "Pennsylvania",
    "Rhode Island",
    "South Carolina",
    "South Dakota",
    "Tennessee",
    "Texas",
    "Utah",
    "Vermont",
    "Virginia",
    "Washington",
    "West Virginia",
    "Wisconsin",
    "Wyoming",
  ],
};

export interface ClientsManagerProps {
  detailHref?: (clientId: string) => string;
}

export function ClientsManager({ detailHref = (id) => `/admin/clientes/${id}` }: ClientsManagerProps = {}) {
  const [rows, setRows] = useState<Client[]>([]);
  const [busyId, setBusyId] = useState<string>("");
  const [q, setQ] = useState("");
  const [countryFilter, setCountryFilter] = useState<string>("");

  // Pagination state
  const [pageSize, setPageSize] = useState<number>(20);
  const [page, setPage] = useState<number>(0);

  // Form fields
  const [name, setName] = useState("");
  const [country, setCountry] = useState<string>("");
  const [documentType, setDocumentType] = useState<string>("Cédula");
  const [documentNumber, setDocumentNumber] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [emailAlt, setEmailAlt] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [address, setAddress] = useState<string>("");
  const [stateName, setStateName] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [postalCode, setPostalCode] = useState<string>("");
  const [contact, setContact] = useState<string>("");
  const [managerUid, setManagerUid] = useState<string>("");

  // User role and partner admins
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [effectiveRole, setEffectiveRole] = useState<string | null>(null);
  const [roleResolved, setRoleResolved] = useState<boolean>(false);
  const [roleResolveError, setRoleResolveError] = useState<string | null>(null);
  const [isStaff, setIsStaff] = useState<boolean>(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [partnerAdmins, setPartnerAdmins] = useState<
    Array<{ uid: string; email: string; displayName?: string }>
  >([]);

  const [openCreate, setOpenCreate] = useState(false);
  function resetForm() {
    setName("");
    setCountry("");
    setDocumentType("Cédula");
    setDocumentNumber("");
    setEmail("");
    setPassword("");
    setEmailAlt("");
    setPhone("");
    setAddress("");
    setStateName("");
    setCity("");
    setPostalCode("");
    setContact("");
    setManagerUid("");
  }

  // Helper to normalize role, enforcing least-privilege: Firestore partner_admin wins over stale claims
  function normalizeRole(
    claimRole: string | null,
    claims: Record<string, unknown>,
    firestoreRole: string | null
  ): string | null {
    // Back-compat: superadmin legacy claim wins
    if (claims.superadmin === true) return "superadmin";

    // Least privilege: if Firestore says partner_admin, treat as partner regardless of stale claims
    if (firestoreRole === "partner_admin") return "partner_admin";

    // Otherwise prefer claimRole if valid
    if (typeof claimRole === "string" && claimRole.trim()) return claimRole;

    // Fallback to Firestore role
    if (typeof firestoreRole === "string" && firestoreRole.trim()) return firestoreRole;

    return null;
  }

  // Helper functions for role checking (based on effectiveRole)
  function isStaffRole(role: string | null): boolean {
    return role === "superadmin" || role === "admin" || role === "operador";
  }

  function isPartnerRole(role: string | null): boolean {
    return role === "partner_admin";
  }

  // Get user role and uid
  useEffect(() => {
    const u = auth.currentUser;
    if (!u) return;
    setUserId(u.uid);
    getIdTokenResult(u)
      .then(async (r) => {
        const claims = r.claims as Record<string, unknown>;
        const claimRole = (claims.role as string) || null;

        // Always fetch Firestore role as a second source of truth (can correct stale claims)
        let firestoreRole: string | null = null;
        try {
          const snap = await getDoc(doc(db, "users", u.uid));
          if (snap.exists()) {
            const data = snap.data();
            if (data && typeof data === "object") {
              const rec = data as Record<string, unknown>;
              const role = rec.role;
              firestoreRole = typeof role === "string" ? role : null;
            }
          }
        } catch {
          firestoreRole = null;
        }

        // Normalize role using least-privilege reconciliation
        const normalized = normalizeRole(claimRole, claims, firestoreRole);

        setUserRole(normalized);
        setEffectiveRole(normalized);
        setRoleResolved(true);
        setRoleResolveError(null);

        // Check superadmin
        const isSuper = Boolean(claims.superadmin === true || claimRole === "superadmin" || normalized === "superadmin");
        setIsSuperAdmin(isSuper);

        // Whitelist explícita para staff (no usar negación de partner_admin)
        const staff = isStaffRole(normalized);
        setIsStaff(staff);

        // Si role es null/undefined o desconocido, no autorizado
        if (!normalized || (!isStaffRole(normalized) && !isPartnerRole(normalized))) {
          setIsStaff(false);
          return;
        }

        // Si es staff (admin/superadmin/operador), cargar lista de partner_admins
        if (staff) {
          getDocs(query(collection(db, "users"), where("role", "==", "partner_admin")))
            .then((snap) => {
              const admins = snap.docs.map((d) => {
                const data = d.data();
                if (data && typeof data === "object") {
                  const rec = data as Record<string, unknown>;
                  const email = rec.email;
                  const displayName = rec.displayName;
                  return {
                    uid: d.id,
                    email: typeof email === "string" ? email : "",
                    displayName: typeof displayName === "string" ? displayName : "",
                  };
                }
                return {
                  uid: d.id,
                  email: "",
                  displayName: "",
                };
              });
              setPartnerAdmins(admins);
            })
            .catch(() => setPartnerAdmins([]));
        }
      })
      .catch((err) => {
        setRoleResolveError(err?.message || "Error al obtener permisos");
        setRoleResolved(true);
        // Fallback duro: intentar solo Firestore
        getDoc(doc(db, "users", u.uid))
          .then((snap) => {
            if (snap.exists()) {
              const data = snap.data();
              let role: string | null = null;
              if (data && typeof data === "object") {
                const rec = data as Record<string, unknown>;
                const roleValue = rec.role;
                role = typeof roleValue === "string" ? roleValue : null;
              }

              setUserRole(role);

              // Normalizar role (sin claims en fallback, solo usar role de Firestore)
              const normalized = normalizeRole(role, {}, role);
              setEffectiveRole(normalized);
              setRoleResolved(true);
              setRoleResolveError(null);

              // Check superadmin
              const isSuper = normalized === "superadmin";
              setIsSuperAdmin(isSuper);

              // Whitelist explícita para staff
              const staff = isStaffRole(normalized);
              setIsStaff(staff);

              // Si role es null/undefined o desconocido, no autorizado
              if (!normalized || (!isStaffRole(normalized) && !isPartnerRole(normalized))) {
                setIsStaff(false);
                setIsSuperAdmin(false);
                return;
              }

              if (staff) {
                getDocs(query(collection(db, "users"), where("role", "==", "partner_admin")))
                  .then((snap) => {
                    const admins = snap.docs.map((d) => {
                      const data = d.data();
                      if (data && typeof data === "object") {
                        const rec = data as Record<string, unknown>;
                        const email = rec.email;
                        const displayName = rec.displayName;
                        return {
                          uid: d.id,
                          email: typeof email === "string" ? email : "",
                          displayName: typeof displayName === "string" ? displayName : "",
                        };
                      }
                      return {
                        uid: d.id,
                        email: "",
                        displayName: "",
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
        const normalized = normalizeRole(null, claims, null);
        setEffectiveRole(normalized);
        setRoleResolved(true);
        setRoleResolveError(null);

        // Check superadmin
        const isSuper = Boolean(claims.superadmin === true || normalized === "superadmin");
        setIsSuperAdmin(isSuper);

        const staff = isStaffRole(normalized);
        setIsStaff(staff);

        if (staff && normalized) {
          getDocs(query(collection(db, "users"), where("role", "==", "partner_admin")))
            .then((snap) => {
              const admins = snap.docs.map((d) => {
                const data = d.data();
                if (data && typeof data === "object") {
                  const rec = data as Record<string, unknown>;
                  const email = rec.email;
                  const displayName = rec.displayName;
                  return {
                    uid: d.id,
                    email: typeof email === "string" ? email : "",
                    displayName: typeof displayName === "string" ? displayName : "",
                  };
                }
                return {
                  uid: d.id,
                  email: "",
                  displayName: "",
                };
              });
              setPartnerAdmins(admins);
            })
            .catch(() => setPartnerAdmins([]));
        }
      })
      .catch((err) => {
        setRoleResolveError(err?.message || "Error al obtener permisos");
        setRoleResolved(true);
      });
  }, [userId, userRole, roleResolved]);

  useEffect(() => {
    // BLOQUEAR carga hasta tener userId y role resueltos (usar roleResolved, no userRole === null)
    if (!userId || !roleResolved) {
      return;
    }

    // Si role es desconocido, no autorizado - no ejecutar query
    if (!effectiveRole || (!isStaffRole(effectiveRole) && !isPartnerRole(effectiveRole))) {
      setRows([]);
      return;
    }

    const run = async () => {
      const constraints: QueryConstraint[] = [orderBy("createdAt", "desc")];

      // Si es partner_admin, SIEMPRE filtrar por managerUid (sin fallback a query global)
      if (isPartnerRole(effectiveRole) && userId) {
        constraints.push(where("managerUid", "==", userId));
      }
      // Si es staff, no agregar filtro (ve todos los clientes)

      const qClients = query(collection(db, "clients"), ...constraints);
      const snap = await getDocs(qClients);
      setRows(
        snap.docs
          .map((d) => {
            const rec = asRecord(d.data());
            if (!rec) {
              return null;
            }
            const code = asString(rec.code) ?? "";
            const name = asString(rec.name) ?? "";
            const country = asString(rec.country) ?? "";
            const activo = asBoolean(rec.activo) ?? true;
            const managerUid = asString(rec.managerUid) || null;
            const createdAt = asNumber(rec.createdAt);
            const email = asString(rec.email);
            return {
              id: d.id,
              code,
              name,
              country,
              activo,
              managerUid,
              createdAt,
              email,
            } as Client;
          })
          .filter((c): c is Client => c !== null)
      );
    };

    void run();
  }, [isStaff, userId, effectiveRole, roleResolved]);

  useEffect(() => {
    setPage(0);
  }, [q, countryFilter]);

  const filteredRows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((c) => {
      const okCountry =
        !countryFilter ||
        ((c.country || "").toLowerCase() === countryFilter.toLowerCase());
      if (!query) return okCountry;
      const name = (c.name || "").toLowerCase();
      const code = (c.code || "").toLowerCase();
      return okCountry && (name.includes(query) || code.includes(query));
    });
  }, [rows, q, countryFilter]);

  const paginatedRows = useMemo(() => {
    const total = filteredRows.length;
    const safePage = Math.min(
      page,
      Math.max(0, Math.ceil(total / pageSize) - 1)
    );
    const start = safePage * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const totalRows = filteredRows.length;
  const totalPages = totalRows === 0 ? 1 : Math.ceil(totalRows / pageSize);

  async function nextClientCode(): Promise<string> {
    const counterRef = doc(db, "counters", "clients");
    const n = await runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      const data = snap.data() as { seq?: unknown };
      const curr = snap.exists() && typeof data.seq === "number" ? data.seq : 1200;
      const next = curr + 1;
      tx.set(counterRef, { seq: next }, { merge: true });
      return next;
    });
    return String(n);
  }

  async function createClient(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !country || !email || !password) return;

    let code: string;
    // Staff: usa contador global (transacción)
    if (isStaff) {
      try {
        code = await nextClientCode();
      } catch (err) {
        alert(
          "No se pudo generar un número correlativo (counters/clients). Revisá reglas de Firestore / App Check."
        );
        return;
      }
    } else {
      // Partner: correlativo LOCAL dentro de sus clientes (no toca counters)
      const nums = rows
        .map((r) => parseInt(String(r.code ?? ""), 10))
        .filter((n) => Number.isFinite(n));
      let next = (nums.length ? Math.max(...nums) : 1200) + 1;
      // Asegurar que no choque con un número ya usado en su lista local
      const used = new Set(nums);
      while (used.has(next)) next += 1;
      code = String(next);
    }

    // Si es partner_admin, setear automáticamente managerUid
    let finalManagerUid: string | null = null;
    if (effectiveRole === "partner_admin" && userId) {
      finalManagerUid = userId;
    } else if (isStaff && managerUid) {
      finalManagerUid = managerUid || null;
    }

    const payload: Omit<Client, "id"> & {
      documento: { tipo: string; numero: string | null };
    } = {
      code,
      name,
      country,
      documento: { tipo: documentType, numero: documentNumber || null },
      email: email,
      emailAlt: emailAlt || undefined,
      phone: phone || undefined,
      address: address || undefined,
      state: stateName || undefined,
      city: city || undefined,
      postalCode: postalCode || undefined,
      contact: contact || undefined,
      activo: true,
      createdAt: Timestamp.now().toMillis(),
      ...(finalManagerUid ? { managerUid: finalManagerUid } : {}),
    };

    const sanitized: Record<string, unknown> = Object.fromEntries(
      Object.entries(payload).filter(([, v]) => v != null)
    );

    try {
      const ref = await addDoc(collection(db, "clients"), sanitized);
      setRows([{ id: ref.id, ...sanitized } as Client, ...rows]);
      resetForm();
      setOpenCreate(false);
    } catch (err) {
      alert(
        "Error de permisos al crear el cliente en la colección clients. Revisar reglas de Firestore."
      );
    }
  }

  async function toggleActivo(id: string, current: boolean) {
    try {
      setBusyId(id);
      await updateDoc(doc(db, "clients", id), { activo: !current });
      setRows((r) => r.map((c) => (c.id === id ? { ...c, activo: !current } : c)));
    } finally {
      setBusyId("");
    }
  }

  async function removeClient(id: string, code: string) {
    // Guard: solo superadmin puede eliminar
    if (!isSuperAdmin) {
      alert("No tenés permisos para eliminar clientes.");
      return;
    }
    const ok = confirm(`Seguro que quiere eliminar al cliente ${code}?`);
    if (!ok) return;
    try {
      setBusyId(id);
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/delete-client", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ clientId: id }),
      });
      if (!res.ok) {
        const js = await res.json();
        throw new Error(js?.error || `HTTP ${res.status}`);
      }
      setRows((r) => r.filter((c) => c.id !== id));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`Error al eliminar cliente: ${msg}`);
    } finally {
      setBusyId("");
    }
  }

  // Mostrar "Sin permisos" si roleResolved pero no hay effectiveRole
  if (roleResolved && !effectiveRole) {
    return (
      <div className="w-full max-w-md rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 space-y-4 text-center mx-auto">
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
    );
  }

  // Bloquear render hasta tener userId y role resueltos
  if (!userId || !roleResolved) {
    return (
      <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 space-y-4">
        <p className="text-sm text-white/60">Cargando permisos…</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Clientes</h1>
        <button
          type="button"
          onClick={() => setOpenCreate(true)}
          className="h-10 px-4 rounded-md bg-[#eb6619] text-white shadow hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619]"
        >
          + Crear nuevo cliente
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="relative">
          <label className="text-xs font-medium text-white/60">Buscar</label>
          <input
            className="mt-1 h-11 w-full rounded-md border border-[#1f3f36] !bg-[#0f2a22] pl-10 pr-9 !text-white caret-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#005f40]"
            placeholder="Nombre o Nº cliente"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="absolute left-3 top-[38px] text-white/40" aria-hidden>
            🔎
          </span>
          {q ? (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-3 top-[34px] text-white/50 hover:text-white"
              aria-label="Limpiar búsqueda"
            >
              ✕
            </button>
          ) : null}
        </div>
        <div>
          <label className="text-xs font-medium text-white/60">País</label>
          <BrandSelect
            value={countryFilter}
            onChange={(val) => setCountryFilter(val)}
            options={[
              { value: "", label: "Todos" },
              ...COUNTRIES.map((p) => ({ value: p, label: p })),
            ]}
            placeholder="Todos"
          />
        </div>
      </div>

      {/* Modal de creación */}
      {openCreate ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40">
          <div className="w-[95vw] max-w-3xl rounded-xl bg-[#071f19] border border-[#1f3f36] ring-1 ring-white/10 shadow-xl p-4 md:p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Crear cliente</h2>
              <button
                className={btnSecondaryCls}
                onClick={() => {
                  resetForm();
                  setOpenCreate(false);
                }}
              >
                Cerrar
              </button>
            </div>
            <form onSubmit={createClient} className="grid gap-3 md:grid-cols-4">
              <div className="grid gap-3 md:grid-cols-4 md:col-span-4">
                <div className="md:col-span-2">
                  <input
                    className={inputCls}
                    style={INPUT_BG_STYLE}
                    placeholder="Nombre completo"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <BrandSelect
                    value={country}
                    onChange={(val) => {
                      setCountry(val);
                      setStateName("");
                    }}
                    options={COUNTRIES.map((p) => ({ value: p, label: p }))}
                    placeholder="Seleccionar país…"
                  />
                </div>

                <div>
                  <BrandSelect
                    value={documentType}
                    onChange={(val) => setDocumentType(val)}
                    options={[
                      { value: "Cédula", label: "Cédula" },
                      { value: "Pasaporte", label: "Pasaporte" },
                      { value: "RUT", label: "RUT" },
                      { value: "DNI", label: "DNI" },
                      { value: "CUIT", label: "CUIT" },
                      { value: "CUIL", label: "CUIL" },
                      { value: "Otro", label: "Otro" },
                    ]}
                    placeholder="Tipo de documento"
                  />
                </div>
                <div>
                  <input
                    className={inputCls}
                    style={INPUT_BG_STYLE}
                    placeholder="Nº documento"
                    value={documentNumber}
                    onChange={(e) => setDocumentNumber(e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <input
                    className={inputCls}
                    style={INPUT_BG_STYLE}
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <input
                    className={inputCls}
                    style={INPUT_BG_STYLE}
                    type="password"
                    placeholder="Contraseña (provisional)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <input
                    className={inputCls}
                    style={INPUT_BG_STYLE}
                    type="tel"
                    inputMode="tel"
                    placeholder="Teléfono"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>

                <div className="md:col-span-3">
                  <input
                    className={inputCls}
                    style={INPUT_BG_STYLE}
                    placeholder="Dirección"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
                <div>
                  <input
                    className={inputCls}
                    style={INPUT_BG_STYLE}
                    placeholder="Contacto / Referente (ej: Danny, IFS)"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                  />
                </div>
                <div>
                  <input
                    className={inputCls}
                    style={INPUT_BG_STYLE}
                    type="email"
                    placeholder="Email adicional (opcional)"
                    value={emailAlt}
                    onChange={(e) => setEmailAlt(e.target.value)}
                  />
                </div>

                <div>
                  <select
                    className={inputCls}
                    style={INPUT_BG_STYLE}
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                    hidden={!country || !STATES_BY_COUNTRY[country]}
                  >
                    <option value="" disabled>
                      Seleccionar…
                    </option>
                    {(STATES_BY_COUNTRY[country] || []).map((s) => (
                      <option key={s} value={s} className="bg-[#0f2a22] text-white">
                        {s}
                      </option>
                    ))}
                  </select>
                  <input
                    className={inputCls}
                    style={INPUT_BG_STYLE}
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                    hidden={!!(country && STATES_BY_COUNTRY[country])}
                    placeholder="Estado / Depto / Provincia"
                  />
                </div>
                <div>
                  <input
                    className={inputCls}
                    style={INPUT_BG_STYLE}
                    placeholder="Ciudad"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </div>
                <div>
                  <input
                    className={inputCls}
                    style={INPUT_BG_STYLE}
                    placeholder="Código postal"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                  />
                </div>

                {isStaff && partnerAdmins.length > 0 ? (
                  <div className="md:col-span-4">
                    <label className="text-xs font-medium text-white/60 mb-1 block">
                      Admin asociado (opcional)
                    </label>
                    <BrandSelect
                      value={managerUid}
                      onChange={(val) => setManagerUid(val)}
                      options={[
                        { value: "", label: "Ninguno" },
                        ...partnerAdmins.map((pa) => ({
                          value: pa.uid,
                          label: pa.displayName ? `${pa.displayName} (${pa.email})` : pa.email,
                        })),
                      ]}
                      placeholder="Seleccionar admin asociado…"
                    />
                  </div>
                ) : null}

                {effectiveRole === "partner_admin" ? (
                  <div className="md:col-span-4 text-xs text-white/60">
                    Este cliente será asociado automáticamente a tu cuenta.
                  </div>
                ) : null}

                <div className="md:col-span-4 flex justify-end gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      setOpenCreate(false);
                    }}
                    className={btnSecondaryCls}
                  >
                    Cancelar
                  </button>
                  <button className="h-10 px-6 rounded-md text-white bg-[#eb6619] hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619]">
                    Crear
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <section className="grid gap-2">
        {paginatedRows.map((c) => (
          <div
            key={c.id}
            className="rounded-lg border border-white/10 bg-[#071f19] p-4 flex items-center justify-between gap-3"
          >
            <div>
              <div className="text-sm text-white">
                <b>{c.code}</b> {c.name}
              </div>
              <div className="text-xs text-white/60">
                País: {c.country} · Estado: {c.activo ? "Activo" : "Inactivo"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={detailHref(c.id!)}
                className="h-9 px-3 inline-flex items-center justify-center text-xs rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white/90 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[#005f40]"
                aria-label="Ver perfil"
              >
                Ver perfil
              </Link>
              <button
                onClick={() => toggleActivo(c.id!, c.activo !== false)}
                disabled={busyId === c.id}
                className={`h-9 px-3 text-xs rounded-md border bg-[#0f2a22] hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[#005f40] ${
                  c.activo !== false
                    ? "border-red-500/70 text-red-300"
                    : "border-emerald-500/70 text-emerald-300"
                }`}
                aria-label={c.activo !== false ? "Desactivar" : "Activar"}
                title={c.activo !== false ? "Desactivar" : "Activar"}
              >
                {c.activo !== false ? "Desactivar" : "Activar"}
              </button>
              {isSuperAdmin ? (
                <button
                  onClick={() => removeClient(c.id!, c.code)}
                  disabled={busyId === c.id}
                  className="h-9 px-3 text-xs rounded-md border border-red-500/70 bg-[#0f2a22] text-red-300 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-red-500"
                  aria-label="Eliminar"
                  title="Eliminar definitivamente"
                >
                  Eliminar
                </button>
              ) : null}
            </div>
          </div>
        ))}
        {rows.length === 0 ? (
          <div className="text-sm text-white/60">Sin clientes aún.</div>
        ) : filteredRows.length === 0 ? (
          <div className="text-sm text-white/60">Sin resultados para la búsqueda.</div>
        ) : null}
      </section>
      {totalRows > 0 && (
        <div className="mt-4 flex flex-col items-center justify-center gap-2 text-xs text-white/60">
          <div className="flex items-center gap-2">
            <span>Mostrar</span>
            <div className="w-[96px]">
              <BrandSelect
                value={String(pageSize)}
                onChange={(val) => {
                  setPageSize(Number(val));
                  setPage(0);
                }}
                options={[10, 20, 50].map((size) => ({ value: String(size), label: String(size) }))}
                placeholder={String(pageSize)}
              />
            </div>
            <span>por página</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(0)}
              disabled={page === 0}
              className="h-8 px-3 rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white/90 hover:bg-white/5 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[#005f40]"
            >
              «
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="h-8 px-3 rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white/90 hover:bg-white/5 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[#005f40]"
            >
              Anterior
            </button>
            <span>
              Página {totalRows === 0 ? 0 : page + 1} de {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || totalRows === 0}
              className="h-8 px-3 rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white/90 hover:bg-white/5 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[#005f40]"
            >
              Siguiente
            </button>
            <button
              type="button"
              onClick={() => setPage(totalPages - 1)}
              disabled={page >= totalPages - 1 || totalRows === 0}
              className="h-8 px-3 rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white/90 hover:bg-white/5 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[#005f40]"
            >
              »
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

