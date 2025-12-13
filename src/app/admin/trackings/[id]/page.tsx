// src/app/admin/trackings/[id]/page.tsx
"use client";
import RequireAuth from "@/components/RequireAuth";
import { db } from "@/lib/firebase";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import type { Client, Carrier } from "@/types/lem";

const LB_TO_KG = 0.45359237;
const CARRIERS: Carrier[] = ["UPS","FedEx","USPS","DHL","Amazon","Other"];
const CONTROL_BORDER = "border-[#1f3f36]";

const DARK_INPUT =
  `h-11 w-full rounded-md border ${CONTROL_BORDER} bg-[#0f2a22] px-4 text-white placeholder:text-white/40 focus:outline-none focus:border-[#1f3f36]`;
const DARK_INPUT_READONLY =
  `h-11 w-full rounded-md border ${CONTROL_BORDER} bg-[#0f2a22] px-4 text-white/70`;

const INPUT_BG_STYLE = {
  backgroundColor: "#0f2a22",
  WebkitBoxShadow: "0 0 0px 1000px #0f2a22 inset",
  WebkitTextFillColor: "#ffffff",
} as const;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type LemOption = { value: string; label: string };

type LemSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: LemOption[];
  placeholder?: string;
  selectedTextClassName?: string;
};

function LemSelect({ value, onChange, options, placeholder = "Seleccionar…", selectedTextClassName }: LemSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value)?.label;

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        type="button"
        className={cx(
          `h-11 w-full rounded-md border ${CONTROL_BORDER} bg-[#0f2a22] px-4 pr-10`,
          "text-left flex items-center justify-between",
          "focus:outline-none focus:border-[#1f3f36]"
        )}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          className={cx(
            "truncate",
            value ? "text-white" : "text-white/50",
            value && selectedTextClassName
          )}
        >
          {selected || placeholder}
        </span>
        <span className="text-[#005f40]">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-auto rounded-md bg-[#071f19] py-1 text-sm shadow-lg ring-1 ring-white/10">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={cx(
                "block w-full px-3 py-2 text-left text-white/90 hover:bg-white/5",
                value === opt.value && "bg-[#005f4015] font-medium",
                value === opt.value && (selectedTextClassName || "text-[#005f40]")
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

// Shape of a tracking (inbound package)
interface Inbound {
  id?: string;
  tracking: string;
  carrier: Carrier;
  clientId: string;
  weightLb: number;
  status: "received" | "boxed" | "void";
  photoUrl?: string;
  invoiceUrl?: string;
  receivedAt?: number;
}

function statusTone(status: string) {
  if (status === "boxed") return "text-[#005f40]";
  if (status === "void") return "text-rose-400";
  return "text-white/80"; // received/default
}

export default function TrackingDetailPage() {
  return (
    <RequireAuth requireAdmin>
      <PageInner />
    </RequireAuth>
  );
}

function PageInner() {
  const params = useParams();
  const id = params?.id as string;

  const [clients, setClients] = useState<Client[]>([]);
  const [row, setRow] = useState<Inbound | null>(null);
  const [saving, setSaving] = useState(false);

  const clientsById = useMemo(() => {
    const m: Record<string, Client> = {};
    for (const c of clients) if (c.id) m[c.id] = c;
    return m;
  }, [clients]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [cs, is] = await Promise.all([
        getDocs(query(collection(db, "clients"), orderBy("createdAt", "desc"))),
        getDoc(doc(db, "inboundPackages", String(id))),
      ]);
      setClients(cs.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Client, "id">) })));
      if (is.exists()) {
        const d = is.data() as Omit<Inbound, "id">;
        setRow({ id, ...d });
      }
    })();
  }, [id]);

  const [form, setForm] = useState<Partial<Inbound>>({});
  useEffect(() => {
    if (row) setForm(row);
  }, [row]);

  const kg = useMemo(() => Number(((Number(form.weightLb) || 0) * LB_TO_KG).toFixed(2)), [form.weightLb]);
  const clientLabel = row?.clientId && clientsById[row.clientId] ? `${clientsById[row.clientId].code} ${clientsById[row.clientId].name}` : "-";

  async function save() {
    if (!row?.id) return;
    setSaving(true);
    try {
      const payload: Partial<Inbound> = {
        weightLb: typeof form.weightLb === "number" ? form.weightLb : row.weightLb,
      };
      await updateDoc(doc(db, "inboundPackages", String(row.id)), payload);
      setRow({ ...row, ...payload });
    } finally {
      setSaving(false);
    }
  }

  if (!row) {
    return (
      <main className="min-h-screen bg-[#02120f] text-white p-4 md:p-8">
        <p className="text-sm text-white/60">Cargando tracking…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#02120f] text-white p-4 md:p-8 pb-12">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/admin/historial-tracking" className="text-sm text-white/70 hover:text-white">← Volver al historial</Link>
            <h1 className="text-2xl font-semibold">Tracking: {row.tracking}</h1>
          </div>
        </div>

        <section className="flex flex-col gap-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-5">
        <label className="grid gap-1">
          <span className="text-xs text-white/60">Cliente actual</span>
          <div className={`rounded-md bg-[#0f2a22] border ${CONTROL_BORDER} px-4 py-3 text-white font-medium`}>
            {clientLabel}
          </div>
        </label>

        <label className="grid gap-1">
          <span className="text-xs text-white/60">Reasignar a cliente</span>
          <LemSelect
            value={String(form.clientId || row.clientId)}
            onChange={(v) => setForm((f) => ({ ...f, clientId: v }))}
            options={clients
              .filter((c) => Boolean(c.id))
              .map((c) => ({ value: String(c.id), label: `${c.code} ${c.name}` }))}
          />
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="grid gap-1">
            <span className="text-xs text-white/60">Carrier</span>
            <LemSelect
              value={String(form.carrier || row.carrier)}
              onChange={(v) => setForm((f) => ({ ...f, carrier: v as Carrier }))}
              options={CARRIERS.map((c) => ({ value: c, label: c }))}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-white/60">Estado</span>
            <LemSelect
              value={String(form.status || row.status)}
              onChange={(v) => setForm((f) => ({ ...f, status: v as Inbound["status"] }))}
              options={[
                { value: "received", label: "Recibido" },
                { value: "boxed", label: "Consolidado" },
                { value: "void", label: "Anulado" },
              ]}
              selectedTextClassName={statusTone(String(form.status || row.status))}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="grid gap-1">
            <span className="text-xs text-white/60">Peso (lb)</span>
            <input
              className={DARK_INPUT}
              style={INPUT_BG_STYLE}
              inputMode="decimal"
              value={typeof form.weightLb === "number" ? String(form.weightLb) : String(row.weightLb || 0)}
              onChange={(e) => setForm((f) => ({ ...f, weightLb: Number(e.target.value || 0) }))}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-white/60">Peso (kg)</span>
            <input
              className={DARK_INPUT}
              style={INPUT_BG_STYLE}
              inputMode="decimal"
              value={kg}
              onChange={(e) => {
                const v = Number(e.target.value || 0);
                const lb = Number((v / LB_TO_KG).toFixed(2));
                setForm((f) => ({ ...f, weightLb: lb }));
              }}
            />
          </label>
        </div>

        <label className="grid gap-1">
          <span className="text-xs text-white/60">Fecha de llegada</span>
          <input className={DARK_INPUT_READONLY} style={INPUT_BG_STYLE} value={row.receivedAt ? new Date(row.receivedAt).toLocaleString() : "-"} readOnly />
        </label>

        <div className="pt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            {row.photoUrl ? (
              <a
                className="px-4 py-2 rounded-md border border-[#eb6619] text-[#eb6619] font-medium hover:bg-[#eb6619]/10 focus:outline-none focus:ring-2 focus:ring-[#eb6619]"
                href={row.photoUrl}
                target="_blank"
              >
                Ver foto
              </a>
            ) : (
              <span className="text-sm text-white/40">Sin foto adjunta</span>
            )}

            {row.invoiceUrl ? (
              <a
                className="px-3 py-2 rounded-md border border-white/15 text-white/80 hover:bg-white/5"
                href={row.invoiceUrl}
                target="_blank"
              >
                Ver factura
              </a>
            ) : null}
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2.5 rounded-md bg-[#eb6619] text-white font-medium hover:brightness-110 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#eb6619]"
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </section>
      </div>
    </main>
  );
}