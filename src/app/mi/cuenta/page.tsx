// src/app/mi/cuenta/page.tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useMiContext } from "../_context/MiContext";


const CONTROL_BORDER = "border-[#1f3f36]";
const btnPrimary =
  "inline-flex items-center justify-center h-10 px-4 rounded-md bg-[#eb6619] text-white font-medium shadow-md hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
const btnSecondary =
  "inline-flex items-center justify-center h-10 px-4 rounded-md border border-[#1f3f36] bg-white/5 text-white/90 font-medium hover:bg-white/10 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed";
const inputCls =
  "h-10 w-full rounded-md border border-[#1f3f36] bg-[#0f2a22] px-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#005f40]";
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
  Argentina: [
    "Buenos Aires",
    "CABA",
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

interface LemSelectOption {
  value: string;
  label: string;
}

interface LemSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: LemSelectOption[];
  placeholder?: string;
  disabled?: boolean;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function LemSelect({ value, onChange, options, placeholder = "Seleccionar…", disabled }: LemSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, []);

  const selectedLabel = options.find((o) => o.value === value)?.label;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
        className={cx(
          "h-10 w-full rounded-md border border-[#1f3f36] px-3 flex items-center justify-between text-left bg-[#0f2a22] text-white focus:outline-none focus:ring-2 focus:ring-[#005f40]",
          disabled && "bg-[#0f2a22]/50 text-white/40 cursor-not-allowed opacity-70"
        )}
      >
        <span className={value ? "text-white" : "text-white/40"}>
          {selectedLabel || placeholder}
        </span>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cx("transition-transform text-white/60", open && "rotate-180")}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && !disabled && (
        <div className="absolute left-0 right-0 mt-1 rounded-md border border-[#1f3f36] bg-[#071f19] shadow-lg z-20 max-h-60 overflow-auto">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={cx(
                "w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10",
                value === opt.value && "bg-white/20 text-white font-medium"
              )}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MiCuentaPage() {
  const { clientId } = useMiContext();
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

  useEffect(() => {
    if (clientId) {
      loadClientForm(clientId);
    }
  }, [clientId]);

  async function loadClientForm(cid: string) {
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
    await loadClientForm(clientId);
  }

  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-[#1f3f36] ring-1 ring-white/10 bg-[#071f19] shadow-sm p-4 grid gap-3">
        {/* Código + Nombre */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="grid gap-1 md:col-span-1">
            <span className="text-xs font-medium text-white/80">Código</span>
            <input className={inputCls} style={INPUT_BG_STYLE} value={form.code} disabled readOnly />
          </label>
          <label className="grid gap-1 md:col-span-2">
            <span className="text-xs font-medium text-white/80">Nombre</span>
            <input
              className={inputCls}
              style={INPUT_BG_STYLE}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
        </div>

        {/* Tipo/Número de documento */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="grid gap-1 md:col-span-1">
            <span className="text-xs font-medium text-white/80">Tipo de documento</span>
            <LemSelect
              value={form.docType}
              onChange={(v) => setForm((f) => ({ ...f, docType: v }))}
              options={getDocTypes(form.country).map((t) => ({ value: t, label: t }))}
              placeholder="Seleccionar…"
            />
          </label>
          <label className="grid gap-1 md:col-span-2">
            <span className="text-xs font-medium text-white/80">Número de documento</span>
            <input
              className={inputCls}
              style={INPUT_BG_STYLE}
              value={form.docNumber}
              onChange={(e) => setForm((f) => ({ ...f, docNumber: e.target.value }))}
            />
          </label>
        </div>

        {/* País / Estado / Ciudad */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="grid gap-1">
            <span className="text-xs font-medium text-white/80">País</span>
            <LemSelect
              value={form.country}
              onChange={(v) => setForm((f) => ({ ...f, country: v, state: "" }))}
              options={[
                { value: "Uruguay", label: "Uruguay" },
                { value: "Argentina", label: "Argentina" },
                { value: "United States", label: "United States" },
              ]}
              placeholder="Seleccionar país…"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-white/80">Estado / Depto / Provincia</span>
            <LemSelect
              value={form.state}
              onChange={(v) => setForm((f) => ({ ...f, state: v }))}
              options={(STATES_BY_COUNTRY[form.country] || []).map((s) => ({ value: s, label: s }))}
              placeholder="Seleccionar…"
              disabled={!STATES_BY_COUNTRY[form.country]}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-white/80">Ciudad</span>
            <input
              className={inputCls}
              style={INPUT_BG_STYLE}
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
          </label>
        </div>

        {/* Dirección / Código postal */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="grid gap-1 md:col-span-2">
            <span className="text-xs font-medium text-white/80">Dirección</span>
            <input
              className={inputCls}
              style={INPUT_BG_STYLE}
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </label>
          <label className="grid gap-1 md:col-span-1">
            <span className="text-xs font-medium text-white/80">Código postal</span>
            <input
              className={inputCls}
              style={INPUT_BG_STYLE}
              value={form.postalCode}
              onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
            />
          </label>
        </div>

        {/* Teléfono / Email / Email adicional */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="grid gap-1">
            <span className="text-xs font-medium text-white/80">Teléfono</span>
            <input
              className={inputCls}
              style={INPUT_BG_STYLE}
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-white/80">Email</span>
            <input className={inputCls} style={INPUT_BG_STYLE} value={form.email} disabled readOnly />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-white/80">Email adicional</span>
            <input
              className={inputCls}
              style={INPUT_BG_STYLE}
              value={form.emailAlt}
              onChange={(e) => setForm((f) => ({ ...f, emailAlt: e.target.value }))}
            />
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <button className={btnSecondary} onClick={reloadClientForm}>
            Descartar
          </button>
          <button className={btnPrimary} onClick={saveAccount} disabled={savingAccount}>
            {savingAccount ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </section>
  );
}
