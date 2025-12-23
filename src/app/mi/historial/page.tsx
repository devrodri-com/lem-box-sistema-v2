// src/app/mi/historial/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, query, where, orderBy, getDocs, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { fmtWeightPairFromLb } from "@/lib/weight";
import StatusBadge from "@/components/ui/StatusBadge";
import { BrandSelect } from "@/components/ui/BrandSelect";
import { useMiContext } from "../_context/MiContext";
import type { Client } from "@/types/lem";

const CONTROL_BORDER = "border-[#1f3f36]";
const btnSecondary =
  "inline-flex items-center justify-center h-10 px-4 rounded-md border border-[#1f3f36] bg-white/5 text-white/90 text-sm font-medium leading-tight text-center hover:bg-white/10 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed";
const inputCls =
  "h-10 w-full rounded-md border border-[#1f3f36] bg-[#0f2a22] px-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#005f40]";
const INPUT_BG_STYLE = {
  backgroundColor: "#0f2a22",
  WebkitBoxShadow: "0 0 0px 1000px #0f2a22 inset",
  WebkitTextFillColor: "#ffffff",
} as const;
const btnPrimary =
  "inline-flex items-center justify-center h-10 px-4 rounded-md bg-[#eb6619] text-white font-medium shadow-md hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

type StatusFilter = "all" | "alerted" | "received" | "boxed";

export default function MiHistorialPage() {
  const { uid, clientId } = useMiContext();
  const [rows, setRows] = useState<any[]>([]);
  const [qTrack, setQTrack] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [alertedTrackings, setAlertedTrackings] = useState<Set<string>>(new Set());
  const [myAlerts, setMyAlerts] = useState<any[]>([]);

  // Alertar tracking
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertTracking, setAlertTracking] = useState("");
  const [alertNote, setAlertNote] = useState("");
  const [alertSaving, setAlertSaving] = useState(false);

  useEffect(() => {
    if (clientId) {
      loadTrackings(clientId);
      loadAlerts(clientId);
    }
  }, [clientId]);

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

  async function loadAlerts(cid: string) {
    try {
      // Cargar alertas abiertas (status == "open" o sin status)
      const alertQuery = query(
        collection(db, "trackingAlerts"),
        where("clientId", "==", cid),
        where("status", "==", "open")
      );
      const alertSnap = await getDocs(alertQuery);
      const alerts = alertSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setMyAlerts(alerts);
      
      // Construir set de trackings alertados
      const alertSet = new Set<string>();
      alerts.forEach((a) => {
        if (a.tracking && typeof a.tracking === "string") {
          alertSet.add(a.tracking.toUpperCase());
        }
      });
      setAlertedTrackings(alertSet);
    } catch (e) {
      console.error("Error loading alerts:", e);
      setMyAlerts([]);
      setAlertedTrackings(new Set());
    }
  }

  const filteredRows = useMemo(() => {
    let filtered = rows;
    
    // Filtro por texto
    const q = qTrack.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter((r) => String(r.tracking || "").toLowerCase().includes(q));
    }
    
    // Filtro por estado
    if (statusFilter === 'received') {
      filtered = filtered.filter((r) => r.status === 'received');
    } else if (statusFilter === 'boxed') {
      filtered = filtered.filter((r) => r.status === 'boxed');
    } else if (statusFilter === 'alerted') {
      filtered = filtered.filter((r) => alertedTrackings.has(String(r.tracking || "").toUpperCase()));
    }
    
    return filtered;
  }, [rows, qTrack, statusFilter, alertedTrackings]);

  async function submitAlert() {
    if (!clientId || !uid || !alertTracking.trim()) return;
    setAlertSaving(true);
    try {
      // Leer el cliente para obtener managerUid
      let managerUid: string | null = null;
      try {
        const clientSnap = await getDoc(doc(db, "clients", clientId));
        if (clientSnap.exists()) {
          const clientData = clientSnap.data() as Omit<Client, "id">;
          managerUid = clientData.managerUid ?? null;
        }
      } catch (error) {
        console.error("Error al leer el cliente:", error);
        // Continuar sin managerUid si hay error
      }

      await addDoc(collection(db, "trackingAlerts"), {
        uid,
        clientId,
        tracking: alertTracking.trim().toUpperCase(),
        note: alertNote.trim() || "",
        createdAt: Date.now(),
        managerUid: managerUid,
        status: "open",
      });
      setAlertTracking("");
      setAlertNote("");
      setAlertOpen(false);
      // Recargar alertas después de crear una nueva
      if (clientId) {
        await loadAlerts(clientId);
      }
    } finally {
      setAlertSaving(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="max-w-md w-full">
          <label className="text-xs text-white/60">Buscar tracking</label>
          <input
            className={inputCls}
            style={INPUT_BG_STYLE}
            placeholder="Escribí el tracking"
            value={qTrack}
            onChange={(e) => setQTrack(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <div className="min-w-[220px]">
            <BrandSelect
              value={statusFilter}
              onChange={(val) => {
                if (val === "all" || val === "alerted" || val === "received" || val === "boxed") {
                  setStatusFilter(val);
                }
              }}
              options={[
                { value: "all", label: "Todos" },
                { value: "alerted", label: "Alertados" },
                { value: "received", label: "Recibidos" },
                { value: "boxed", label: "Consolidado" },
              ]}
              placeholder="Todos"
            />
          </div>
          <button className={btnSecondary} onClick={() => setAlertOpen(true)}>
            Alertar tracking
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-[#1f3f36] bg-[#071f19] ring-1 ring-white/10">
        <table className="w-full text-sm">
          <thead className="bg-[#0f2a22] text-white/80 text-xs font-medium">
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
              <tr key={r.id} className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10">
                <td className="p-2 text-white">{r.receivedAt ? new Date(r.receivedAt).toLocaleDateString() : " "}</td>
                <td className="p-2 font-mono text-white">{r.tracking}</td>
                <td className="p-2 text-white">{r.carrier}</td>
                <td className="p-2 text-right tabular-nums text-white">{fmtWeightPairFromLb(Number(r.weightLb || 0))}</td>
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    {r.status === "boxed" ? (
                      <StatusBadge scope="package" status="boxed" />
                    ) : (
                      <StatusBadge scope="package" status="received" />
                    )}
                    {alertedTrackings.has(String(r.tracking || "").toUpperCase()) && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/25 text-amber-100 ring-amber-400/60 border border-amber-400/60">
                        Alertado
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-2 text-white/80">
                  {r.photoUrl ? (
                    <a href={r.photoUrl} target="_blank" className="underline hover:text-white">
                      Ver
                    </a>
                  ) : (
                    " "
                  )}
                </td>
              </tr>
            ))}
            {!filteredRows.length ? (
              <tr>
                <td colSpan={6} className="p-3 text-white/40">
                  Sin registros.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {alertOpen ? (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
          <div className="bg-[#071f19] border border-[#1f3f36] w-full max-w-md rounded-xl shadow-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-white">Alertar tracking</h3>
              <button className={btnSecondary} onClick={() => setAlertOpen(false)}>
                Cerrar
              </button>
            </div>
            <label className="grid gap-1">
              <span className="text-xs font-medium text-white/60">Tracking</span>
              <input
                className={inputCls}
                style={INPUT_BG_STYLE}
                value={alertTracking}
                onChange={(e) => setAlertTracking(e.target.value)}
                placeholder="Ingresá el tracking esperado"
              />
            </label>
            <label className="grid gap-1 mt-2">
              <span className="text-xs font-medium text-white/60">Nota (opcional)</span>
              <input
                className={inputCls}
                style={INPUT_BG_STYLE}
                value={alertNote}
                onChange={(e) => setAlertNote(e.target.value)}
                placeholder="Ej: proveedor / compra #"
              />
            </label>
            <div className="flex justify-end gap-2 mt-4">
              <button className={btnSecondary} onClick={() => setAlertOpen(false)}>
                Cancelar
              </button>
              <button
                className={btnPrimary}
                onClick={submitAlert}
                disabled={alertSaving || !alertTracking.trim()}
              >
                {alertSaving ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Sección "Mis alertas" */}
      {myAlerts.length > 0 && (
        <div className="mt-6 space-y-2">
          <h2 className="text-lg font-semibold text-white">Mis alertas</h2>
          <div className="overflow-x-auto rounded-md border border-[#1f3f36] bg-[#071f19] ring-1 ring-white/10">
            <table className="w-full text-sm">
              <thead className="bg-[#0f2a22] text-white/80 text-xs font-medium">
                <tr>
                  <th className="text-left p-2">Tracking</th>
                  <th className="text-left p-2">Nota</th>
                  <th className="text-left p-2">Fecha</th>
                  <th className="text-left p-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {myAlerts.map((alert) => (
                  <tr key={alert.id} className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10">
                    <td className="p-2 font-mono text-white">{alert.tracking}</td>
                    <td className="p-2 text-white/80">{alert.note || "-"}</td>
                    <td className="p-2 text-white/80">
                      {alert.createdAt ? new Date(alert.createdAt).toLocaleDateString() : "-"}
                    </td>
                    <td className="p-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/25 text-amber-100 ring-amber-400/60 border border-amber-400/60">
                        {alert.status === "open" ? "Abierta" : alert.status || "Abierta"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

