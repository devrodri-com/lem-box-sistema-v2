// src/app/admin/usuarios/page.tsx
"use client";
import RequireAuth from "@/components/RequireAuth";
import { notFound } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { collection, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

// --- Types ---
export type AdminPermissions = {
  viewClients: boolean;
  createClients: boolean;
  viewPersonal: boolean;
  editPersonal: boolean;
  toggleClients: boolean; // activar/desactivar
  deleteClients: boolean;
  ingestPackages: boolean;
  deleteTracking: boolean;
  deleteTrackingFromBoxes: boolean;
};

type AdminUser = {
  id: string; // uid or doc id
  email: string;
  name?: string;
  role: "admin" | "superadmin";
  createdAt?: any;
  permissions: AdminPermissions;
};

const DEFAULT_PERMS: AdminPermissions = {
  viewClients: true,
  createClients: false,
  viewPersonal: true,
  editPersonal: false,
  toggleClients: false,
  deleteClients: false,
  ingestPackages: true,
  deleteTracking: false,
  deleteTrackingFromBoxes: false,
};

export default function UsuariosPage() {
  const [meIsSuper, setMeIsSuper] = useState(false);
  const [items, setItems] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimsChecked, setClaimsChecked] = useState(false);

  // create modal state
  const [openCreate, setOpenCreate] = useState(false);
  const [cEmail, setCEmail] = useState("");
  const [cPassword, setCPassword] = useState("");
  const [cName, setCName] = useState("");
  const [cPerms, setCPerms] = useState<AdminPermissions>({ ...DEFAULT_PERMS });
  const canCreate = useMemo(() => meIsSuper && /@/.test(cEmail) && cPassword.length >= 8, [meIsSuper, cEmail, cPassword]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  // edit modal
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [ePerms, setEPerms] = useState<AdminPermissions>({ ...DEFAULT_PERMS });
  const [eName, setEName] = useState("");
  const canSaveEdit = useMemo(() => meIsSuper && !!editing, [meIsSuper, editing]);

  // permissions helpers
  const PermRow = ({ label, k, state, setState }: { label: string; k: keyof AdminPermissions; state: AdminPermissions; setState: (s: AdminPermissions) => void }) => (
    <label className="flex items-center gap-2 text-sm text-white/90">
      <input type="checkbox" checked={!!state[k]} onChange={(e) => setState({ ...state, [k]: e.target.checked })} />
      <span>{label}</span>
    </label>
  );

  useEffect(() => {
    auth.currentUser?.getIdTokenResult(true)
      .then(r => {
        const claims = r.claims as any;
        setMeIsSuper(Boolean(claims?.superadmin || claims?.role === "superadmin"));
      })
      .catch(() => setMeIsSuper(false))
      .finally(() => setClaimsChecked(true));
  }, []);

  useEffect(() => {
    if (!meIsSuper) return;
    const q = query(collection(db, "admins"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const arr: AdminUser[] = snap.docs.map((d) => {
        const x: any = d.data();
        return {
          id: d.id,
          email: x.email || "",
          name: x.name || "",
          role: x.role || "admin",
          createdAt: x.createdAt,
          permissions: { ...DEFAULT_PERMS, ...(x.permissions || {}) },
        } as AdminUser;
      });
      setItems(arr);
      setLoading(false);
    });
    return () => unsub();
  }, [meIsSuper]);

  async function handleCreate() {
    if (!canCreate) return;
    setBusy(true); setMsg("");
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/create-admin-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ email: cEmail.trim(), password: cPassword, name: cName.trim(), permissions: cPerms })
      });
      const js = await res.json();
      if (!res.ok) throw new Error(js?.error || `HTTP ${res.status}`);
      // mirror in firestore quickly if API did not already
      if (js?.uid) {
        await setDoc(doc(db, "admins", js.uid), { email: cEmail.trim(), name: cName.trim(), role: "admin", permissions: cPerms, createdAt: serverTimestamp() }, { merge: true });
      }
      setMsg("Usuario creado");
      setOpenCreate(false);
      setCEmail(""); setCPassword(""); setCName(""); setCPerms({ ...DEFAULT_PERMS });
    } catch (e: any) {
      setMsg(`Error: ${e.message || e}`);
    } finally { setBusy(false); }
  }

  function openEdit(u: AdminUser) {
    setEditing(u);
    setEName(u.name || "");
    setEPerms({ ...DEFAULT_PERMS, ...(u.permissions || {}) });
  }

  async function handleSaveEdit() {
    if (!canSaveEdit || !editing) return;
    setBusy(true); setMsg("");
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/update-admin-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ uid: editing.id, name: eName.trim(), permissions: ePerms })
      });
      const js = await res.json();
      if (!res.ok) throw new Error(js?.error || `HTTP ${res.status}`);
      await updateDoc(doc(db, "admins", editing.id), { name: eName.trim(), permissions: ePerms });
      setMsg("Permisos actualizados");
      setEditing(null);
    } catch (e: any) {
      setMsg(`Error: ${e.message || e}`);
    } finally { setBusy(false); }
  }

  if (!claimsChecked) return null;
  if (!meIsSuper) {
    notFound();
    return null;
  }

  return (
    <RequireAuth requireAdmin>
      <main className="min-h-[100dvh] bg-[#02120f] text-white flex flex-col items-center p-4 md:p-8 pt-24 md:pt-28">
        <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-4 md:p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-white">Usuarios</h1>
            {meIsSuper && (
              <button
                className="h-10 px-4 rounded-md bg-[#eb6619] text-white font-medium shadow hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619]"
                onClick={() => setOpenCreate(true)}
              >
                + Crear nuevo usuario
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-md border border-[#1f3f36] bg-[#071f19] ring-1 ring-white/10">
            <table className="w-full text-sm tabular-nums">
              <thead className="sticky top-0 z-10 bg-[#0f2a22] shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)]">
                <tr>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Rol</th>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Nombre</th>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Email</th>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Permisos</th>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="p-3 text-white/60" colSpan={5}>
                      Cargando…
                    </td>
                  </tr>
                ) : null}
                {!loading && !items.length ? (
                  <tr>
                    <td className="p-3 text-white/60" colSpan={5}>
                      Sin usuarios aún.
                    </td>
                  </tr>
                ) : null}
                {items.map((u) => (
                  <tr key={u.id} className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10">
                    <td className="p-2 text-white">{u.role}</td>
                    <td className="p-2 text-white">{u.name || " "}</td>
                    <td className="p-2 text-white">{u.email}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1 text-xs">
                        {Object.entries(u.permissions || {})
                          .filter(([, v]) => v)
                          .map(([k]) => (
                            <span key={k} className="px-2 py-0.5 rounded-md border border-white/10 bg-[#0f2a22] text-white/80">
                              {permLabel(k as keyof AdminPermissions)}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td className="p-2">
                      {meIsSuper ? (
                        <button
                          className="h-9 px-3 rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white/90 hover:bg-white/5 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40]"
                          onClick={() => openEdit(u)}
                        >
                          Ver/editar permisos
                        </button>
                      ) : (
                        <span className="text-white/40"> </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Create Modal */}
        {openCreate && (
          <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center">
            <div className="w-[95vw] max-w-2xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm shadow-xl p-4 md:p-6 text-white">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Crear usuario administrador</h3>
                <button className="h-9 px-3 rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white/90 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[#005f40]" onClick={() => setOpenCreate(false)}>
                  Cerrar
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <span className="text-xs text-white/60">Nombre</span>
                  <input className="h-11 w-full rounded-md border border-[#1f3f36] bg-[#0f2a22] px-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#005f40]" value={cName} onChange={(e) => setCName(e.target.value)} />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs text-white/60">Email</span>
                  <input className="h-11 w-full rounded-md border border-[#1f3f36] bg-[#0f2a22] px-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#005f40]" value={cEmail} onChange={(e) => setCEmail(e.target.value)} />
                </label>
                <label className="grid gap-1 md:col-span-2">
                  <span className="text-xs text-white/60">Contraseña (min 8)</span>
                  <input
                    type="password"
                    className="h-11 w-full rounded-md border border-[#1f3f36] bg-[#0f2a22] px-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#005f40]"
                    value={cPassword}
                    onChange={(e) => setCPassword(e.target.value)}
                  />
                </label>
              </div>

              <div className="mt-4 grid md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium mb-2">Permisos</h4>
                  <div className="grid gap-2">
                    <PermRow label="Ver clientes" k="viewClients" state={cPerms} setState={setCPerms} />
                    <PermRow label="Crear clientes" k="createClients" state={cPerms} setState={setCPerms} />
                    <PermRow label="Ver datos personales" k="viewPersonal" state={cPerms} setState={setCPerms} />
                    <PermRow label="Editar datos personales" k="editPersonal" state={cPerms} setState={setCPerms} />
                    <PermRow label="Activar/Desactivar clientes" k="toggleClients" state={cPerms} setState={setCPerms} />
                    <PermRow label="Eliminar clientes" k="deleteClients" state={cPerms} setState={setCPerms} />
                    <PermRow label="Ingresar paquetes" k="ingestPackages" state={cPerms} setState={setCPerms} />
                    <PermRow label="Eliminar tracking" k="deleteTracking" state={cPerms} setState={setCPerms} />
                    <PermRow
                      label="Eliminar tracking de cajas"
                      k="deleteTrackingFromBoxes"
                      state={cPerms}
                      setState={setCPerms}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  className="h-10 px-5 rounded-md bg-[#eb6619] text-white font-medium hover:brightness-110 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#eb6619]"
                  disabled={!canCreate || busy}
                  onClick={handleCreate}
                >
                  {busy ? "Creando…" : "Crear"}
                </button>
                <span className="text-xs text-white/60">{msg}</span>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editing && (
          <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center">
            <div className="w-[95vw] max-w-2xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm shadow-xl p-4 md:p-6 text-white">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Editar permisos</h3>
                <button className="h-9 px-3 rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white/90 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[#005f40]" onClick={() => setEditing(null)}>
                  Cerrar
                </button>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <span className="text-xs text-white/60">Nombre</span>
                  <input className="h-11 w-full rounded-md border border-[#1f3f36] bg-[#0f2a22] px-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#005f40]" value={eName} onChange={(e) => setEName(e.target.value)} />
                </label>
                <div />
              </div>
              <div className="mt-4 grid md:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <PermRow label="Ver clientes" k="viewClients" state={ePerms} setState={setEPerms} />
                  <PermRow label="Crear clientes" k="createClients" state={ePerms} setState={setEPerms} />
                  <PermRow label="Ver datos personales" k="viewPersonal" state={ePerms} setState={setEPerms} />
                  <PermRow label="Editar datos personales" k="editPersonal" state={ePerms} setState={setEPerms} />
                  <PermRow label="Activar/Desactivar clientes" k="toggleClients" state={ePerms} setState={setEPerms} />
                  <PermRow label="Eliminar clientes" k="deleteClients" state={ePerms} setState={setEPerms} />
                  <PermRow label="Ingresar paquetes" k="ingestPackages" state={ePerms} setState={setEPerms} />
                  <PermRow label="Eliminar tracking" k="deleteTracking" state={ePerms} setState={setEPerms} />
                  <PermRow
                    label="Eliminar tracking de cajas"
                    k="deleteTrackingFromBoxes"
                    state={ePerms}
                    setState={setEPerms}
                  />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button
                  className="h-10 px-5 rounded-md bg-[#eb6619] text-white font-medium hover:brightness-110 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#eb6619]"
                  disabled={!canSaveEdit || busy}
                  onClick={handleSaveEdit}
                >
                  {busy ? "Guardando…" : "Guardar permisos"}
                </button>
                <span className="text-xs text-white/60">{msg}</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </RequireAuth>
  );
}

function permLabel(k: keyof AdminPermissions): string {
  switch (k) {
    case "viewClients": return "Ver clientes";
    case "createClients": return "Crear clientes";
    case "viewPersonal": return "Ver datos personales";
    case "editPersonal": return "Editar datos personales";
    case "toggleClients": return "Activar/Desactivar clientes";
    case "deleteClients": return "Eliminar clientes";
    case "ingestPackages": return "Ingresar paquetes";
    case "deleteTracking": return "Eliminar tracking";
    case "deleteTrackingFromBoxes": return "Eliminar tracking de cajas";
    default: return String(k);
  }
}
