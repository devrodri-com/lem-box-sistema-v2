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
import { useEffect, useMemo, useState, useCallback } from "react";
import type { Client, Carrier } from "@/types/lem";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { useRef } from "react";

const LB_TO_KG = 0.45359237;
const KG_TO_LB = 1 / LB_TO_KG;
type ImageMode = "photo" | "doc";

// Resize/compress using a canvas. Returns a JPEG Blob.
async function processImage(file: File, mode: ImageMode): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => { URL.revokeObjectURL(url); resolve(i); };
    i.onerror = (e) => reject(e);
    i.src = url;
  });

  const maxEdge = mode === "photo" ? 1600 : 2400; // documentos mantienen más resolución
  const quality = mode === "photo" ? 0.82 : 0.92;

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

  // Para documentos chicos ya nítidos, evita recomprimir agresivo
  const isSmallDoc = mode === "doc" && file.size < 400 * 1024;
  if (isSmallDoc) {
    // Devuelve el blob original si es pequeño
    return file.slice(0, file.size, file.type);
  }

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
  imageMode: ImageMode; // "photo" por defecto, "doc" para facturas
};

const carriers: Carrier[] = ["UPS", "FedEx", "USPS", "DHL", "Amazon", "Other"];

export default function IngresoPage() {
  return (
    <RequireAuth>
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
  const [form, setForm] = useState<Row>({
    tracking: "",
    carrier: "UPS",
    clientId: "",
    weightLb: 0,
    weightKg: 0,
    photo: null,
    imageMode: "photo",
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

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [scanning, setScanning] = useState(false);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  const videoRefPhoto = useRef<HTMLVideoElement | null>(null);
  const [photoActive, setPhotoActive] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  async function startScan() {
    if (scanning) return;
    setScanning(true);
    if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
    const reader = readerRef.current;
    controlsRef.current = await reader.decodeFromVideoDevice(
      undefined,
      videoRef.current!,
      (result) => {
        if (result) {
          const value = result.getText().trim();
          setForm((f) => ({ ...f, tracking: value }));
          if (form.clientId && hasWeight()) {
            setSaving(true);
            setErrMsg("");
            createInbound(value).finally(() => { setSaving(false); });
          }
          stopScan();
        }
      }
    );
  }

  async function stopScan() {
    try {
      await controlsRef.current?.stop();
      controlsRef.current = null;
    } finally {
      setScanning(false);
    }
  }

  async function startPhoto() {
    if (photoActive) return;
    setPhotoActive(true);
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    if (videoRefPhoto.current) {
      videoRefPhoto.current.srcObject = stream as MediaStream;
      await videoRefPhoto.current.play();
    }
  }

  async function stopPhoto() {
    try {
      const media = videoRefPhoto.current?.srcObject as MediaStream | null;
      media?.getTracks().forEach(t => t.stop());
      if (videoRefPhoto.current) videoRefPhoto.current.srcObject = null;
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

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    if (!f) return;
    setForm((x) => ({ ...x, photo: f }));
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(String(reader.result));
    reader.readAsDataURL(f);
  }

  function hasWeight() {
    return Number(form.weightLb) > 0 || Number(form.weightKg) > 0;
  }

  const computeWeightLb = useCallback((): number => {
    if (Number(form.weightLb) > 0) return Number(form.weightLb);
    if (Number(form.weightKg) > 0) return Number((Number(form.weightKg) * KG_TO_LB).toFixed(2));
    return 0;
  }, [form.weightLb, form.weightKg]);

  // Nota: la foto es opcional para todos los carriers.
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
      const blob = await processImage(form.photo, form.imageMode);
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
    setForm({ tracking: "", carrier: form.carrier, clientId: form.clientId, weightLb: 0, weightKg: 0, photo: null, imageMode: form.imageMode });
    setPhotoPreview(null);
    return true;
  }, [form.carrier, form.clientId, form.imageMode, form.photo, rows, computeWeightLb]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.tracking || !form.clientId || !form.weightLb) return;
    setSaving(true);
    setErrMsg("");
    const trackingValue = form.tracking.trim();
    if (!hasWeight()) { setSaving(false); setErrMsg("Ingrese un peso válido en lb o kg."); return; }
    const ok = await createInbound(trackingValue);
    if (!ok) { setSaving(false); return; }
    setSaving(false);
  }

  return (
    <main className="p-4 md:p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Ingreso de paquetes</h1>
      {errMsg ? (
        <div className="p-3 rounded border border-red-300 bg-red-50 text-sm text-red-700">{errMsg}</div>
      ) : null}
      <div className="bg-white text-neutral-900 rounded-lg shadow p-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* TRACKING + SCAN + CARRIER */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-neutral-500">Ingreso de tracking</label>
            <input
              className="border rounded-md px-4 h-12 w-full bg-white text-base"
              placeholder="Escanear o escribir tracking"
              value={form.tracking}
              onChange={(e) => setForm((f) => ({ ...f, tracking: e.target.value }))}
            />
          </div>
          <div className="flex md:block gap-2 md:gap-0">
            <div className="w-1/2 md:w-full">
              <label className="text-xs font-medium text-neutral-500">&nbsp;</label>
              <button
                type="button"
                onClick={scanning ? stopScan : startScan}
                className="h-12 w-full rounded-md border bg-white text-neutral-900 hover:bg-neutral-100 text-sm"
                aria-pressed={scanning}
              >
                {scanning ? "Detener" : "Escanear"}
              </button>
            </div>
            <div className="w-1/2 md:w-full">
              <label className="text-xs font-medium text-neutral-500">Carrier</label>
              <select
                className="border rounded-md px-4 h-12 w-full bg-white text-base"
                value={form.carrier}
                onChange={(e) => setForm((f) => ({ ...f, carrier: e.target.value as Carrier }))}
              >
                {carriers.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        {scanning ? (
          <div>
            <video ref={videoRef} className="w-full rounded-md border" autoPlay muted playsInline />
          </div>
        ) : null}

        {/* CLIENTE */}
        <div>
          <label className="text-xs font-medium text-neutral-500">Cliente</label>
          <select
            className="mt-1 border rounded-md px-4 h-12 w-full bg-white text-base"
            value={form.clientId}
            onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
          >
            <option value="">Seleccionar…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
            ))}
          </select>
        </div>

        {/* PESO */}
        <div>
          <label className="text-xs font-medium text-neutral-500">Peso</label>
          <div className="mt-1 grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <input
                className="border rounded-md px-4 h-12 w-full bg-white text-base"
                type="number" step="0.01" placeholder="0.00"
                value={form.weightLb || ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => ({
                    ...f,
                    weightLb: v === "" ? 0 : Number(v),
                    weightKg: v === "" ? 0 : Number((Number(v) * LB_TO_KG).toFixed(2)),
                  }));
                }}
              />
              <span className="text-xs text-neutral-500">lb</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                className="border rounded-md px-4 h-12 w-full bg-white text-base"
                type="number" step="0.01" placeholder="0.00"
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
              <span className="text-xs text-neutral-500">kg</span>
            </div>
          </div>
        </div>

        {/* FOTO / DOCUMENTO */}
        <div>
          <label className="text-xs font-medium text-neutral-500">Foto del paquete / documento</label>
          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
            <button type="button" onClick={photoActive ? stopPhoto : startPhoto} className="h-12 w-full rounded-md border bg-white text-neutral-900 hover:bg-neutral-100 text-sm">
              {photoActive ? "Cerrar cámara" : "Tomar foto"}
            </button>
            <button type="button" className="h-12 w-full rounded-md border bg-white text-neutral-900 hover:bg-neutral-100 text-sm" onClick={async () => { const f = await capturePhoto(); if (f) setForm((x) => ({ ...x, photo: f })); }} disabled={!photoActive}>
              Capturar
            </button>
            <button type="button" className="h-12 w-full rounded-md border bg-white text-neutral-900 hover:bg-neutral-100 text-sm" onClick={openFilePicker}>
              Adjuntar
            </button>
            <select
              className="h-12 w-full px-4 rounded-md border text-sm bg-white"
              value={form.imageMode}
              onChange={(e) => setForm((f) => ({ ...f, imageMode: e.target.value as ImageMode }))}
              title="Tipo de imagen"
            >
              <option value="photo">Foto paquete (comprimir)</option>
              <option value="doc">Documento nítido</option>
            </select>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFilePicked} />
          </div>
          {photoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoPreview} alt="preview" className="mt-2 h-20 w-20 object-cover rounded-md border" />
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
            <button disabled={saving} className="h-12 px-6 rounded-md text-white text-base" style={{ backgroundColor: saving ? '#3b3b3b' : '#005f40' }}>
              {saving ? 'Guardando…' : 'Guardar'}
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
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.photoUrl}
                    alt=""
                    className="w-16 h-16 object-cover rounded"
                  />
                </>
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