// src/app/mi/page.tsx
"use client";

import { fmtWeightPairFromLb } from "@/lib/weight";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  limit,
  orderBy,
  doc,
  getDoc,
  updateDoc,
  addDoc,
  setDoc,
} from "firebase/firestore";
import StatusBadge from "@/components/ui/StatusBadge";

const btnPrimary =
  "inline-flex items-center justify-center h-10 px-4 rounded-md bg-[#eb6619] text-white font-medium shadow-md hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
const btnSecondary =
  "inline-flex items-center justify-center h-10 px-4 rounded-md border border-slate-300 bg-white text-slate-800 font-medium shadow-sm hover:bg-slate-50 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed";
const inputCls =
  "h-11 w-full rounded-md border border-slate-300 px-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#005f40]";

const STATES_BY_COUNTRY: Record<string, string[]> = {
  Uruguay: [
    "Artigas","Canelones","Cerro Largo","Colonia","Durazno","Flores","Florida","Lavalleja","Maldonado","Montevideo","Paysandú","Río Negro","Rivera","Rocha","Salto","San José","Soriano","Tacuarembó","Treinta y Tres"
  ],
  "United States": [
    "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"
  ],
  Argentina: [
    "Buenos Aires","CABA","Catamarca","Chaco","Chubut","Córdoba","Corrientes","Entre Ríos","Formosa","Jujuy","La Pampa","La Rioja","Mendoza","Misiones","Neuquén","Río Negro","Salta","San Juan","San Luis","Santa Cruz","Santa Fe","Santiago del Estero","Tierra del Fuego","Tucumán"
  ],
};

const DOC_TYPES_BY_COUNTRY: Record<string, string[]> = {
  Uruguay: ["Cédula", "Pasaporte", "RUT", "Otro"],
  Argentina: ["DNI", "CUIT", "CUIL", "Pasaporte", "Otro"],
  "United States": ["Pasaporte", "Otro"],
};
function getDocTypes(country: string) {
  return DOC_TYPES_BY_COUNTRY[country] || ["Pasaporte", "Otro"];
}
const tabBtn = (active: boolean) =>
  `px-3 h-9 text-sm rounded-full ${active ? "bg-[#005f40] text-white shadow" : "text-slate-700 hover:bg-white"}`;

export default function MiPerfilPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"historial" | "cajas" | "envios" | "cuenta">(
    "historial"
  );
  const [uid, setUid] = useState<string>("");
  const [clientId, setClientId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Cuenta / edición
  const [form, setForm] = useState({
    code: "",
    name: "",
    phone: "",
    country: "",
    state: "",
    city: "",
    address: "",
    email: "",
    emailAlt: "",
    postalCode: "",
    docType: "",
    docNumber: "",
  });
  const [savingAccount, setSavingAccount] = useState(false);

  // Historial
  const [rows, setRows] = useState<any[]>([]);
  const [qTrack, setQTrack] = useState("");

  // Cajas
  const [boxes, setBoxes] = useState<any[]>([]);
  const [detailBox, setDetailBox] = useState<any | null>(null);
  const [detailItems, setDetailItems] = useState<any[]>([]);

  // Envíos (derivados desde cajas -> shipmentId)
  const [shipments, setShipments] = useState<any[]>([]);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) {
        router.replace("/acceder");
        return;
      }
      setUid(u.uid);
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

      const cid = String(userDocData.clientId ?? "");
      if (!cid) {
        setErr("No hay un cliente asignado a esta cuenta.");
        setLoading(false);
        return;
      }
      setClientId(cid);

      // cargar perfil de client para Cuenta
      const cSnap = await getDoc(doc(db, "clients", cid));
      const c = cSnap.exists() ? (cSnap.data() as any) : null;
      if (c) {
        setForm((f) => ({
          ...f,
          code: c.code || "",
          name: c.name || "",
          phone: c.phone || "",
          country: c.country || "",
          state: c.state || "",
          city: c.city || "",
          address: c.address || "",
          email: c.email || "",
          emailAlt: c.emailAlt || "",
          postalCode: c.postalCode || "",
          docType: c.docType || "",
          docNumber: c.docNumber || "",
        }));
      }

      // cargar datos iniciales
      try {
        await Promise.all([
          loadTrackings(cid),
          loadBoxesAndShipments(cid),
        ]);
      } catch (e) {
        // Ignorar errores parciales (p. ej., permisos en shipments antiguos)
        console.warn("/mi data load warning", e);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  async function loadTrackings(cid: string) {
    try {
      const q1 = query(
        collection(db, "inboundPackages"),
        where("clientId", "==", cid),
        orderBy("receivedAt", "desc")
      );
      const s = await getDocs(q1);
      setRows(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    } catch (e) {
      // Si no hay permisos/índices, mostrar vacío pero no bloquear la UI
      setRows([]);
    }
  }

  async function loadBoxesAndShipments(cid: string) {
    const qb = query(collection(db, "boxes"), where("clientId", "==", cid));
    const sb = await getDocs(qb);
    const bs = sb.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    setBoxes(bs);
    const shipmentIds = Array.from(
      new Set(
        bs.map((b) => b.shipmentId).filter((x: string | null | undefined) => !!x)
      )
    ) as string[];
    const ss: any[] = [];
    for (const sid of shipmentIds) {
      try {
        const snap = await getDoc(doc(db, "shipments", sid));
        if (snap.exists()) ss.push({ id: sid, ...(snap.data() as any) });
      } catch (e) {
        // Permisos insuficientes en embarques antiguos sin clientIds: omitir
        continue;
      }
    }
    setShipments(ss);
  }

  const filteredRows = useMemo(() => {
    const q = qTrack.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => String(r.tracking || "").toLowerCase().includes(q));
  }, [rows, qTrack]);

  async function openBoxDetail(b: any) {
    setDetailBox(b);
    const items: any[] = [];
    // cargar items por id (itemIds) si existen
    if (Array.isArray(b.itemIds) && b.itemIds.length) {
      const it = await Promise.all(
        b.itemIds.map(async (iid: string) => {
          const snap = await getDoc(doc(db, "inboundPackages", iid));
          return snap.exists() ? { id: iid, ...(snap.data() as any) } : null;
        })
      );
      for (const i of it) if (i) items.push(i);
    }
    setDetailItems(items);
  }

  async function saveAccount() {
    if (!clientId) return;
    setSavingAccount(true);
    try {
      await updateDoc(doc(db, "clients", clientId), {
        name: form.name || "",
        phone: form.phone || "",
        country: form.country || "",
        state: form.state || "",
        city: form.city || "",
        address: form.address || "",
        emailAlt: form.emailAlt || "",
        postalCode: form.postalCode || "",
        docType: form.docType || "",
        docNumber: form.docNumber || "",
      });
    } finally {
      setSavingAccount(false);
    }
  }

  async function reloadClientForm() {
    if (!clientId) return;
    const snap = await getDoc(doc(db, "clients", clientId));
    const c2 = snap.exists() ? (snap.data() as any) : null;
    if (c2) {
      setForm((f) => ({
        ...f,
        code: c2.code || "",
        name: c2.name || "",
        phone: c2.phone || "",
        country: c2.country || "",
        state: c2.state || "",
        city: c2.city || "",
        address: c2.address || "",
        email: c2.email || "",
        emailAlt: c2.emailAlt || "",
        postalCode: c2.postalCode || "",
        docType: c2.docType || "",
        docNumber: c2.docNumber || "",
      }));
    }
  }

  // Alertar tracking (simple)
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertTracking, setAlertTracking] = useState("");
  const [alertNote, setAlertNote] = useState("");
  const [alertSaving, setAlertSaving] = useState(false);
  async function submitAlert() {
    if (!clientId || !uid || !alertTracking.trim()) return;
    setAlertSaving(true);
    try {
      await addDoc(collection(db, "trackingAlerts"), {
        uid,
        clientId,
        tracking: alertTracking.trim().toUpperCase(),
        note: alertNote.trim() || "",
        createdAt: Date.now(),
      });
      setAlertTracking("");
      setAlertNote("");
      setAlertOpen(false);
    } finally {
      setAlertSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-[100dvh] grid place-items-center p-6">
        <div className="text-sm text-neutral-600">Cargando…</div>
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
    <main className="min-h-[100dvh] p-4 md:p-8 space-y-6 bg-neutral-50">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Mi cuenta</h1>
        <div className="inline-flex items-center gap-1 rounded-full bg-neutral-100 p-1 ring-1 ring-slate-200">
          <button className={tabBtn(tab === "historial")} onClick={() => setTab("historial")}>Historial</button>
          <button className={tabBtn(tab === "cajas")} onClick={() => setTab("cajas")}>Cajas</button>
          <button className={tabBtn(tab === "envios")} onClick={() => setTab("envios")}>Envíos</button>
          <button className={tabBtn(tab === "cuenta")} onClick={() => setTab("cuenta")}>Cuenta</button>
        </div>
      </header>

      {tab === "historial" && (
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div className="max-w-md w-full">
              <label className="text-xs text-neutral-600">Buscar tracking</label>
              <input className={inputCls} placeholder="Escribí el tracking" value={qTrack} onChange={(e)=> setQTrack(e.target.value)} />
            </div>
            <button className={btnSecondary} onClick={()=> setAlertOpen(true)}>Alertar tracking</button>
          </div>

          <div className="overflow-x-auto border rounded">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-neutral-50 shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)]">
                <tr>
                  <th className="text-left p-2">Fecha</th>
                  <th className="text-left p-2">Tracking</th>
                  <th className="text-left p-2">Carrier</th>
                  <th className="text-right p-2">Peso</th>
                  <th className="text-left p-2">Estado</th>
                  <th className="text-left p-2">Foto</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.id} className="border-t odd:bg-white even:bg-neutral-50 hover:bg-slate-50 h-11">
                    <td className="p-2">{r.receivedAt ? new Date(r.receivedAt).toLocaleDateString() : "—"}</td>
                    <td className="p-2 font-mono">{r.tracking}</td>
                    <td className="p-2">{r.carrier}</td>
                    <td className="p-2 text-right tabular-nums">{fmtWeightPairFromLb(Number(r.weightLb || 0))}</td>
                    <td className="p-2">
                      {r.status === "boxed" ? (
                        <StatusBadge scope="package" status="boxed" />
                      ) : (
                        <StatusBadge scope="package" status="received" />
                      )}
                    </td>
                    <td className="p-2">
                      {r.photoUrl ? (
                        <a href={r.photoUrl} target="_blank" className="underline text-sky-700">Ver</a>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
                {!filteredRows.length ? (
                  <tr><td colSpan={6} className="p-3 text-neutral-500">Sin registros.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "cajas" && (
        <section className="space-y-3">
          <div className="overflow-x-auto border rounded">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-neutral-50 shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)]">
                <tr>
                  <th className="text-left p-2">Caja</th>
                  <th className="text-left p-2">País</th>
                  <th className="text-left p-2">Tipo</th>
                  <th className="text-right p-2">Items</th>
                  <th className="text-right p-2">Peso</th>
                  <th className="text-left p-2">Estado</th>
                  <th className="text-left p-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {boxes.map((b) => (
                  <tr key={b.id} className="border-t odd:bg-white even:bg-neutral-50 hover:bg-slate-50 h-11">
                    <td className="p-2 font-mono">{b.code}</td>
                    <td className="p-2">{b.country}</td>
                    <td className="p-2">{b.type}</td>
                    <td className="p-2 text-right tabular-nums">{b.itemIds?.length || 0}</td>
                    <td className="p-2 text-right tabular-nums">{fmtWeightPairFromLb(Number(b.weightLb || 0))}</td>
                    <td className="p-2">{b.status ? <StatusBadge scope="box" status={b.status} /> : "—"}</td>
                    <td className="p-2"><button className={btnSecondary} onClick={()=> openBoxDetail(b)}>Ver detalle</button></td>
                  </tr>
                ))}
                {!boxes.length ? (
                  <tr><td colSpan={7} className="p-3 text-neutral-500">Sin cajas.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {detailBox ? (
            <div className="fixed inset-0 z-40 bg-black/40 grid place-items-center p-4">
              <div className="bg-white w-full max-w-xl rounded-xl shadow-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold">Caja {detailBox.code}</h3>
                  <button className={btnSecondary} onClick={()=> setDetailBox(null)}>Cerrar</button>
                </div>
                <div className="overflow-x-auto border rounded">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th className="text-left p-2">Tracking</th>
                        <th className="text-left p-2">Carrier</th>
                        <th className="text-right p-2">Peso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailItems.map((i)=> (
                        <tr key={i.id} className="border-t">
                          <td className="p-2 font-mono">{i.tracking}</td>
                          <td className="p-2">{i.carrier}</td>
                          <td className="p-2 text-right tabular-nums">{fmtWeightPairFromLb(Number(i.weightLb || 0))}</td>
                        </tr>
                      ))}
                      {!detailItems.length ? (
                        <tr><td colSpan={3} className="p-3 text-neutral-500">Caja sin items.</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      )}

      {tab === "envios" && (
        <section className="space-y-3">
          <div className="overflow-x-auto border rounded">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-neutral-50 shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)]">
                <tr>
                  <th className="text-left p-2">Embarque</th>
                  <th className="text-left p-2">País/Tipo</th>
                  <th className="text-left p-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((s)=> (
                  <tr key={s.id} className="border-t odd:bg-white even:bg-neutral-50 hover:bg-slate-50 h-11">
                    <td className="p-2 font-mono">{s.code}</td>
                    <td className="p-2">{s.country} / {s.type}</td>
                    <td className="p-2">
                      {s.status === "open" ? (
                        <StatusBadge scope="shipment" status="open" />
                      ) : s.status === "shipped" ? (
                        <StatusBadge scope="shipment" status="shipped" />
                      ) : s.status === "arrived" ? (
                        <StatusBadge scope="shipment" status="arrived" />
                      ) : (
                        <StatusBadge scope="shipment" status="closed" />
                      )}
                    </td>
                  </tr>
                ))}
                {!shipments.length ? (
                  <tr><td colSpan={3} className="p-3 text-neutral-500">Sin envíos.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "cuenta" && (
        <section className="space-y-3">
          <div className="rounded-lg border ring-1 ring-slate-200 bg-white shadow-sm p-4 grid gap-3">
            {/* Código + Nombre */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="grid gap-1 md:col-span-1">
                <span className="text-xs font-medium text-neutral-600">Código</span>
                <input className={inputCls} value={form.code} disabled readOnly />
              </label>
              <label className="grid gap-1 md:col-span-2">
                <span className="text-xs font-medium text-neutral-600">Nombre</span>
                <input className={inputCls} value={form.name} onChange={(e)=> setForm(f=> ({ ...f, name: e.target.value }))} />
              </label>
            </div>

            {/* Tipo/Número de documento */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="grid gap-1 md:col-span-1">
                <span className="text-xs font-medium text-neutral-600">Tipo de documento</span>
                <select className={inputCls} value={form.docType} onChange={(e)=> setForm(f=> ({ ...f, docType: e.target.value }))}>
                  <option value="">Seleccionar…</option>
                  {getDocTypes(form.country).map((t)=> (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 md:col-span-2">
                <span className="text-xs font-medium text-neutral-600">Número de documento</span>
                <input className={inputCls} value={form.docNumber} onChange={(e)=> setForm(f=> ({ ...f, docNumber: e.target.value }))} />
              </label>
            </div>

            {/* País / Estado / Ciudad */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="grid gap-1">
                <span className="text-xs font-medium text-neutral-600">País</span>
                <select
                  className={inputCls}
                  value={form.country}
                  onChange={(e)=> setForm(f=> ({ ...f, country: e.target.value, state: "" }))}
                >
                  <option>Uruguay</option>
                  <option>Argentina</option>
                  <option>United States</option>
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-neutral-600">Estado / Depto / Provincia</span>
                <select
                  className={inputCls}
                  value={form.state}
                  onChange={(e)=> setForm(f=> ({ ...f, state: e.target.value }))}
                  disabled={!STATES_BY_COUNTRY[form.country]}
                >
                  <option value="">Seleccionar…</option>
                  {(STATES_BY_COUNTRY[form.country] || []).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-neutral-600">Ciudad</span>
                <input className={inputCls} value={form.city} onChange={(e)=> setForm(f=> ({ ...f, city: e.target.value }))} />
              </label>
            </div>

            {/* Dirección / Código postal */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="grid gap-1 md:col-span-2">
                <span className="text-xs font-medium text-neutral-600">Dirección</span>
                <input className={inputCls} value={form.address} onChange={(e)=> setForm(f=> ({ ...f, address: e.target.value }))} />
              </label>
              <label className="grid gap-1 md:col-span-1">
                <span className="text-xs font-medium text-neutral-600">Código postal</span>
                <input className={inputCls} value={form.postalCode} onChange={(e)=> setForm(f=> ({ ...f, postalCode: e.target.value }))} />
              </label>
            </div>

            {/* Teléfono / Email / Email adicional */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="grid gap-1">
                <span className="text-xs font-medium text-neutral-600">Teléfono</span>
                <input className={inputCls} inputMode="tel" value={form.phone} onChange={(e)=> setForm(f=> ({ ...f, phone: e.target.value }))} />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-neutral-600">Email</span>
                <input className={inputCls} value={form.email} disabled readOnly />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-neutral-600">Email adicional</span>
                <input className={inputCls} value={form.emailAlt} onChange={(e)=> setForm(f=> ({ ...f, emailAlt: e.target.value }))} />
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button className={btnSecondary} onClick={reloadClientForm}>Descartar</button>
              <button className={btnPrimary} onClick={saveAccount} disabled={savingAccount}>{savingAccount ? "Guardando…" : "Guardar cambios"}</button>
            </div>
          </div>
        </section>
      )}

      {alertOpen ? (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
          <div className="bg-white w-full max-w-md rounded-xl shadow-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">Alertar tracking</h3>
              <button className={btnSecondary} onClick={()=> setAlertOpen(false)}>Cerrar</button>
            </div>
            <label className="grid gap-1">
              <span className="text-xs font-medium text-neutral-600">Tracking</span>
              <input className={inputCls} value={alertTracking} onChange={(e)=> setAlertTracking(e.target.value)} placeholder="Ingresá el tracking esperado" />
            </label>
            <label className="grid gap-1 mt-2">
              <span className="text-xs font-medium text-neutral-600">Nota (opcional)</span>
              <input className={inputCls} value={alertNote} onChange={(e)=> setAlertNote(e.target.value)} placeholder="Ej: proveedor / compra #" />
            </label>
            <div className="flex justify-end gap-2 mt-4">
              <button className={btnSecondary} onClick={()=> setAlertOpen(false)}>Cancelar</button>
              <button className={btnPrimary} onClick={submitAlert} disabled={alertSaving || !alertTracking.trim()}>{alertSaving ? "Enviando…" : "Enviar"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
