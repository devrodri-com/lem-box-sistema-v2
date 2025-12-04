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
    "mt-1 h-11 w-full rounded-md border border-slate-300 bg-white text-slate-900 px-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#005f40] focus:border-[#005f40] flex items-center justify-between" +
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
        <span className="ml-2 text-slate-500">▾</span>
      </button>
      {open && !disabled && options.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-sm shadow-lg ring-1 ring-black/5">
          {options.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-slate-900 hover:bg-slate-100"
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

function PageInner() {
  const [rows, setRows] = useState<Client[]>([]);
  const [busyId, setBusyId] = useState<string>("");
  const [q, setQ] = useState("");
  const [countryFilter, setCountryFilter] = useState<string>("");

  // Pagination state
  const [pageSize, setPageSize] = useState<number>(20);
  const [page, setPage] = useState<number>(0);

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
    <main className="min-h-[100dvh] bg-[#02120f] text-white flex flex-col items-center p-4 md:p-8 pt-24 md:pt-28">
      <div className="w-full max-w-6xl bg-white text-neutral-900 rounded-xl shadow-md ring-1 ring-slate-200 p-4 md:p-6 space-y-6">
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
        {paginatedRows.map((c) => (
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
      {totalRows > 0 && (
        <div className="mt-4 flex flex-col items-center justify-center gap-2 text-xs text-neutral-600">
          <div className="flex items-center gap-2">
            <span>Mostrar</span>
            <select
              className="h-8 rounded border border-slate-300 px-2"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
            >
              {[10, 20, 50].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span>por página</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(0)}
              disabled={page === 0}
              className="px-2 py-1 rounded border text-xs disabled:opacity-40"
            >
              «
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-1 rounded border text-xs disabled:opacity-40"
            >
              Anterior
            </button>
            <span>
              Página {totalRows === 0 ? 0 : page + 1} de {totalPages}
            </span>
            <button
              type="button"
              onClick={() =>
                setPage((p) => Math.min(totalPages - 1, p + 1))
              }
              disabled={page >= totalPages - 1 || totalRows === 0}
              className="px-2 py-1 rounded border text-xs disabled:opacity-40"
            >
              Siguiente
            </button>
            <button
              type="button"
              onClick={() => setPage(totalPages - 1)}
              disabled={page >= totalPages - 1 || totalRows === 0}
              className="px-2 py-1 rounded border text-xs disabled:opacity-40"
            >
              »
            </button>
          </div>
        </div>
      )}
      </div>
    </main>
  );
}