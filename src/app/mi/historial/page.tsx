"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, query, where, orderBy, getDocs, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { fmtWeightPairFromLb } from "@/lib/weight";
import StatusBadge from "@/components/ui/StatusBadge";
import { useMiContext } from "../layout";
import type { Client } from "@/types/lem";

const btnSecondary =
  "inline-flex items-center justify-center h-10 px-4 rounded-md border border-slate-300 bg-white text-slate-800 font-medium shadow-sm hover:bg-slate-50 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed";
const inputCls =
  "h-11 w-full rounded-md border border-slate-300 px-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#005f40]";
const btnPrimary =
  "inline-flex items-center justify-center h-10 px-4 rounded-md bg-[#eb6619] text-white font-medium shadow-md hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

export default function MiHistorialPage() {
  const { uid, clientId } = useMiContext();
  const [rows, setRows] = useState<any[]>([]);
  const [qTrack, setQTrack] = useState("");

  // Alertar tracking
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertTracking, setAlertTracking] = useState("");
  const [alertNote, setAlertNote] = useState("");
  const [alertSaving, setAlertSaving] = useState(false);

  useEffect(() => {
    if (clientId) {
      loadTrackings(clientId);
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

  const filteredRows = useMemo(() => {
    const q = qTrack.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => String(r.tracking || "").toLowerCase().includes(q));
  }, [rows, qTrack]);

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
      });
      setAlertTracking("");
      setAlertNote("");
      setAlertOpen(false);
    } finally {
      setAlertSaving(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="max-w-md w-full">
          <label className="text-xs text-neutral-600">Buscar tracking</label>
          <input
            className={inputCls}
            placeholder="Escribí el tracking"
            value={qTrack}
            onChange={(e) => setQTrack(e.target.value)}
          />
        </div>
        <button className={btnSecondary} onClick={() => setAlertOpen(true)}>
          Alertar tracking
        </button>
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
                    <a href={r.photoUrl} target="_blank" className="underline text-sky-700">
                      Ver
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {!filteredRows.length ? (
              <tr>
                <td colSpan={6} className="p-3 text-neutral-500">
                  Sin registros.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {alertOpen ? (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
          <div className="bg-white w-full max-w-md rounded-xl shadow-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">Alertar tracking</h3>
              <button className={btnSecondary} onClick={() => setAlertOpen(false)}>
                Cerrar
              </button>
            </div>
            <label className="grid gap-1">
              <span className="text-xs font-medium text-neutral-600">Tracking</span>
              <input
                className={inputCls}
                value={alertTracking}
                onChange={(e) => setAlertTracking(e.target.value)}
                placeholder="Ingresá el tracking esperado"
              />
            </label>
            <label className="grid gap-1 mt-2">
              <span className="text-xs font-medium text-neutral-600">Nota (opcional)</span>
              <input
                className={inputCls}
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
    </section>
  );
}

