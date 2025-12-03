// src/app/admin/ingreso/page.tsx
"use client";
import RequireAuth from "@/components/RequireAuth";
import { db, storage } from "@/lib/firebase";
import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
  limit,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import type { Client, Carrier } from "@/types/lem";

const LB_TO_KG = 0.45359237;
const KG_TO_LB = 1 / LB_TO_KG;

// Resize/compress using a canvas. Returns a JPEG Blob.
async function processImage(file: File): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => { URL.revokeObjectURL(url); resolve(i); };
    i.onerror = (e) => reject(e);
    i.src = url;
  });

  const maxEdge = 1600; // foto de paquete
  const quality = 0.82;

  const { width, height } = img;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas context");
  ctx.drawImage(img, 0, 0, w, h);

  return await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b as Blob), "image/jpeg", quality)
  );
}

type Row = {
  id?: string;
  tracking: string;
  carrier: Carrier;
  clientId: string;
  weightLb: number;
  weightKg: number;
  photo?: File | null;
};


const carriers: Carrier[] = ["UPS", "FedEx", "USPS", "DHL", "Amazon", "Other"];

// --- BrandSelect helper types and component ---

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

  const showLabel = value ? options.find((o) => o.value === value)?.label ?? value : placeholder;
  const baseClasses =
    "mt-1 h-12 w-full rounded-md border border-slate-300 bg-white text-slate-900 px-4 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#005f40] focus:border-[#005f40] flex items-center justify-between" +
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

export default function IngresoPage() {
  return (
    <RequireAuth requireAdmin>
      <PageInner />
    </RequireAuth>
  );
}

function PageInner() {
  const [clients, setClients] = useState<Client[]>([]);
  const clientsById = useMemo(() => {
    const m: Record<string, Client> = {};
    for (const c of clients) if (c.id) m[c.id] = c as Client;
    return m;
  }, [clients]);

  const [clientQuery, setClientQuery] = useState("");
  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => (
      `${c.code} ${c.name}`.toLowerCase().includes(q)
    ));
  }, [clients, clientQuery]);

  const [form, setForm] = useState<Row>({
    tracking: "",
    carrier: "UPS",
    clientId: "",
    weightLb: 0,
    weightKg: 0,
    photo: null,
  });
  const [saving, setSaving] = useState(false);
  type InboundRow = { id: string; tracking: string; carrier: Carrier; clientId: string; weightLb: number; photoUrl?: string; receivedAt: number; status: string };
  const [rows, setRows] = useState<InboundRow[]>([]);
  const [errMsg, setErrMsg] = useState("");
  const midnight = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  // inputs ocultos para foto: cámara y archivo
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Cámara embebida (getUserMedia)
  const videoRefPhoto = useRef<HTMLVideoElement | null>(null);
  const [photoActive, setPhotoActive] = useState(false);
  // Botones LEM-BOX (paleta: #005f40, #eb6619, #cf6934)
  const btnPrimaryCls = "inline-flex items-center justify-center h-11 px-5 rounded-md bg-[#eb6619] text-white font-medium shadow-md hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
  const btnSecondaryCls = "inline-flex items-center justify-center h-11 px-5 rounded-md border border-slate-300 bg-white text-slate-800 font-medium shadow-sm hover:bg-slate-50 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed";

  // cortar cámara al desmontar
  useEffect(() => () => {
    try {
      const media = videoRefPhoto.current?.srcObject as MediaStream | null;
      media?.getTracks().forEach(t => t.stop());
      if (videoRefPhoto.current) (videoRefPhoto.current as HTMLVideoElement).srcObject = null;
    } catch {}
  }, []);

  useEffect(() => {
    // cargar clientes
    getDocs(collection(db, "clients")).then((s) =>
      setClients(
        s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Client, "id">) }))
      )
    );
    // listar de hoy
    const q = query(
      collection(db, "inboundPackages"),
      where("receivedAt", ">=", midnight),
      orderBy("receivedAt", "desc")
    );
    getDocs(q).then((s) =>
      setRows(
        s.docs.map((d) => {
          const data = d.data() as {
            tracking: string;
            carrier: Carrier;
            clientId: string;
            weightLb: number;
            photoUrl?: string;
            receivedAt: number;
            status: string;
          };
          return { id: d.id, ...data };
        })
      )
    );
  }, [midnight]);

  function hasWeight() {
    return Number(form.weightLb) > 0 || Number(form.weightKg) > 0;
  }

  const computeWeightLb = useCallback((): number => {
    if (Number(form.weightLb) > 0) return Number(form.weightLb);
    if (Number(form.weightKg) > 0) return Number((Number(form.weightKg) * KG_TO_LB).toFixed(2));
    return 0;
  }, [form.weightLb, form.weightKg]);

  // Manejo de archivos
  function onCameraPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    if (!f) return;
    setForm((x) => ({ ...x, photo: f }));
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(String(reader.result));
    reader.readAsDataURL(f);
  }
  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    if (!f) return;
    setForm((x) => ({ ...x, photo: f }));
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(String(reader.result));
    reader.readAsDataURL(f);
  }

  // --- Inline camera/photo functions ---

  async function startPhoto() {
    if (photoActive) return;
    setPhotoActive(true);
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    if (videoRefPhoto.current) {
      (videoRefPhoto.current as HTMLVideoElement).srcObject = stream as MediaStream;
      await videoRefPhoto.current.play();
    }
  }

  async function stopPhoto() {
    try {
      const media = videoRefPhoto.current?.srcObject as MediaStream | null;
      media?.getTracks().forEach(t => t.stop());
      if (videoRefPhoto.current) (videoRefPhoto.current as HTMLVideoElement).srcObject = null;
    } finally {
      setPhotoActive(false);
    }
  }

  async function capturePhoto(): Promise<File | null> {
    const video = videoRefPhoto.current;
    if (!video) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob((b: Blob | null) => res(b), "image/jpeg", 0.9)
    );
    if (!blob) return null;
    const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
    setPhotoPreview(URL.createObjectURL(blob));
    return file;
  }

  // Crear inbound
  const createInbound = useCallback(async (trackingValue: string) => {
    // Unicidad por tracking
    const dupeSnap = await getDocs(query(collection(db, "inboundPackages"), where("tracking", "==", trackingValue), limit(1)));
    if (!dupeSnap.empty) {
      setErrMsg(`El tracking ${trackingValue} ya existe en el sistema.`);
      return false;
    }
    // Validaciones de negocio
    const weightLbVal = computeWeightLb();
    if (weightLbVal <= 0) { setErrMsg("Ingrese un peso válido en lb o kg."); return false; }

    let photoUrl: string | undefined;
    if (form.photo) {
      const blob = await processImage(form.photo);
      const dest = `inbound/${Date.now()}-${trackingValue}.jpg`;
      const r = ref(storage, dest);
      await uploadBytes(r, blob, { contentType: "image/jpeg" });
      photoUrl = await getDownloadURL(r);
    }
    const docRef = await addDoc(collection(db, "inboundPackages"), {
      tracking: trackingValue,
      carrier: form.carrier,
      clientId: form.clientId,
      weightLb: weightLbVal,
      photoUrl,
      status: "received",
      receivedAt: Timestamp.now().toMillis(),
    });
    setRows([{ id: docRef.id, tracking: trackingValue, carrier: form.carrier, clientId: form.clientId, weightLb: weightLbVal, photoUrl, receivedAt: Date.now(), status: "received" }, ...rows]);
    setForm({ tracking: "", carrier: form.carrier, clientId: form.clientId, weightLb: 0, weightKg: 0, photo: null });
    setPhotoPreview(null);
    return true;
  }, [form.carrier, form.clientId, form.photo, rows, computeWeightLb]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.tracking || !form.clientId || !hasWeight()) return;
    setSaving(true);
    setErrMsg("");
    const trackingValue = form.tracking.trim();
    const ok = await createInbound(trackingValue);
    setSaving(false);
    if (!ok) return;
  }

  return (
    <main className="min-h-[100dvh] bg-[#02120f] text-white p-4 md:p-8 pt-24 md:pt-28 space-y-6">
      <h1 className="text-2xl font-semibold">Ingreso de paquetes</h1>
      {errMsg ? (
        <div className="p-3 rounded border border-red-300 bg-red-50 text-sm text-red-700">{errMsg}</div>
      ) : null}

      <div className="bg-white text-neutral-900 rounded-lg shadow p-4">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* BUSCAR CLIENTE + SELECT */}
          {/* removed client search and filter UI */}

          {/* CLIENTE SELECT + TRACKING */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-neutral-500">Cliente</label>
              <input
                className="mt-1 mb-1 border rounded-md px-4 h-10 w-full bg-white text-base"
                placeholder="Escribir para buscar (código o nombre)"
                value={clientQuery}
                onChange={(e) => setClientQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const first = filteredClients[0];
                    if (first?.id) setForm((f) => ({ ...f, clientId: String(first.id) }));
                  }
                }}
              />
              <BrandSelect
                value={form.clientId}
                onChange={(val) => setForm((f) => ({ ...f, clientId: val }))}
                options={filteredClients
                  .filter((c) => c.id)
                  .map((c) => ({
                    value: String(c.id),
                    label: `${c.code} — ${c.name}`,
                  }))}
                placeholder="Seleccionar…"
              />
              <p className="mt-1 text-[11px] text-neutral-500">Mostrando {filteredClients.length} de {clients.length}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-500">Ingreso de tracking</label>
              <input
                className="mt-1 border rounded-md px-4 h-12 w-full bg-white text-base"
                placeholder="Escanear o escribir tracking"
                value={form.tracking}
                onChange={(e) => setForm((f) => ({ ...f, tracking: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-500">Carrier</label>
              <BrandSelect
                value={form.carrier}
                onChange={(val) => setForm((f) => ({ ...f, carrier: val as Carrier }))}
                options={carriers.map((c) => ({ value: c, label: c }))}
                placeholder="Seleccionar carrier"
              />
            </div>
          </div>

          {/* PESO: tarjetas grandes */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-start gap-4">
            {/* Libra */}
            <div className="rounded-lg border ring-1 ring-slate-200 overflow-hidden">
              <div className="p-4">
                <input
                  className="w-full text-center text-3xl md:text-4xl font-semibold outline-none"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={form.weightLb || ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => ({
                      ...f,
                      weightLb: v === "" ? 0 : Number(v),
                      weightKg: v === "" ? 0 : Number((Number(v) * LB_TO_KG).toFixed(3)),
                    }));
                  }}
                />
              </div>
              <div className="py-2 text-white text-sm text-center font-semibold" style={{ backgroundColor: "#005f40" }}>
                LIBRA
              </div>
            </div>

            <div className="hidden md:grid place-items-center text-3xl font-bold select-none">=</div>

            {/* Kilogramo */}
            <div className="rounded-lg border ring-1 ring-slate-200 overflow-hidden">
              <div className="p-4">
                <input
                  className="w-full text-center text-3xl md:text-4xl font-semibold outline-none"
                  type="number"
                  step="0.001"
                  placeholder="0.000"
                  value={form.weightKg || ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => ({
                      ...f,
                      weightKg: v === "" ? 0 : Number(v),
                      weightLb: v === "" ? 0 : Number((Number(v) * KG_TO_LB).toFixed(2)),
                    }));
                  }}
                />
              </div>
              <div className="py-2 text-white text-sm text-center font-semibold" style={{ backgroundColor: "#005f40" }}>
                KILOGRAMO
              </div>
            </div>
          </div>

          {/* FOTO */}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => (photoActive ? stopPhoto() : startPhoto())}
              className={btnSecondaryCls}
            >
              {photoActive ? "Cerrar cámara" : "Tomar foto"}
            </button>
            <button
              type="button"
              onClick={async () => { const f = await capturePhoto(); if (f) setForm((x) => ({ ...x, photo: f })); }}
              disabled={!photoActive}
              className={btnPrimaryCls}
            >
              Capturar
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={btnSecondaryCls}
            >
              Adjuntar foto
            </button>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*;capture=camera"
              capture="environment"
              className="hidden"
              onChange={onCameraPick}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFilePick}
            />
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoPreview} alt="preview" className="h-12 w-12 object-cover rounded-md border" />
            ) : null}
            {photoActive ? (
              <div className="mt-2">
                <video ref={videoRefPhoto} className="w-full rounded-md border" autoPlay muted playsInline />
              </div>
            ) : null}
          </div>

          {/* BOTÓN GUARDAR sticky en mobile */}
          <div className="md:static fixed left-0 right-0 bottom-0 bg-white/90 backdrop-blur border-t p-3 z-10">
            <div className="max-w-3xl mx-auto text-right">
              <button disabled={saving} className={btnPrimaryCls}>
                {saving ? 'Guardando…' : 'Enviar'}
              </button>
            </div>
          </div>
        </form>
      </div>

      <section>
        <h2 className="font-medium mb-2">Hoy</h2>
        <div className="grid gap-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="border rounded p-3 flex items-center gap-3"
            >
              {r.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.photoUrl}
                  alt=""
                  className="w-16 h-16 object-cover rounded"
                />
              ) : (
                <div className="w-16 h-16 bg-neutral-100 rounded" />
              )}
              <div className="flex-1">
                <div className="text-sm">
                  #{r.tracking} · {r.carrier} · {r.weightLb} lb
                </div>
                <div className="text-xs text-neutral-500">
                  Cliente: {clientsById[r.clientId]?.code ? `${clientsById[r.clientId]?.code} — ${clientsById[r.clientId]?.name}` : r.clientId}
                </div>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-emerald-600 text-white">
                {r.status}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}