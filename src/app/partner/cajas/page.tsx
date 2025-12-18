// src/app/partner/cajas/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, query, where, getDocs, doc, getDoc, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { fmtWeightPairFromLb } from "@/lib/weight";
import StatusBadge from "@/components/ui/StatusBadge";
import { BrandSelect } from "@/components/ui/BrandSelect";
import { BoxDetailModal } from "@/components/boxes/BoxDetailModal";
import { useBoxDetailModal } from "@/components/boxes/useBoxDetailModal";
import { usePartnerContext } from "@/components/PartnerContext";
import type { Client, Box } from "@/types/lem";
import { chunk } from "@/lib/utils";

// Helpers para parse seguro de datos de Firestore
function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}
function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

const btnSecondary =
  "inline-flex items-center justify-center h-10 px-4 rounded-md border border-slate-300 bg-white text-slate-800 font-medium shadow-sm hover:bg-slate-50 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed";

export default function PartnerCajasPage() {
  const { scopedClientIds, effectiveRole, uid } = usePartnerContext();
  const [selectedClientId, setSelectedClientId] = useState<string>(""); // "" = "Todas mis cuentas"
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientMap, setClientMap] = useState<Record<string, { code: string; name: string }>>({});

  const clientOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [
      { value: "", label: "Todas mis cuentas" },
    ];
    for (const cid of scopedClientIds) {
      const c = clientMap[cid];
      if (!c) continue;
      const label = `${c.code || cid} ${c.name || ""}`.trim();
      opts.push({ value: cid, label });
    }
    return opts;
  }, [scopedClientIds, clientMap]);

  const clientsById = useMemo(() => {
    const m: Record<string, Client> = {};
    for (const cid of scopedClientIds) {
      const c = clientMap[cid];
      if (!c) continue;
      m[cid] = {
        id: cid,
        code: c.code || "",
        name: c.name || "",
        country: "",
      } as Client;
    }
    return m;
  }, [scopedClientIds, clientMap]);

  const { openBoxDetailByBoxId, modalProps } = useBoxDetailModal({
    boxes: boxes as Array<{ id: string; code: string; itemIds?: string[]; clientId: string; type?: "COMERCIAL" | "FRANQUICIA"; weightLb?: number; weightOverrideLb?: number | null; labelRef?: string; status?: "open" | "closed" | "shipped" | "delivered" }>,
    setBoxes: setBoxes as unknown as React.Dispatch<React.SetStateAction<Array<Record<string, unknown> & { id: string }>>>,
    // This page is read-only; we do not manage inbound rows here.
    setRows: (() => {}) as unknown as React.Dispatch<React.SetStateAction<Array<Record<string, unknown> & { id: string }>>>,
    clientsById,
    hideItemsWhenOverride: false, // Partner siempre ve items
  });

  // Cargar clientes para el dropdown
  useEffect(() => {
    if (scopedClientIds.length === 0) {
      setClientMap({});
      return;
    }

    async function loadClients() {
      const map: Record<string, { code: string; name: string }> = {};
      // Batch en chunks de 10 (Firestore limit para 'in' queries)
      const chunks = chunk(scopedClientIds, 10);
      
      for (const chunkIds of chunks) {
        try {
          // Usar documentId() in [...] requiere un índice compuesto, pero podemos hacer getDoc individual
          // Alternativa más simple: leer docs individuales
          const docs = await Promise.all(
            chunkIds.map((id) => getDoc(doc(db, "clients", id)))
          );
          
          docs.forEach((snap, idx) => {
            if (snap.exists() && idx < chunkIds.length) {
              const data = snap.data() as Omit<Client, "id">;
              const cid = chunkIds[idx];
              if (cid) {
                map[cid] = {
                  code: data.code || "",
                  name: data.name || "",
                };
              }
            }
          });
        } catch (err) {
          console.error("[PartnerCajas] Error loading clients chunk:", err);
        }
      }
      
      setClientMap(map);
    }

    void loadClients();
  }, [scopedClientIds]);

  // Cargar cajas según selección
  useEffect(() => {
    if (!uid || scopedClientIds.length === 0) {
      setBoxes([]);
      setLoading(false);
      return;
    }

    async function loadBoxes() {
      setLoading(true);
      try {
        let allBoxes: Box[] = [];

        if (selectedClientId) {
          // Cliente específico: filtrar por managerUid y luego por clientId
          const q = query(
            collection(db, "boxes"),
            where("managerUid", "==", uid),
            where("clientId", "==", selectedClientId)
          );
          const snap = await getDocs(q);
          allBoxes = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Box, "id">) } as Box));
        } else {
          // Todas las cuentas: query por managerUid
          const q = query(
            collection(db, "boxes"),
            where("managerUid", "==", uid)
          );
          const snap = await getDocs(q);
          allBoxes = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Box, "id">) } as Box));
        }

        // Ordenar: primero por createdAt (si existe), luego por code
        allBoxes.sort((a, b) => {
          const aTime = a.createdAt || 0;
          const bTime = b.createdAt || 0;
          if (aTime !== bTime) return bTime - aTime; // más reciente primero
          return (a.code || "").localeCompare(b.code || "");
        });

        setBoxes(allBoxes);

        // Logs temporales en dev
        if (process.env.NODE_ENV === "development") {
          console.log("[PartnerCajas] scopedClientIds.length:", scopedClientIds.length);
          console.log("[PartnerCajas] selectedClientId:", selectedClientId || "Todas");
          console.log("[PartnerCajas] cantidad de cajas cargadas:", allBoxes.length);
        }
      } catch (err) {
        console.error("[PartnerCajas] Error loading boxes:", err);
        setBoxes([]);
      } finally {
        setLoading(false);
      }
    }

    void loadBoxes();
  }, [uid, scopedClientIds, selectedClientId]);

  if (scopedClientIds.length === 0) {
    return (
      <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 space-y-4">
        <h2 className="text-xl font-semibold text-white">Cajas</h2>
        <div className="rounded-md border border-white/10 bg-white/5 p-4 text-center">
          <p className="text-sm text-white/60">No tenés clientes asociados.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Cajas</h2>
        <div className="flex items-center gap-2">
          <label className="text-sm text-white/60">Filtrar por cliente:</label>
          <div className="min-w-[260px]">
            <BrandSelect
              value={selectedClientId}
              onChange={(val) => setSelectedClientId(String(val))}
              options={clientOptions}
              placeholder="Todas mis cuentas"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-white/60">Cargando cajas…</div>
      ) : (
        <div className="overflow-x-auto border rounded border-white/10">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[#0f2a22] shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)]">
              <tr>
                <th className="text-left p-2 text-white/80 text-xs font-medium">Caja</th>
                <th className="text-left p-2 text-white/80 text-xs font-medium">Cliente</th>
                <th className="text-left p-2 text-white/80 text-xs font-medium">País</th>
                <th className="text-left p-2 text-white/80 text-xs font-medium">Tipo</th>
                <th className="text-right p-2 text-white/80 text-xs font-medium">Items</th>
                <th className="text-right p-2 text-white/80 text-xs font-medium">Peso</th>
                <th className="text-left p-2 text-white/80 text-xs font-medium">Estado</th>
                <th className="text-left p-2 text-white/80 text-xs font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {boxes.map((b) => {
                const effectiveLb = b.weightOverrideLb != null ? Number(b.weightOverrideLb) : Number(b.weightLb || 0);
                return (
                  <tr
                    key={b.id}
                    className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10 h-11"
                  >
                    <td className="p-2 font-mono text-white">{b.code}</td>
                    <td className="p-2 text-white">
                      {(() => {
                        const c = clientMap[b.clientId];
                        if (c) return `${c.code || b.clientId} ${c.name || ""}`.trim();
                        return b.clientId;
                      })()}
                    </td>
                    <td className="p-2 text-white">{(() => {
                      const rec = asRecord(b);
                      const country = rec ? asString(rec.country) : undefined;
                      return country || "-";
                    })()}</td>
                    <td className="p-2 text-white">{(() => {
                      const rec = asRecord(b);
                      const type = rec ? asString(rec.type) : undefined;
                      return type || "-";
                    })()}</td>
                    <td className="p-2 text-right tabular-nums text-white">{b.itemIds?.length || 0}</td>
                    <td className="p-2 text-right tabular-nums text-white">
                      {fmtWeightPairFromLb(effectiveLb)}
                    </td>
                    <td className="p-2">
                      {b.status === "open" || b.status === "closed" ? (
                        <StatusBadge scope="box" status={b.status} />
                      ) : (
                        <span className="text-white/60">{b.status || " "}</span>
                      )}
                    </td>
                    <td className="p-2">
                      <button
                        className="h-9 px-3 rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white/90 hover:bg-white/5 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => {
                          if (!b.id) return;
                          openBoxDetailByBoxId(b.id);
                        }}
                        disabled={!b.id}
                      >
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!boxes.length ? (
                <tr>
                  <td colSpan={8} className="p-3 text-white/60">
                    Sin cajas.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      <BoxDetailModal {...modalProps} />
    </div>
  );
}
