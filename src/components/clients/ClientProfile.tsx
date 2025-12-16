// src/components/clients/ClientProfile.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
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
import { db, auth } from "@/lib/firebase";
import type { Client, Inbound, Box } from "@/types/lem";
import { BrandSelect, type BrandOption } from "@/components/ui/BrandSelect";
import { BoxDetailModal } from "@/components/boxes/BoxDetailModal";
import { useBoxDetailModal } from "@/components/boxes/useBoxDetailModal";
import Link from "next/link";

const COUNTRIES: string[] = ["Uruguay", "Argentina", "United States"];

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

const DOC_TYPES: string[] = ["Cédula", "DNI", "Pasaporte", "RUT", "Otro"];

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
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
}

export interface ClientProfilePermissions {
  canDelete: boolean;
  canResetPassword: boolean;
  canEditManagerUid: boolean;
}

export interface ClientProfileProps {
  clientId: string;
  mode: "admin" | "partner";
  permissions: ClientProfilePermissions;
  backHref?: string;
  backLabel?: string;
  partnerAdmins?: Array<{ uid: string; email: string; displayName?: string }>;
}

export function ClientProfile({
  clientId,
  mode,
  permissions,
  backHref,
  backLabel = "Volver",
  partnerAdmins = [],
}: ClientProfileProps) {
  const [client, setClient] = useState<Client | null>(null);
  const [form, setForm] = useState<Partial<Client> & { state?: string; city?: string }>({});
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"datos" | "trackings" | "cajas">("datos");
  const [inbounds, setInbounds] = useState<Inbound[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [pw1, setPw1] = useState<string>("");
  const [pw2, setPw2] = useState<string>("");
  const [pwSaving, setPwSaving] = useState<boolean>(false);
  const [pwMsg, setPwMsg] = useState<string>("");

  const boxByInbound = useMemo(() => {
    const map: Record<string, Box> = {};
    for (const b of boxes) {
      for (const iid of b.itemIds || []) map[iid] = b;
    }
    return map;
  }, [boxes]);

  const clientsById = useMemo(() => {
    const m: Record<string, { id?: string; code: string }> = {};
    if (client?.id) {
      m[client.id] = { id: client.id, code: client.code };
    }
    return m;
  }, [client]);

  // Box detail modal hook
  const { openBoxDetailByBoxId, modalProps } = useBoxDetailModal({
    boxes: boxes.filter((b) => b.id) as any[],
    setBoxes,
    setRows: () => {}, // Read-only for inbounds
    clientsById,
  });

  // Cargar cliente y movimientos
  useEffect(() => {
    if (!clientId) return;
    (async () => {
      const snap = await getDoc(doc(db, "clients", clientId));
      const rec = asRecord(snap.data());
      if (rec) {
        const c: Client = {
          id: snap.id,
          code: asString(rec.code) ?? "",
          name: asString(rec.name) ?? "",
          country: asString(rec.country) ?? "",
          email: asString(rec.email),
          phone: asString(rec.phone),
          address: asString(rec.address),
          state: asString(rec.state),
          city: asString(rec.city),
          contact: asString(rec.contact),
          docType: asString(rec.docType),
          docNumber: asString(rec.docNumber),
          postalCode: asString(rec.postalCode),
          emailAlt: asString(rec.emailAlt),
          activo: asBoolean(rec.activo) ?? true,
          createdAt: asNumber(rec.createdAt),
          managerUid: asString(rec.managerUid) || null,
        };
        setClient(c);
        setForm(c);
      }
      // Inbounds: try with index; fallback w/o orderBy and sort in-memory
      try {
        const qIn = query(
          collection(db, "inboundPackages"),
          where("clientId", "==", clientId),
          orderBy("receivedAt", "desc")
        );
        const inSn = await getDocs(qIn);
        setInbounds(
          inSn.docs.map((docSnap) => {
            const rec = asRecord(docSnap.data());
            if (!rec) {
              return null;
            }
            const tracking = asString(rec.tracking) ?? "";
            const carrier = asString(rec.carrier) as Inbound["carrier"] | undefined;
            const weightLb = asNumber(rec.weightLb) ?? 0;
            const weightKg = asNumber(rec.weightKg);
            const photoUrl = asString(rec.photoUrl);
            const invoiceUrl = asString(rec.invoiceUrl);
            const status = asString(rec.status) as Inbound["status"] | undefined;
            const receivedAt = asNumber(rec.receivedAt);
            const managerUid = asString(rec.managerUid) || null;
            return {
              id: docSnap.id,
              tracking,
              carrier: carrier || "Other",
              clientId,
              weightLb,
              weightKg,
              photoUrl,
              invoiceUrl,
              status,
              receivedAt,
              managerUid,
            } as Inbound;
          }).filter((i): i is Inbound => i !== null)
        );
      } catch {
        const qIn2 = query(collection(db, "inboundPackages"), where("clientId", "==", clientId));
        const inSn2 = await getDocs(qIn2);
        const list = inSn2.docs
          .map((s) => {
            const rec = asRecord(s.data());
            if (!rec) {
              return null;
            }
            const tracking = asString(rec.tracking) ?? "";
            const carrier = asString(rec.carrier) as Inbound["carrier"] | undefined;
            const weightLb = asNumber(rec.weightLb) ?? 0;
            const weightKg = asNumber(rec.weightKg);
            const photoUrl = asString(rec.photoUrl);
            const invoiceUrl = asString(rec.invoiceUrl);
            const status = asString(rec.status) as Inbound["status"] | undefined;
            const receivedAt = asNumber(rec.receivedAt);
            const managerUid = asString(rec.managerUid) || null;
            return {
              id: s.id,
              tracking,
              carrier: carrier || "Other",
              clientId,
              weightLb,
              weightKg,
              photoUrl,
              invoiceUrl,
              status,
              receivedAt,
              managerUid,
            } as Inbound;
          })
          .filter((i): i is Inbound => i !== null);
        list.sort((a, b) => Number(b.receivedAt || 0) - Number(a.receivedAt || 0));
        setInbounds(list);
      }

      // Boxes: try with index; fallback w/o orderBy and sort in-memory
      try {
        const qBox = query(
          collection(db, "boxes"),
          where("clientId", "==", clientId),
          orderBy("createdAt", "desc")
        );
        const bxSn = await getDocs(qBox);
        setBoxes(
          bxSn.docs
            .map((docSnap) => {
              const rec = asRecord(docSnap.data());
              if (!rec) {
                return null;
              }
              const code = asString(rec.code) ?? "";
              const clientId = asString(rec.clientId) ?? "";
              const status = asString(rec.status) as Box["status"] | undefined;
              const itemIds = asStringArray(rec.itemIds);
              const createdAt = asNumber(rec.createdAt);
              const weightLb = asNumber(rec.weightLb);
              const managerUid = asString(rec.managerUid) || null;
              const closedAt = asNumber(rec.closedAt);
              const shippedAt = asNumber(rec.shippedAt);
              const deliveredAt = asNumber(rec.deliveredAt);
              // Campos adicionales que pueden existir en Firestore pero no en el tipo Box base
              const type = asString(rec.type) as "COMERCIAL" | "FRANQUICIA" | undefined;
              const country = asString(rec.country);
              const shipmentId = asString(rec.shipmentId);
              return {
                id: docSnap.id,
                code,
                clientId,
                status: status || "open",
                itemIds,
                createdAt,
                weightLb,
                managerUid,
                closedAt,
                shippedAt,
                deliveredAt,
                ...(type ? { type } : {}),
                ...(country ? { country } : {}),
                ...(shipmentId ? { shipmentId } : {}),
              } as Box;
            })
            .filter((b): b is Box => b !== null)
        );
      } catch {
        const qBox2 = query(collection(db, "boxes"), where("clientId", "==", clientId));
        const bxSn2 = await getDocs(qBox2);
        const listB = bxSn2.docs
          .map((s) => {
            const rec = asRecord(s.data());
            if (!rec) {
              return null;
            }
            const code = asString(rec.code) ?? "";
            const clientId = asString(rec.clientId) ?? "";
            const status = asString(rec.status) as Box["status"] | undefined;
            const itemIds = asStringArray(rec.itemIds);
            const createdAt = asNumber(rec.createdAt);
            const weightLb = asNumber(rec.weightLb);
            const managerUid = asString(rec.managerUid) || null;
            const closedAt = asNumber(rec.closedAt);
            const shippedAt = asNumber(rec.shippedAt);
            const deliveredAt = asNumber(rec.deliveredAt);
            // Campos adicionales que pueden existir en Firestore pero no en el tipo Box base
            const type = asString(rec.type) as "COMERCIAL" | "FRANQUICIA" | undefined;
            const country = asString(rec.country);
            const shipmentId = asString(rec.shipmentId);
            return {
              id: s.id,
              code,
              clientId,
              status: status || "open",
              itemIds,
              createdAt,
              weightLb,
              managerUid,
              closedAt,
              shippedAt,
              deliveredAt,
              ...(type ? { type } : {}),
              ...(country ? { country } : {}),
              ...(shipmentId ? { shipmentId } : {}),
            } as Box;
          })
          .filter((b): b is Box => b !== null);
        listB.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
        setBoxes(listB);
      }
    })();
  }, [clientId]);

  const canSave = useMemo(() => !!form?.name && !!form?.code && !!form?.country, [form]);

  const canSetPassword = useMemo(
    () => permissions.canResetPassword && pw1.length >= 8 && pw1 === pw2,
    [permissions.canResetPassword, pw1, pw2]
  );

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

      // Solo si tiene permiso, modificar managerUid
      if (permissions.canEditManagerUid && (form as any).managerUid !== undefined) {
        (payload as any).managerUid = (form as any).managerUid || null;
      }

      const sanitized = Object.fromEntries(
        Object.entries(payload).filter(([, v]) => v !== undefined)
      ) as Partial<Client>;
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
        body: JSON.stringify({ clientId: client.id, newPassword: pw1 }),
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

  // Unified styles
  const inputCls =
    "h-11 w-full rounded-md border border-[#1f3f36] !bg-[#0f2a22] px-3 !text-white caret-white placeholder:text-white/40 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#005f40]";
  const labelCls = "text-xs font-medium text-white/60";
  const cardCls = "rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-4 md:p-6";
  const btnPrimaryCls =
    "inline-flex items-center justify-center h-11 px-5 rounded-md bg-[#eb6619] text-white font-medium shadow-md hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
  const btnSecondaryCls =
    "inline-flex items-center justify-center h-11 px-5 rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white/90 font-medium shadow-sm hover:bg-white/5 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
  const tabBtn = (active: boolean) =>
    `px-3 h-9 text-sm font-semibold rounded-full transition ${
      active ? "bg-[#005f40] text-white shadow" : "text-white/80 hover:bg-white/10"
    }`;

  if (!client) {
    return (
      <main className="min-h-[100dvh] bg-[#02120f] text-white p-4 md:p-8 pt-24 md:pt-28">
        <p className="text-sm text-white/60">Cargando cliente…</p>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#02120f] text-white p-4 md:p-8 pt-24 md:pt-28 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {backHref ? (
            <Link href={backHref} className="text-sm text-white/70 hover:text-white" aria-label={backLabel}>
              ← {backLabel}
            </Link>
          ) : null}
          <h1 className="text-2xl font-semibold text-white">
            Cliente: {client.code} {client.name}
          </h1>
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
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            className="grid gap-4 md:grid-cols-20"
          >
            {/* Fila 1: Código 20% · Nombre 40% · Contacto/Referencia 40% */}
            <label className="grid gap-1 md:col-span-4">
              <span className={labelCls}>Código</span>
              <input
                className={`${inputCls} !bg-[#071f19] !text-white/70`}
                value={form.code || ""}
                readOnly
                aria-readonly="true"
              />
            </label>
            <label className="grid gap-1 md:col-span-8">
              <span className={labelCls}>Nombre</span>
              <input
                className={inputCls}
                value={form.name || ""}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="grid gap-1 md:col-span-8">
              <span className={labelCls}>Contacto / Referente</span>
              <input
                className={inputCls}
                value={(form as any).contact || ""}
                onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
              />
            </label>

            {/* Fila 2: Tipo doc 20% · Nº doc 40% */}
            <label className="grid gap-1 md:col-span-4">
              <span className={labelCls}>Tipo de documento</span>
              <div className="[&>div>button]:h-11 [&>div>button]:mt-0">
                <BrandSelect
                  value={(form as any).docType || ""}
                  onChange={(val) => setForm((f) => ({ ...f, docType: val }))}
                  options={[
                    { value: "", label: "Seleccionar…" },
                    ...DOC_TYPES.map((t) => ({ value: t, label: t })),
                  ]}
                  placeholder="Seleccionar…"
                />
              </div>
            </label>
            <label className="grid gap-1 md:col-span-8">
              <span className={labelCls}>Número de documento</span>
              <input
                className={inputCls}
                value={(form as any).docNumber || ""}
                onChange={(e) => setForm((f) => ({ ...f, docNumber: e.target.value }))}
              />
            </label>
            <div className="md:col-span-8" />

            {/* Fila 3: País 30% · Estado 30% · Ciudad 40% */}
            <label className="grid gap-1 md:col-span-6">
              <span className={labelCls}>País</span>
              <div className="[&>div>button]:h-11 [&>div>button]:mt-0">
                <BrandSelect
                  value={form.country || ""}
                  onChange={(val) => setForm((f) => ({ ...f, country: val, state: "" }))}
                  options={COUNTRIES.map((p) => ({ value: p, label: p }))}
                  placeholder="Seleccionar país…"
                />
              </div>
            </label>
            <label className="grid gap-1 md:col-span-6">
              <span className={labelCls}>Estado / Depto / Provincia</span>
              <div className="[&>div>button]:h-11 [&>div>button]:mt-0">
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
              </div>
            </label>
            <label className="grid gap-1 md:col-span-8">
              <span className={labelCls}>Ciudad</span>
              <input
                className={inputCls}
                value={form.city || ""}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </label>

            {/* Fila 4: Dirección 80% · Código postal 20% */}
            <label className="grid gap-1 md:col-span-16">
              <span className={labelCls}>Dirección</span>
              <input
                className={inputCls}
                value={form.address || ""}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </label>
            <label className="grid gap-1 md:col-span-4">
              <span className={labelCls}>Código postal</span>
              <input
                className={inputCls}
                value={(form as any).postalCode || ""}
                onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
              />
            </label>

            {/* Fila 5: Teléfono 30% · Email 35% · Email adicional 35% */}
            <label className="grid gap-1 md:col-span-6">
              <span className={labelCls}>Teléfono</span>
              <input
                className={inputCls}
                value={form.phone || ""}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </label>
            <label className="grid gap-1 md:col-span-7">
              <span className={labelCls}>Email</span>
              <input
                className={inputCls}
                value={form.email || ""}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </label>
            <label className="grid gap-1 md:col-span-7">
              <span className={labelCls}>Email adicional</span>
              <input
                className={inputCls}
                value={(form as any).emailAlt || ""}
                onChange={(e) => setForm((f) => ({ ...f, emailAlt: e.target.value }))}
              />
            </label>

            {permissions.canEditManagerUid && partnerAdmins.length > 0 ? (
              <label className="grid gap-1 md:col-span-20">
                <span className={labelCls}>Admin asociado</span>
                <div className="[&>div>button]:h-11 [&>div>button]:mt-0">
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
                </div>
              </label>
            ) : mode === "partner" ? (
              <div className="md:col-span-20 text-xs text-white/60">
                No puedes cambiar el admin asociado de este cliente.
              </div>
            ) : null}

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.activo !== false}
                onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
              />
              <span className="text-sm">Activo</span>
            </label>

            <div className="md:col-span-20 flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => client && setForm(client)}
                className={btnSecondaryCls}
              >
                Cancelar
              </button>
              <button type="submit" disabled={!canSave || saving} className={btnPrimaryCls}>
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </form>

          {permissions.canResetPassword ? (
            <div className="mt-6 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-4 md:p-6 grid gap-3 md:max-w-xl">
              <h3 className="font-medium">Administración · Resetear contraseña</h3>
              <p className="text-xs text-white/60">
                Solo super admin. Mínimo 8 caracteres. Esto cambia la contraseña del usuario del
                cliente.
              </p>
              <label className="grid gap-1">
                <span className={labelCls}>Nueva contraseña</span>
                <input
                  type="password"
                  className={inputCls}
                  value={pw1}
                  onChange={(e) => setPw1(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className={labelCls}>Repetir contraseña</span>
                <input
                  type="password"
                  className={inputCls}
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                />
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={setNewPassword}
                  disabled={!canSetPassword || pwSaving}
                  className={btnPrimaryCls}
                >
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
                    <th className="text-left p-2 text-white/80 text-xs font-medium">
                      Fecha de llegada
                    </th>
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
                    <tr
                      key={r.id}
                      className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10"
                    >
                      <td className="p-2 text-white">
                        {r.receivedAt ? new Date(r.receivedAt).toLocaleDateString() : "-"}
                      </td>
                      <td className="p-2 font-mono text-white">{r.tracking}</td>
                      <td className="p-2 text-white">
                        {Number(r.weightLb || 0).toFixed(2)} lb / {Number(r.weightKg || 0).toFixed(2)} kg
                      </td>
                      <td className="p-2 text-white">
                        {r.status === "boxed"
                          ? "consolidado"
                          : r.status === "received"
                            ? "recibido"
                            : r.status}
                      </td>
                      <td className="p-2 text-white">
                        {r.id ? boxByInbound[r.id as string]?.code || "-" : "-"}
                      </td>
                      <td className="p-2 text-white">{r.invoiceUrl ? "✔︎" : "-"}</td>
                      <td className="p-2 text-white">
                        {r.photoUrl ? (
                          <a
                            href={r.photoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline text-white/90 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#005f40] rounded-sm"
                          >
                            📷
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                  {!inbounds.length ? (
                    <tr>
                      <td className="p-3 text-white/60" colSpan={7}>
                        Sin trackings aún.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : tab === "cajas" ? (
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
                    <tr
                      key={b.id}
                      className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10"
                    >
                      <td className="p-2 text-white">
                        {b.id ? (
                          <button
                            className="underline text-white/90 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#005f40] rounded-sm"
                            title="Ver caja"
                            onClick={() => openBoxDetailByBoxId(b.id!)}
                          >
                            {b.code}
                          </button>
                        ) : (
                          b.code
                        )}
                      </td>
                      <td className="p-2 text-white">{b.status}</td>
                      <td className="p-2 text-white">{b.itemIds?.length || 0}</td>
                      <td className="p-2 text-white">
                        {b.createdAt ? new Date(b.createdAt).toLocaleDateString() : "-"}
                      </td>
                    </tr>
                  ))}
                  {!boxes.length ? (
                    <tr>
                      <td className="p-3 text-white/60" colSpan={4}>
                        Sin cajas aún.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      <BoxDetailModal {...modalProps} />
    </main>
  );
}

