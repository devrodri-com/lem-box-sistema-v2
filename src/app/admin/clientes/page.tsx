// src/app/admin/clientes/page.tsx
"use client";
import RequireAuth from "@/components/RequireAuth";
import { db } from "@/lib/firebase";
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, Timestamp, updateDoc, runTransaction } from "firebase/firestore";
import { useEffect, useState, useMemo } from "react";
import type { Client } from "@/types/lem";

const COUNTRIES: string[] = [
  'Uruguay','Argentina','United States'
];

const STATES_BY_COUNTRY: Record<string, string[]> = {
  Uruguay: [
    'Artigas','Canelones','Cerro Largo','Colonia','Durazno','Flores','Florida','Lavalleja','Maldonado','Montevideo','Paysandú','Río Negro','Rivera','Rocha','Salto','San José','Soriano','Tacuarembó','Treinta y Tres'
  ],
  Argentina: [
    'Buenos Aires','Catamarca','Chaco','Chubut','Córdoba','Corrientes','Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones','Neuquén','Río Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe','Santiago del Estero','Tierra del Fuego','Tucumán','CABA'
  ],
  'United States': [
    'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'
  ]
};

export default function ClientesPage() {
  return (
    <RequireAuth requireAdmin>
      <PageInner />
    </RequireAuth>
  );
}

function PageInner() {
  const [rows, setRows] = useState<Client[]>([]);
  const [busyId, setBusyId] = useState<string>("");
  const [q, setQ] = useState("");
  const [countryFilter, setCountryFilter] = useState<string>("");

  // Form fields
  const [name, setName] = useState("");
  const [country, setCountry] = useState<string>(""); // free text or pick from datalist
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
  }

  useEffect(() => {
    const q = query(collection(db, "clients"), orderBy("createdAt", "desc"));
    getDocs(q).then((s) =>
      setRows(
        s.docs.map((d) => {
          const data = d.data() as Omit<Client, "id">;
          return { id: d.id, ...data } as Client;
        })
      )
    );
  }, []);

  const filteredRows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((c) => {
      const okCountry = !countryFilter || ((c.country || "").toLowerCase() === countryFilter.toLowerCase());
      if (!query) return okCountry;
      const name = (c.name || "").toLowerCase();
      const code = (c.code || "").toLowerCase();
      return okCountry && (name.includes(query) || code.includes(query));
    });
  }, [rows, q, countryFilter]);

  async function nextClientCode(): Promise<string> {
    const counterRef = doc(db, 'counters', 'clients');
    const n = await runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      const data = snap.data() as { seq?: unknown };
      const curr = snap.exists() && typeof data.seq === 'number' ? data.seq : 1200;
      const next = curr + 1;
      tx.set(counterRef, { seq: next }, { merge: true });
      return next;
    });
    return String(n);
  }

  async function createClient(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !country || !email || !password) return;
    const code = await nextClientCode();
    const payload: Omit<Client, 'id'> & { documento: { tipo: string; numero: string | null } } = {
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
    };
    const sanitized = Object.fromEntries(Object.entries(payload).filter(([, v]) => v != null));
    const ref = await addDoc(collection(db, 'clients'), sanitized as any);
    setRows([{ id: ref.id, ...(sanitized as any) }, ...rows]);
    resetForm();
    setOpenCreate(false);
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
    const ok = confirm(`Seguro que quiere eliminar al cliente ${code}?`);
    if (!ok) return;
    try {
      setBusyId(id);
      await deleteDoc(doc(db, "clients", id));
      setRows((r) => r.filter((c) => c.id !== id));
    } finally {
      setBusyId("");
    }
  }

  return (
    <main className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <button
          type="button"
          onClick={() => setOpenCreate(true)}
          className="h-10 px-4 rounded-md bg-brand-primary text-white shadow hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-brand-primary"
        >
          + Crear nuevo cliente
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="relative">
          <label className="text-xs font-medium text-neutral-600">Buscar</label>
          <input
            className="mt-1 h-11 w-full rounded-md border border-slate-300 pl-10 pr-9"
            placeholder="Nombre o Nº cliente"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="absolute left-3 top-[38px] text-neutral-400" aria-hidden>🔎</span>
          {q ? (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-3 top-[34px] text-neutral-500"
              aria-label="Limpiar búsqueda"
            >
              ✕
            </button>
          ) : null}
        </div>
        <div>
          <label className="text-xs font-medium text-neutral-600">País</label>
          <select
            className="mt-1 h-11 w-full rounded-md border border-slate-300"
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
          >
            <option value="">Todos</option>
            {COUNTRIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Modal de creación */}
      {openCreate ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40">
          <div className="bg-white w-[95vw] max-w-3xl rounded-lg shadow-xl p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Crear cliente</h2>
              <button className="text-sm" onClick={() => { resetForm(); setOpenCreate(false); }}>Cerrar</button>
            </div>
            <form onSubmit={createClient} className="grid gap-3 md:grid-cols-4">
              <div className="grid gap-3 md:grid-cols-4 md:col-span-4">
                <div className="md:col-span-2">
                  <input className="border rounded px-4 h-12 w-full" placeholder="Nombre completo" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="md:col-span-2">
                  <select className="border rounded px-4 h-12 w-full" value={country} onChange={(e) => { setCountry(e.target.value); setStateName(""); }} required>
                    <option value="" disabled>Seleccionar país…</option>
                    {COUNTRIES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <select className="border rounded px-4 h-12 w-full" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
                    <option>Cédula</option>
                    <option>Pasaporte</option>
                    <option>RUT</option>
                    <option>DNI</option>
                    <option>CUIT</option>
                    <option>CUIL</option>
                    <option>Otro</option>
                  </select>
                </div>
                <div>
                  <input className="border rounded px-4 h-12 w-full" placeholder="Nº documento" value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <input className="border rounded px-4 h-12 w-full" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="md:col-span-2">
                  <input className="border rounded px-4 h-12 w-full" type="password" placeholder="Contraseña (provisional)" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <div className="md:col-span-2">
                  <input
                    className="border rounded px-4 h-12 w-full"
                    type="tel"
                    inputMode="tel"
                    placeholder="Teléfono"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>

                <div className="md:col-span-3">
                  <input className="border rounded px-4 h-12 w-full" placeholder="Dirección" value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
                <div>
                  <input className="border rounded px-4 h-12 w-full" placeholder="Contacto / Referente (ej: Danny, IFS)" value={contact} onChange={(e) => setContact(e.target.value)} />
                </div>
                <div>
                  <input className="border rounded px-4 h-12 w-full" type="email" placeholder="Email adicional (opcional)" value={emailAlt} onChange={(e) => setEmailAlt(e.target.value)} />
                </div>

                <div>
                  <select
                    className="border rounded p-3"
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                    hidden={!country || !STATES_BY_COUNTRY[country]}
                  >
                    <option value="" disabled>Seleccionar…</option>
                    {(STATES_BY_COUNTRY[country] || []).map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <input
                    className="border rounded p-3"
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                    hidden={!!(country && STATES_BY_COUNTRY[country])}
                    placeholder="Estado / Depto / Provincia"
                  />
                </div>
                <div>
                  <input className="border rounded px-4 h-12 w-full" placeholder="Ciudad" value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div>
                  <input className="border rounded px-4 h-12 w-full" placeholder="Código postal" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
                </div>

                <div className="md:col-span-4 flex justify-end gap-2 mt-2">
                  <button type="button" onClick={() => { resetForm(); setOpenCreate(false); }} className="h-12 px-4 rounded border">Cancelar</button>
                  <button className="h-12 px-6 rounded text-white" style={{ backgroundColor: '#005f40' }}>Crear</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <section className="grid gap-2">
        {filteredRows.map((c) => (
          <div key={c.id} className="border rounded p-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm"><b>{c.code}</b> — {c.name}</div>
              <div className="text-xs text-neutral-500">País: {c.country} · Estado: {c.activo ? "Activo" : "Inactivo"}</div>
            </div>
            <div className="flex items-center gap-2">
              <a href={`/admin/clientes/${c.id}`} className="px-2 py-1 text-xs rounded border" aria-label="Ver perfil">Ver perfil</a>
              <button
                onClick={() => toggleActivo(c.id!, c.activo !== false)}
                disabled={busyId === c.id}
                className={`px-2 py-1 text-xs rounded border ${ c.activo !== false ? "border-red-500 text-red-600" : "border-emerald-600 text-emerald-700"}`}
                aria-label={c.activo !== false ? "Desactivar" : "Activar"}
                title={c.activo !== false ? "Desactivar" : "Activar"}
              >
                {c.activo !== false ? "Desactivar" : "Activar"}
              </button>
              <button
                onClick={() => removeClient(c.id!, c.code)}
                disabled={busyId === c.id}
                className="px-2 py-1 text-xs rounded border border-neutral-400"
                aria-label="Eliminar"
                title="Eliminar definitivamente"
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 ? (
          <div className="text-sm text-neutral-500">Sin clientes aún.</div>
        ) : filteredRows.length === 0 ? (
          <div className="text-sm text-neutral-500">Sin resultados para la búsqueda.</div>
        ) : null}
      </section>
    </main>
  );
}