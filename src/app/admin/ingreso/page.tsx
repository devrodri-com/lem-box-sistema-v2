// src/app/admin/ingreso/page.tsx
"use client";
import RequireAuth from "@/components/RequireAuth";
import Link from "next/link";
import { db, storage } from "@/lib/firebase";
import { getAuth } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
  limit,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import type { Client, Carrier } from "@/types/lem";
import { type BrandOption } from "@/components/ui/BrandSelect";
import { buildTrackingTokens, buildClientTokens } from "@/lib/searchTokens";
import { fmtWeightPairFromLb } from "@/lib/weight";
import { getPrimaryPhotoUrl, getPhotoUrls } from "@/lib/inboundPhotos";
import { PhotoGalleryModal } from "@/components/inbounds/PhotoGalleryModal";

const LB_TO_KG = 0.45359237;
const KG_TO_LB = 1 / LB_TO_KG;

type InboundRow = { 
  id: string; 
  tracking: string; 
  carrier: Carrier; 
  clientId: string; 
  weightLb: number; 
  photoUrl?: string; // legacy
  photoUrls?: string[]; // nuevo
  receivedAt: number; 
  status: string 
};

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
};


const carriers: Carrier[] = ["UPS", "FedEx", "USPS", "DHL", "Amazon", "Other"];

// --- BrandSelect wrapper para mantener look específico de ingreso ---
// Usa el componente canónico pero con clases personalizadas (h-11, !bg, flecha verde, z-30, max-h-72)
function BrandSelect({ value, onChange, options, placeholder, disabled }: { value: string; onChange: (value: string) => void; options: BrandOption[]; placeholder: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);

  const showLabel = value ? options.find((o) => o.value === value)?.label ?? value : placeholder;
  const baseClasses =
    "mt-1 h-11 w-full rounded-md border border-[#1f3f36] !bg-[#0f2a22] px-4 pr-10 text-white focus:outline-none focus:ring-2 focus:ring-[#005f40] flex items-center justify-between" +
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
        className={baseClasses + (!value ? " text-white/50" : "")}
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev);
        }}
      >
        <span className="truncate text-left">{showLabel}</span>
        <span className="ml-2 text-[#005f40]">▾</span>
      </button>
      {open && !disabled && options.length > 0 && (
        <ul className="absolute left-0 right-0 z-30 mt-1 max-h-72 w-full overflow-auto rounded-md bg-[#071f19] py-1 text-sm shadow-lg ring-1 ring-white/10">
          {options.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-white/90 hover:bg-white/5"
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

  const [roleResolved, setRoleResolved] = useState(false);
  const [effectiveRole, setEffectiveRole] = useState<string | null>(null);
  const [isStaff, setIsStaff] = useState(false);

  function isStaffRole(role: string | null) {
    return role === "superadmin" || role === "admin" || role === "operador";
  }

  async function resolveRole(): Promise<boolean> {
    const auth = getAuth();
    const u = auth.currentUser;
    if (!u) {
      setEffectiveRole(null);
      setIsStaff(false);
      setRoleResolved(true);
      return false;
    }

    // Token claims (may be stale)
    const tok = await u.getIdTokenResult(true);
    const claims = (tok?.claims ?? {}) as Record<string, unknown>;
    const claimRole = typeof claims.role === "string" ? (claims.role as string) : null;

    // Back-compat legacy superadmin
    if (claims.superadmin === true) {
      setEffectiveRole("superadmin");
      setIsStaff(true);
      setRoleResolved(true);
      return true;
    }

    // Firestore role as second source of truth
    let firestoreRole: string | null = null;
    try {
      const snap = await getDoc(doc(db, "users", u.uid));
      if (snap.exists()) {
        const data = snap.data() as any;
        firestoreRole = typeof data?.role === "string" ? data.role : null;
      }
    } catch {
      firestoreRole = null;
    }

    // Least-privilege: if Firestore says partner_admin, treat as partner even if claims are stale
    const normalized = firestoreRole === "partner_admin" ? "partner_admin" : (claimRole ?? firestoreRole);
    const staff = isStaffRole(normalized);
    setEffectiveRole(normalized);
    setIsStaff(staff);
    setRoleResolved(true);

    console.log("[Ingreso] claimRole:", claimRole, "firestoreRole:", firestoreRole, "effectiveRole:", normalized);
    return staff;
  }

  const [clientQuery, setClientQuery] = useState("");
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
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
  });
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<InboundRow[]>([]);
  const [errMsg, setErrMsg] = useState("");
  const [selectedInbound, setSelectedInbound] = useState<InboundRow | null>(null);
  const [gallery, setGallery] = useState<{ photoUrls: string[]; tracking?: string; initialIndex?: number } | null>(null);
  
  // Estados para múltiples fotos
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([]);
  const [selectedPhotoPreviews, setSelectedPhotoPreviews] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function handleInboundSave(
    inboundId: string,
    updates: { carrier: Carrier; weightLb: number; clientId: string }
  ) {
    await updateDoc(doc(db, "inboundPackages", inboundId), {
      ...updates,
      updatedAt: Date.now(),
    });
    
    // Actualizar rows en memoria
    setRows((prev) =>
      prev.map((r) => (r.id === inboundId ? { ...r, ...updates } : r))
    );
    
    // Actualizar selectedInbound si es el que se editó
    setSelectedInbound((prev) =>
      prev && prev.id === inboundId ? { ...prev, ...updates } : prev
    );
  }
  const midnight = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  // inputs ocultos para foto: cámara y archivo
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Cámara embebida (getUserMedia)
  const videoRefPhoto = useRef<HTMLVideoElement | null>(null);
  const [photoActive, setPhotoActive] = useState(false);
  // Botones LEM-BOX (paleta: #005f40, #eb6619, #cf6934)
  const btnPrimaryCls = "inline-flex items-center justify-center h-11 px-8 rounded-md bg-[#eb6619] text-white font-medium hover:brightness-110 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#eb6619]";
  const btnSecondaryCls = "inline-flex items-center justify-center h-11 px-4 rounded-md border border-[#1f3f36] bg-white/5 text-white/90 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#005f40]";

  // cortar cámara al desmontar
  useEffect(() => () => {
    try {
      const media = videoRefPhoto.current?.srcObject as MediaStream | null;
      media?.getTracks().forEach(t => t.stop());
      if (videoRefPhoto.current) (videoRefPhoto.current as HTMLVideoElement).srcObject = null;
    } catch {}
  }, []);

  useEffect(() => {
    let alive = true;

    async function load() {
      const staffNow = await resolveRole();
      if (!alive) return;

      // Block non-staff (including partner_admin) from reading global data.
      if (!staffNow) {
        setClients([]);
        setRows([]);
        setErrMsg("Sin permisos para acceder a Ingreso de paquetes.");
        return;
      }

      // cargar clientes (staff only)
      const cs = await getDocs(collection(db, "clients"));
      if (!alive) return;
      setClients(cs.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Client, "id">) })));

      // listar de hoy (staff only)
      const q = query(
        collection(db, "inboundPackages"),
        where("receivedAt", ">=", midnight),
        orderBy("receivedAt", "desc")
      );
      const s = await getDocs(q);
      if (!alive) return;
      setRows(
        s.docs.map((d) => {
          const data = d.data() as {
            tracking: string;
            carrier: Carrier;
            clientId: string;
            weightLb: number;
            photoUrl?: string;
            photoUrls?: string[];
            receivedAt: number;
            status: string;
          };
          return { id: d.id, ...data };
        })
      );
    }

    void load();
    return () => {
      alive = false;
    };
  }, [midnight]);

  function hasWeight() {
    return Number(form.weightLb) > 0 || Number(form.weightKg) > 0;
  }

  const computeWeightLb = useCallback((): number => {
    if (Number(form.weightLb) > 0) return Number(form.weightLb);
    if (Number(form.weightKg) > 0) return Number((Number(form.weightKg) * KG_TO_LB).toFixed(2));
    return 0;
  }, [form.weightLb, form.weightKg]);

  // Manejo de archivos - múltiples fotos
  const MAX_PHOTOS = 3;
  
  function addPhoto(file: File) {
    if (selectedPhotos.length >= MAX_PHOTOS) {
      setPhotoError(`Máximo ${MAX_PHOTOS} fotos permitidas`);
      return;
    }
    setPhotoError(null);
    const preview = URL.createObjectURL(file);
    setSelectedPhotos((prev) => [...prev, file]);
    setSelectedPhotoPreviews((prev) => [...prev, preview]);
  }
  
  function removePhoto(index: number) {
    // Revocar ObjectURL antes de remover
    const preview = selectedPhotoPreviews[index];
    if (preview) {
      URL.revokeObjectURL(preview);
    }
    setSelectedPhotos((prev) => prev.filter((_, i) => i !== index));
    setSelectedPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
    setPhotoError(null);
  }
  
  function onCameraPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    if (!f) return;
    addPhoto(f);
    // Limpiar input para permitir seleccionar la misma foto de nuevo
    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
    }
  }
  
  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    if (!f) return;
    addPhoto(f);
    // Limpiar input para permitir seleccionar la misma foto de nuevo
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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
    addPhoto(file);
    return file;
  }

  // Crear inbound
  const createInbound = useCallback(async (trackingValue: string) => {
    // Normalizar tracking a uppercase
    const trackingUpper = trackingValue.trim().toUpperCase();
    
    // Unicidad por tracking
    const dupeSnap = await getDocs(query(collection(db, "inboundPackages"), where("tracking", "==", trackingUpper), limit(1)));
    if (!dupeSnap.empty) {
      setErrMsg(`El tracking ${trackingUpper} ya existe en el sistema.`);
      return false;
    }

    // Buscar alerta pendiente
    const alertQuery = query(
      collection(db, "trackingAlerts"),
      where("tracking", "==", trackingUpper),
      where("status", "==", "open"),
      limit(1)
    );
    const alertSnap = await getDocs(alertQuery);
    let alertDoc = alertSnap.empty ? null : alertSnap.docs[0];
    let alertData = alertDoc ? alertDoc.data() : null;

    // Si existe alerta y clientId no coincide, pedir confirmación
    if (alertDoc && alertData && alertData.clientId !== form.clientId) {
      const alertClient = clientsById[alertData.clientId];
      const selectedClient = clientsById[form.clientId];
      const alertClientName = alertClient 
        ? `${alertClient.code || ""} ${alertClient.name || ""}`.trim() || alertData.clientId
        : alertData.clientId;
      const selectedClientName = selectedClient
        ? `${selectedClient.code || ""} ${selectedClient.name || ""}`.trim() || form.clientId
        : form.clientId;
      
      const confirmed = window.confirm(
        `El tracking ${trackingUpper} está alertado por ${alertClientName}. ¿Seguro querés asignarlo a ${selectedClientName}?`
      );
      
      if (!confirmed) {
        return false; // Abortar createInbound
      }
    }

    // Validaciones de negocio
    const weightLbVal = computeWeightLb();
    if (weightLbVal <= 0) { setErrMsg("Ingrese un peso válido en lb o kg."); return false; }

    // Leer el cliente para obtener managerUid
    let managerUid: string | null = null;
    if (form.clientId) {
      try {
        const clientSnap = await getDoc(doc(db, "clients", form.clientId));
        if (clientSnap.exists()) {
          const clientData = clientSnap.data() as Omit<Client, "id">;
          managerUid = clientData.managerUid ?? null;
        }
      } catch (error) {
        console.error("Error al leer el cliente:", error);
        // Continuar sin managerUid si hay error
      }
    }

    // Subir múltiples fotos
    let photoUrls: string[] = [];
    let photoUrl: string | undefined;
    
    if (selectedPhotos.length > 0) {
      setUploadingPhotos(true);
      try {
        const uploadPromises = selectedPhotos.map(async (file) => {
          const blob = await processImage(file);
          const randomSuffix = Math.random().toString(36).substring(2, 9);
          const dest = `inbound/${Date.now()}-${trackingUpper}-${randomSuffix}.jpg`;
          const r = ref(storage, dest);
          await uploadBytes(r, blob, { contentType: "image/jpeg" });
          return await getDownloadURL(r);
        });
        
        photoUrls = await Promise.all(uploadPromises);
        photoUrl = photoUrls[0]; // Primera foto como legacy
      } catch (error) {
        console.error("Error al subir fotos:", error);
        setErrMsg("Error al subir las fotos. Intente nuevamente.");
        setUploadingPhotos(false);
        return false;
      } finally {
        setUploadingPhotos(false);
      }
    }

    // Obtener uid del admin actual
    const auth = getAuth();
    const adminUid = auth.currentUser?.uid || null;

    // Generar tokens de búsqueda para el tracking
    const { trackingNorm, trackingTokens } = buildTrackingTokens(trackingUpper);

    // Obtener cliente y generar tokens de búsqueda para el cliente
    const c = clientsById[form.clientId];
    const clientTokensRaw = buildClientTokens(c?.name, c?.code, c?.email ?? c?.emailAlt);
    const clientTokens = Array.isArray(clientTokensRaw) ? clientTokensRaw : [];

    // Crear inbound
    const payload: any = {
      tracking: trackingUpper,
      trackingNorm,
      trackingTokens,
      clientTokens,
      carrier: form.carrier,
      clientId: form.clientId,
      weightLb: weightLbVal,
      status: "received",
      receivedAt: Timestamp.now().toMillis(),
    };

    if (photoUrls.length > 0) {
      // Nuevo: guardar en photoUrls (array completo)
      payload.photoUrls = photoUrls;
      // Legacy: mantener photoUrl por compatibilidad (primera foto)
      payload.photoUrl = photoUrl;
    }

    if (managerUid) {
      payload.managerUid = managerUid;
    }

    const docRef = await addDoc(collection(db, "inboundPackages"), payload);

    // Actualizar alerta si existe
    if (alertDoc && alertData) {
      if (alertData.clientId === form.clientId) {
        // Resolver alerta (mismo cliente)
        await updateDoc(alertDoc.ref, {
          status: "resolved",
          resolvedAt: Date.now(),
          resolvedByUid: adminUid,
          assignedClientId: form.clientId,
        });
      } else {
        // Ignorar alerta (cliente diferente, pero admin confirmó)
        await updateDoc(alertDoc.ref, {
          status: "ignored",
          ignoredAt: Date.now(),
          ignoredByUid: adminUid,
          assignedClientId: form.clientId,
        });
      }
    }

    setRows([{ id: docRef.id, tracking: trackingUpper, carrier: form.carrier, clientId: form.clientId, weightLb: weightLbVal, photoUrl, photoUrls: photoUrls.length > 0 ? photoUrls : undefined, receivedAt: Date.now(), status: "received" }, ...rows]);
    
    // Limpiar formulario y fotos
    setForm({ tracking: "", carrier: form.carrier, clientId: form.clientId, weightLb: 0, weightKg: 0 });
    
    // Limpiar fotos: revocar ObjectURLs y resetear estados
    selectedPhotoPreviews.forEach((preview) => {
      URL.revokeObjectURL(preview);
    });
    setSelectedPhotos([]);
    setSelectedPhotoPreviews([]);
    setPhotoError(null);
    
    return true;
  }, [form.carrier, form.clientId, selectedPhotos, selectedPhotoPreviews, rows, computeWeightLb, clientsById]);

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
    <main className="min-h-screen bg-[#02120f] text-white p-4 md:p-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">Ingreso de paquetes</h1>
        {!roleResolved ? (
          <div className="p-3 rounded border border-white/10 bg-white/5 text-sm text-white/70">Cargando permisos…</div>
        ) : null}
        {roleResolved && !isStaff ? (
          <div className="p-3 rounded border border-red-400/40 bg-red-900/20 text-sm text-red-200">Sin permisos para acceder a Ingreso de paquetes.</div>
        ) : null}
        {errMsg && roleResolved && isStaff ? (
          <div className="p-3 rounded border border-red-400 bg-red-900/30 text-sm text-red-300">{errMsg}</div>
        ) : null}

        {roleResolved && isStaff ? (
          <>
        <section className="flex flex-col gap-4 rounded-xl bg-white/5 border border-[#1f3f36] backdrop-blur-sm p-5">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* BUSCAR CLIENTE + SELECT */}
          {/* removed client search and filter UI */}

          {/* CLIENTE SELECT + TRACKING */}
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-white/60">Cliente</label>
              <div
                className="relative mt-1 w-full"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    setClientPickerOpen(false);
                  }
                }}
              >
                <div className="flex w-full rounded-md border border-[#1f3f36] bg-[#0f2a22] shadow-sm focus-within:ring-2 focus-within:ring-[#005f40] focus-within:border-[#005f40]">
                  <input
                    className="h-11 flex-1 border-0 px-3 !bg-[#0f2a22] !text-white caret-white placeholder:text-white/40 focus:outline-none appearance-none"
                    placeholder="Escribir para buscar (código o nombre)"
                    value={clientQuery}
                    onChange={(e) => setClientQuery(e.target.value)}
                    onFocus={() => setClientPickerOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const first = filteredClients[0];
                        if (first?.id) setForm((f) => ({ ...f, clientId: String(first.id) }));
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="h-11 w-[220px] border-0 border-l border-[#1f3f36] bg-transparent px-3 text-sm text-white/90 focus:outline-none flex items-center justify-between"
                    onClick={() => setClientPickerOpen((v) => !v)}
                    aria-haspopup="listbox"
                    aria-expanded={clientPickerOpen}
                  >
                    <span className="truncate text-left">
                      {(() => {
                        const sel = (filteredClients || []).find((c: any) => c.id === form.clientId) || (clients || []).find((c: any) => c.id === form.clientId);
                        return sel ? `${sel.code} ${sel.name}` : "Seleccionar…";
                      })()}
                    </span>
                    <span className="ml-2 text-[#005f40]">▾</span>
                  </button>
                </div>
                {clientPickerOpen && (
                  <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-auto rounded-md bg-[#071f19] py-1 text-sm shadow-lg ring-1 ring-white/10">
                    {(filteredClients || []).length === 0 ? (
                      <div className="px-3 py-2 text-white/40">Sin resultados…</div>
                    ) : (
                      (filteredClients || []).map((c: any) => (
                        <button
                          key={c.id}
                          type="button"
                          className={
                            "block w-full px-3 py-2 text-left text-white/90 hover:bg-white/5 " +
                            (form.clientId === c.id ? "bg-[#005f4015] text-[#005f40] font-medium" : "")
                          }
                          onClick={() => {
                            setForm((f: any) => ({ ...f, clientId: c.id }));
                            setClientPickerOpen(false);
                          }}
                        >
                          <span className="font-medium">{c.code}</span>
                          <span className="text-white/60"> {c.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <p className="mt-1 text-[11px] text-white/40">Mostrando {filteredClients.length} de {clients.length}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-white/60">Ingreso de tracking</label>
              <input
                className="h-11 w-full rounded-md border border-[#1f3f36] !bg-[#0f2a22] px-4 !text-white caret-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#005f40]"
                placeholder="Escanear o escribir tracking"
                value={form.tracking}
                onChange={(e) => setForm((f) => ({ ...f, tracking: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-white/60">Carrier</label>
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
            <div className="rounded-lg border border-[#1f3f36] overflow-hidden">
              <div className="p-4 bg-[#0f2a22]">
                <input
                  className="w-full text-center text-3xl md:text-4xl font-semibold outline-none !bg-transparent !text-white caret-white placeholder:text-white/40"
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

            <div className="hidden md:grid place-items-center text-3xl font-bold select-none text-white/60">=</div>

            {/* Kilogramo */}
            <div className="rounded-lg border border-[#1f3f36] overflow-hidden">
              <div className="p-4 bg-[#0f2a22]">
                <input
                  className="w-full text-center text-3xl md:text-4xl font-semibold outline-none !bg-transparent !text-white caret-white placeholder:text-white/40"
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
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => (photoActive ? stopPhoto() : startPhoto())}
              className={btnSecondaryCls}
            >
              {photoActive ? "Cerrar cámara" : "Tomar foto"}
            </button>
            <button
              type="button"
              onClick={async () => { await capturePhoto(); }}
              disabled={!photoActive || selectedPhotos.length >= MAX_PHOTOS}
              className={btnPrimaryCls}
            >
              Capturar
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={selectedPhotos.length >= MAX_PHOTOS}
              className={btnSecondaryCls}
            >
              Agregar foto{selectedPhotos.length > 0 ? ` (${selectedPhotos.length}/${MAX_PHOTOS})` : ""}
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
            
            {/* Miniaturas de fotos */}
            {selectedPhotoPreviews.length > 0 && (
              <div className="w-full mt-2 flex flex-wrap gap-2 justify-center">
                {selectedPhotoPreviews.map((preview, index) => (
                  <div key={index} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={preview}
                      alt={`Preview ${index + 1}`}
                      className="h-16 w-16 object-cover rounded-md border border-[#1f3f36]"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-600 text-white text-xs font-bold hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 flex items-center justify-center"
                      aria-label={`Eliminar foto ${index + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {selectedPhotos.length === MAX_PHOTOS && (
                  <div className="w-full text-xs text-white/60 text-center mt-1">
                    Máximo {MAX_PHOTOS} fotos permitidas
                  </div>
                )}
              </div>
            )}
            
            {/* Mensaje de error */}
            {photoError && (
              <div className="w-full text-xs text-red-400 text-center mt-1">
                {photoError}
              </div>
            )}
            {photoActive ? (
              <div className="mt-2">
                <video ref={videoRefPhoto} className="w-full rounded-md border border-[#1f3f36]" autoPlay muted playsInline />
              </div>
            ) : null}
          </div>

          {/* BOTÓN GUARDAR */}
          <div className="mt-4 flex justify-center">
            <button disabled={saving} className={btnPrimaryCls}>
              {saving ? 'Guardando…' : 'Enviar'}
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="font-medium mb-2 text-white">Hoy</h2>
        <div className="grid gap-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="border border-[#1f3f36] rounded-lg bg-white/5 p-3 flex items-center gap-3 cursor-pointer hover:bg-white/10 transition"
              onClick={() => setSelectedInbound(r)}
            >
              {(() => {
                const photoUrls = getPhotoUrls(r);
                const primaryPhoto = photoUrls[0];
                const extraCount = photoUrls.length - 1;
                
                if (!primaryPhoto) {
                  return <div className="w-16 h-16 bg-white/5 rounded border border-[#1f3f36]" />;
                }
                
                return (
                  <div className="flex items-center gap-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={primaryPhoto}
                      alt=""
                      className="w-16 h-16 object-cover rounded border border-[#1f3f36]"
                    />
                    {extraCount > 0 && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded bg-emerald-600 text-white cursor-pointer hover:bg-emerald-700 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setGallery({ photoUrls, tracking: r.tracking, initialIndex: 0 });
                        }}
                      >
                        +{extraCount}
                      </span>
                    )}
                  </div>
                );
              })()}
              <div className="flex-1">
                <div className="text-sm text-white">
                  #{r.tracking} · {r.carrier} · {r.weightLb} lb
                </div>
                <div className="text-xs text-white/60">
                  Cliente: {clientsById[r.clientId]?.code ? `${clientsById[r.clientId]?.code} ${clientsById[r.clientId]?.name}` : r.clientId}
                </div>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-emerald-600 text-white">
                {r.status}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Modal de detalle de inbound */}
      {selectedInbound && (
        <InboundDetailModal
          inbound={selectedInbound}
          clientLabel={clientsById[selectedInbound.clientId]?.code 
            ? `${clientsById[selectedInbound.clientId]?.code} ${clientsById[selectedInbound.clientId]?.name}`
            : selectedInbound.clientId}
          clients={clients}
          onClose={() => setSelectedInbound(null)}
          onSave={async (updates) => {
            await handleInboundSave(selectedInbound.id, updates);
            setSelectedInbound(null);
          }}
        />
      )}

      {/* Modal de galería de fotos */}
      {gallery && (
        <PhotoGalleryModal
          photoUrls={gallery.photoUrls}
          initialIndex={gallery.initialIndex}
          tracking={gallery.tracking}
          onClose={() => setGallery(null)}
        />
      )}
          </>
        ) : null}
      </div>
    </main>
  );
}

// Modal de detalle de inbound
function InboundDetailModal({
  inbound,
  clientLabel,
  clients,
  onClose,
  onSave,
  onOpenGallery,
}: {
  inbound: InboundRow;
  clientLabel: string;
  clients: Client[];
  onClose: () => void;
  onSave?: (updates: { carrier: Carrier; weightLb: number; clientId: string }) => Promise<void>;
  onOpenGallery?: (photoUrls: string[], tracking?: string) => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [onClose]);

  // Estados para edición (solo si onSave existe)
  const [formCarrier, setFormCarrier] = useState<Carrier>(inbound.carrier);
  const [formWeightLb, setFormWeightLb] = useState<number>(inbound.weightLb);
  const [formClientId, setFormClientId] = useState<string>(inbound.clientId);
  const [saving, setSaving] = useState(false);

  // Inicializar estados cuando cambia inbound
  useEffect(() => {
    setFormCarrier(inbound.carrier);
    setFormWeightLb(inbound.weightLb);
    setFormClientId(inbound.clientId);
  }, [inbound]);

  // Peso en kg calculado
  const weightKg = useMemo(() => {
    return Number((formWeightLb * LB_TO_KG).toFixed(2));
  }, [formWeightLb]);

  // Cliente actual (para mostrar)
  const currentClientLabel = useMemo(() => {
    if (onSave) {
      const clientId = formClientId;
      const client = clients.find((c) => c.id === clientId);
      return client ? `${client.code} ${client.name}` : clientId;
    }
    return clientLabel;
  }, [formClientId, clients, onSave, clientLabel]);

  async function handleSave() {
    if (!onSave) return;

    // Validaciones
    if (formWeightLb <= 0) {
      alert("El peso debe ser mayor a 0");
      return;
    }
    if (!formClientId || !formClientId.trim()) {
      alert("Debe seleccionarse un cliente");
      return;
    }

    setSaving(true);
    try {
      await onSave({
        carrier: formCarrier,
        weightLb: formWeightLb,
        clientId: formClientId,
      });
    } catch (error) {
      console.error("Error al guardar:", error);
      alert("Error al guardar los cambios");
    } finally {
      setSaving(false);
    }
  }

  const btnSecondaryCls = "inline-flex items-center justify-center h-10 px-4 rounded-md border border-[#1f3f36] bg-white/5 text-white/90 font-medium hover:bg-white/10 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed";
  const INPUT_BG_STYLE = {
    backgroundColor: "#0f2a22",
    WebkitBoxShadow: "0 0 0px 1000px #0f2a22 inset",
    WebkitTextFillColor: "#ffffff",
  } as const;
  const inputCls = "h-10 w-full rounded-md border border-[#1f3f36] bg-[#0f2a22] px-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#005f40]";

  const receivedDate = inbound.receivedAt 
    ? new Date(inbound.receivedAt).toLocaleString("es-ES", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4">
      <div className="w-[95vw] max-w-3xl max-h-[90vh] rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm shadow-xl p-4 md:p-6 text-white overflow-y-auto">
        <div className="flex flex-col gap-4 mb-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-semibold text-white">
              TRACKING: {inbound.tracking}
            </h3>
            <div className="flex items-center gap-2">
              {onSave && (
                <button
                  onClick={handleSave}
                  disabled={saving || formWeightLb <= 0 || !formClientId || !formClientId.trim()}
                  className="inline-flex items-center justify-center h-10 px-4 rounded-md bg-[#eb6619] text-white font-medium shadow hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619]"
                >
                  {saving ? "Guardando…" : "Guardar cambios"}
                </button>
              )}
              <Link
                href={`/admin/trackings/${inbound.id}`}
                className="inline-flex items-center justify-center h-10 px-4 rounded-md bg-[#eb6619] text-white font-medium shadow hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619]"
                onClick={() => onClose()}
              >
                Editar
              </Link>
              <button className={btnSecondaryCls} onClick={onClose}>
                Cerrar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-white/60">Carrier</label>
              {onSave ? (
                <BrandSelect
                  value={formCarrier}
                  onChange={(val) => setFormCarrier(val as Carrier)}
                  options={carriers.map((c) => ({ value: c, label: c }))}
                  placeholder="Seleccionar carrier"
                />
              ) : (
                <div className="mt-1 text-sm text-white">{inbound.carrier}</div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-white/60">Peso</label>
              {onSave ? (
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <input
                    className={inputCls}
                    style={INPUT_BG_STYLE}
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={formWeightLb}
                    onChange={(e) => setFormWeightLb(Number(e.target.value || 0))}
                    placeholder="0.00"
                  />
                  <input
                    className={inputCls}
                    style={INPUT_BG_STYLE}
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={weightKg}
                    onChange={(e) => {
                      const v = Number(e.target.value || 0);
                      const lb = Number((v / LB_TO_KG).toFixed(2));
                      setFormWeightLb(lb);
                    }}
                    placeholder="0.00"
                  />
                </div>
              ) : (
                <div className="mt-1 text-sm text-white">{fmtWeightPairFromLb(inbound.weightLb)}</div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-white/60">Cliente</label>
              {onSave ? (
                <BrandSelect
                  value={formClientId}
                  onChange={(val) => setFormClientId(val)}
                  options={clients
                    .filter((c) => Boolean(c.id))
                    .map((c) => ({ value: String(c.id), label: `${c.code} ${c.name}` }))}
                  placeholder="Seleccionar cliente"
                />
              ) : (
                <div className="mt-1 text-sm text-white">{currentClientLabel}</div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-white/60">Estado</label>
              <div className="mt-1">
                <span className="text-xs px-2 py-1 rounded bg-emerald-600 text-white">
                  {inbound.status}
                </span>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-white/60">Fecha recibido</label>
              <div className="mt-1 text-sm text-white">{receivedDate}</div>
            </div>
          </div>

          {(() => {
            const photoUrls = getPhotoUrls(inbound);
            const primaryPhoto = photoUrls[0];
            const extraCount = photoUrls.length - 1;
            
            if (!primaryPhoto) {
              return null;
            }
            
            return (
              <div>
                <label className="text-xs font-medium text-white/60 mb-2 block">
                  Foto{extraCount > 0 ? ` (${photoUrls.length})` : ""}
                </label>
                <div className="relative">
                  <a
                    href={primaryPhoto}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={primaryPhoto}
                      alt={`Foto del tracking ${inbound.tracking}`}
                      className="w-full max-h-96 object-contain rounded-md border border-[#1f3f36] bg-[#071f19] ring-1 ring-white/10"
                    />
                  </a>
                  {extraCount > 0 && onOpenGallery && (
                    <button
                      onClick={() => onOpenGallery(photoUrls, inbound.tracking)}
                      className="absolute top-2 right-2 px-2 py-1 rounded bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-[#005f40] transition-colors"
                    >
                      Ver todas ({photoUrls.length})
                    </button>
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  <a href={primaryPhoto} target="_blank" rel="noopener noreferrer" className="text-xs text-white/60 hover:text-white">
                    Abrir en nueva pestaña
                  </a>
                  {extraCount > 0 && onOpenGallery && (
                    <button
                      onClick={() => onOpenGallery(photoUrls, inbound.tracking)}
                      className="text-xs text-white/60 hover:text-white"
                    >
                      Ver galería ({photoUrls.length} fotos)
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}