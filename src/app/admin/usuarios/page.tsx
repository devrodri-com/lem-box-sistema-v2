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
    <label className="flex items-center gap-2 text-sm text-neutral-800">
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
        <div className="w-full max-w-6xl bg-white text-neutral-900 rounded-xl shadow-md ring-1 ring-slate-200 p-4 md:p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Usuarios</h1>
            {meIsSuper && (
              <button className="px-3 py-2 rounded border" onClick={() => setOpenCreate(true)}>
                Crear nuevo usuario
              </button>
            )}
          </div>

          <div className="overflow-x-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="text-left p-2">Rol</th>
                  <th className="text-left p-2">Nombre</th>
                  <th className="text-left p-2">Email</th>
                  <th className="text-left p-2">Permisos</th>
                  <th className="text-left p-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="p-3" colSpan={5}>
                      Cargando…
                    </td>
                  </tr>
                ) : null}
                {!loading && !items.length ? (
                  <tr>
                    <td className="p-3 text-neutral-500" colSpan={5}>
                      Sin usuarios aún.
                    </td>
                  </tr>
                ) : null}
                {items.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="p-2">{u.role}</td>
                    <td className="p-2">{u.name || "—"}</td>
                    <td className="p-2">{u.email}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1 text-xs">
                        {Object.entries(u.permissions || {})
                          .filter(([, v]) => v)
                          .map(([k]) => (
                            <span key={k} className="px-2 py-0.5 rounded border">
                              {permLabel(k as keyof AdminPermissions)}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td className="p-2">
                      {meIsSuper ? (
                        <button className="px-2 py-1 rounded border" onClick={() => openEdit(u)}>
                          Ver/editar permisos
                        </button>
                      ) : (
                        <span className="text-neutral-400">—</span>
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
            <div className="bg-white w-[95vw] max-w-2xl rounded-lg shadow-xl p-4 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Crear usuario administrador</h3>
                <button className="px-3 py-2 rounded border" onClick={() => setOpenCreate(false)}>
                  Cerrar
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <span className="text-xs text-neutral-500">Nombre</span>
                  <input className="border rounded p-2" value={cName} onChange={(e) => setCName(e.target.value)} />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs text-neutral-500">Email</span>
                  <input className="border rounded p-2" value={cEmail} onChange={(e) => setCEmail(e.target.value)} />
                </label>
                <label className="grid gap-1 md:col-span-2">
                  <span className="text-xs text-neutral-500">Contraseña (min 8)</span>
                  <input
                    type="password"
                    className="border rounded p-2"
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
                  className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
                  disabled={!canCreate || busy}
                  onClick={handleCreate}
                >
                  {busy ? "Creando…" : "Crear"}
                </button>
                <span className="text-xs text-neutral-500">{msg}</span>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editing && (
          <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center">
            <div className="bg-white w-[95vw] max-w-2xl rounded-lg shadow-xl p-4 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Editar permisos</h3>
                <button className="px-3 py-2 rounded border" onClick={() => setEditing(null)}>
                  Cerrar
                </button>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <span className="text-xs text-neutral-500">Nombre</span>
                  <input className="border rounded p-2" value={eName} onChange={(e) => setEName(e.target.value)} />
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
                  className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
                  disabled={!canSaveEdit || busy}
                  onClick={handleSaveEdit}
                >
                  {busy ? "Guardando…" : "Guardar permisos"}
                </button>
                <span className="text-xs text-neutral-500">{msg}</span>
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
