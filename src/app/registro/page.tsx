// src/app/registro/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import {
  collection, addDoc, doc, runTransaction, setDoc
} from "firebase/firestore";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import AccessNavbarDesktop from "@/components/auth/AccessNavbarDesktop";
import AccessNavbarMobile from "@/components/auth/AccessNavbarMobile";

const btnPrimary =
  "inline-flex items-center justify-center h-11 px-5 rounded-md bg-[#eb6619] text-white font-medium shadow-md hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
const btnSecondary =
  "inline-flex items-center justify-center h-11 px-5 rounded-md border border-slate-300 bg-white text-slate-800 font-medium shadow-sm hover:bg-slate-50 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed";
const inputCls =
  "h-11 w-full rounded-md border border-slate-300 bg-slate-50 text-slate-900 px-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#005f40] focus:border-[#005f40]";
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

type ClientPayload = {
  code: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  state: string;
  city: string;
  address: string;
  activo: boolean;
  createdAt: number;
};

type UserPayload = {
  uid: string;
  email: string;
  displayName: string;
  clientId: string;
  managedClientIds: string[];
  termsAcceptedAt: number;
  lang: "es";
  role: "client";
};

interface BrandSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  disabled?: boolean;
}

function BrandSelect({ value, onChange, options, placeholder, disabled }: BrandSelectProps) {
  const [open, setOpen] = useState(false);

  const showLabel = value || placeholder;
  const baseClasses =
    inputCls +
    " flex items-center justify-between pr-9 bg-white text-slate-900" +
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
            <li key={opt}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-slate-900 hover:bg-slate-100"
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
              >
                {opt}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function RegistroPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("Uruguay");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [accept, setAccept] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function nextClientCode(): Promise<string> {
    const ref = doc(db, "counters", "clients");
    const n = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists() ? (snap.data() as { seq?: number }) : undefined;
      const curr = data?.seq ?? 0;
      const next = curr + 1;
      tx.set(ref, { seq: next }, { merge: true });
      return next;
    });
    return String(n);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!accept) {
      setErr("Debés aceptar los Términos y la Política de Privacidad.");
      return;
    }
    if (!email || !pw || !name || !phone || !country || !city) {
      setErr("Completá los campos obligatorios.");
      return;
    }
    if (STATES_BY_COUNTRY[country] && !stateName) {
      setErr("Seleccioná Estado/Provincia/Departamento.");
      setSaving(false);
      return;
    }

    setSaving(true);
    try {
      // 1) Crear usuario Auth
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw);
      await updateProfile(cred.user, { displayName: name });

      // 2) Generar código de cliente secuencial
      const code = await nextClientCode();

      // 3) Crear doc en "clients"
      const clientPayload: ClientPayload = {
        code,          // código incremental (visible para cliente y admin)
        name,
        email: email.trim(),
        phone: phone.trim(),
        country,
        state: stateName || "",
        city,
        address: address || "",
        activo: true,
        createdAt: Date.now(),
      };
      const clientRef = await addDoc(collection(db, "clients"), clientPayload);

      // 4) Mapear user → clientId (colección "users")
      const userPayload: UserPayload = {
        uid: cred.user.uid,
        email: email.trim(),
        displayName: name,
        clientId: clientRef.id,
        managedClientIds: [],
        termsAcceptedAt: Date.now(),
        lang: "es",
        role: "client",
      };
      await setDoc(doc(db, "users", cred.user.uid), userPayload);

      // 5) Redirigir a su perfil
      router.replace("/mi");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al registrar. Probá de nuevo.";
      setErr(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <AccessNavbarDesktop />
      <AccessNavbarMobile />

      <main className="min-h-[100dvh] bg-[#02120f] text-white flex flex-col items-center p-6 pt-24 md:pt-28">
        <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-md ring-1 ring-slate-200 text-neutral-900">
          <h1 className="text-2xl font-semibold">Crear cuenta</h1>
          <p className="text-sm text-neutral-600">
            Registrate para ver tus envíos, cajas y trackings.
          </p>

          {err ? (
            <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {err}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="mt-4 grid gap-3">
            <label className="grid gap-1">
              <span className="text-xs font-medium text-neutral-600">
                Nombre y apellido
              </span>
              <input
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-medium text-neutral-600">
                Teléfono
              </span>
              <input
                className={inputCls}
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>

            <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1.5fr_1fr] gap-3">
              <label className="grid gap-1">
                <span className="text-xs font-medium text-neutral-600">
                  País
                </span>
                <BrandSelect
                  value={country}
                  onChange={(val) => {
                    setCountry(val);
                    setStateName("");
                  }}
                  options={["Uruguay", "Argentina", "United States"]}
                  placeholder="Seleccionar país"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs font-medium text-neutral-600">
                  Estado / Depto / Provincia
                </span>
                <BrandSelect
                  value={stateName}
                  onChange={(val) => setStateName(val)}
                  options={STATES_BY_COUNTRY[country] || []}
                  placeholder="Seleccionar…"
                  disabled={!STATES_BY_COUNTRY[country]}
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs font-medium text-neutral-600">
                  Ciudad
                </span>
                <input
                  className={inputCls}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </label>
            </div>

            <label className="grid gap-1">
              <span className="text-xs font-medium text-neutral-600">
                Dirección (opcional)
              </span>
              <input
                className={inputCls}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-medium text-neutral-600">
                Email
              </span>
              <input
                className={inputCls}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-medium text-neutral-600">
                Contraseña
              </span>
              <input
                className={inputCls}
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
            </label>

            <label className="mt-1 flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-[2px]"
                checked={accept}
                onChange={(e) => setAccept(e.target.checked)}
              />
              <span className="text-xs text-neutral-600">
                Acepto los{" "}
                <a href="https://lem-box.com.uy/terminos" className="underline">
                  Términos
                </a>{" "}
                y la{" "}
                <a href="https://lem-box.com.uy/privacidad" className="underline">
                  Política de Privacidad
                </a>
                .
              </span>
            </label>

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => router.push("/acceder")}
                className={btnSecondary}
              >
                Ya tengo cuenta
              </button>
              <button
                type="submit"
                disabled={saving || !accept}
                className={btnPrimary}
              >
                {saving ? "Creando…" : "Crear cuenta"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </>
  );
}