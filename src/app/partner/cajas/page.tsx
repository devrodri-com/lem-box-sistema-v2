// src/app/partner/cajas/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, query, where, getDocs, doc, getDoc, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { fmtWeightPairFromLb } from "@/lib/weight";
import StatusBadge from "@/components/ui/StatusBadge";
import { usePartnerContext } from "@/components/PartnerContext";
import type { Client, Box } from "@/types/lem";

const btnSecondary =
  "inline-flex items-center justify-center h-10 px-4 rounded-md border border-slate-300 bg-white text-slate-800 font-medium shadow-sm hover:bg-slate-50 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed";

// Helper para hacer chunks de arrays
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export default function PartnerCajasPage() {
  const { scopedClientIds, effectiveRole, uid } = usePartnerContext();
  const [selectedClientId, setSelectedClientId] = useState<string>(""); // "" = "Todas mis cuentas"
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientMap, setClientMap] = useState<Record<string, { code: string; name: string }>>({});
  const [detailBox, setDetailBox] = useState<Box | null>(null);
  const [detailItems, setDetailItems] = useState<Array<{ id: string; tracking: string; weightLb: number; photoUrl?: string }>>([]);

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
    if (scopedClientIds.length === 0) {
      setBoxes([]);
      setLoading(false);
      return;
    }

    async function loadBoxes() {
      setLoading(true);
      try {
        let allBoxes: Box[] = [];

        if (selectedClientId) {
          // Cliente específico
          const q = query(
            collection(db, "boxes"),
            where("clientId", "==", selectedClientId)
          );
          const snap = await getDocs(q);
          allBoxes = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Box, "id">) } as Box));
        } else {
          // Todas las cuentas: batch queries
          const chunks = chunk(scopedClientIds, 10);
          
          for (const chunkIds of chunks) {
            try {
              const q = query(
                collection(db, "boxes"),
                where("clientId", "in", chunkIds)
              );
              const snap = await getDocs(q);
              const chunkBoxes = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Box, "id">) } as Box));
              allBoxes.push(...chunkBoxes);
            } catch (err) {
              console.error("[PartnerCajas] Error loading boxes chunk:", err);
            }
          }
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
  }, [scopedClientIds, selectedClientId]);

  async function openBoxDetail(b: Box) {
    setDetailBox(b);
    const items: Array<{ id: string; tracking: string; weightLb: number; photoUrl?: string }> = [];
    // cargar items por id (itemIds) si existen
    if (Array.isArray(b.itemIds) && b.itemIds.length) {
      const it = await Promise.all(
        b.itemIds.map(async (iid: string) => {
          const snap = await getDoc(doc(db, "inboundPackages", iid));
          return snap.exists()
            ? {
                id: iid,
                tracking: (snap.data() as any).tracking || "",
                weightLb: (snap.data() as any).weightLb || 0,
                photoUrl: (snap.data() as any).photoUrl,
              }
            : null;
        })
      );
      for (const i of it) if (i) items.push(i);
    }
    setDetailItems(items);
  }

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
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="h-10 rounded-md border border-[#1f3f36] bg-[#0f2a22] px-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#005f40]"
          >
            <option value="">Todas mis cuentas</option>
            {scopedClientIds.map((cid) => {
              const client = clientMap[cid];
              if (!client) return null;
              return (
                <option key={cid} value={cid}>
                  {client.code} {client.name}
                </option>
              );
            })}
          </select>
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
                <th className="text-left p-2 text-white/80 text-xs font-medium">País</th>
                <th className="text-left p-2 text-white/80 text-xs font-medium">Tipo</th>
                <th className="text-right p-2 text-white/80 text-xs font-medium">Items</th>
                <th className="text-right p-2 text-white/80 text-xs font-medium">Peso</th>
                <th className="text-left p-2 text-white/80 text-xs font-medium">Estado</th>
                <th className="text-left p-2 text-white/80 text-xs font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {boxes.map((b) => (
                <tr
                  key={b.id}
                  className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10 h-11"
                >
                  <td className="p-2 font-mono text-white">{b.code}</td>
                  <td className="p-2 text-white">{(b as any).country || "-"}</td>
                  <td className="p-2 text-white">{(b as any).type || "-"}</td>
                  <td className="p-2 text-right tabular-nums text-white">{b.itemIds?.length || 0}</td>
                  <td className="p-2 text-right tabular-nums text-white">
                    {fmtWeightPairFromLb(Number(b.weightLb || 0))}
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
                      className="h-9 px-3 rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white/90 hover:bg-white/5 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40]"
                      onClick={() => openBoxDetail(b)}
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
              {!boxes.length ? (
                <tr>
                  <td colSpan={7} className="p-3 text-white/60">
                    Sin cajas.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {detailBox ? (
        <div className="fixed inset-0 z-40 bg-black/40 grid place-items-center p-4">
          <div className="bg-[#02120f] w-full max-w-xl rounded-xl shadow-xl border border-white/10 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-white">Caja {detailBox.code}</h3>
              <button
                className="h-9 px-3 rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white/90 hover:bg-white/5 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40]"
                onClick={() => setDetailBox(null)}
              >
                Cerrar
              </button>
            </div>
            <div className="overflow-x-auto border rounded border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-[#0f2a22]">
                  <tr>
                    <th className="text-left p-2 text-white/80 text-xs font-medium">Tracking</th>
                    <th className="text-left p-2 text-white/80 text-xs font-medium">Carrier</th>
                    <th className="text-right p-2 text-white/80 text-xs font-medium">Peso</th>
                  </tr>
                </thead>
                <tbody>
                  {detailItems.map((i) => {
                    const inboundData = i as any;
                    return (
                      <tr key={i.id} className="border-t border-white/10">
                        <td className="p-2 font-mono text-white">{i.tracking}</td>
                        <td className="p-2 text-white">{inboundData.carrier || "-"}</td>
                        <td className="p-2 text-right tabular-nums text-white">
                          {fmtWeightPairFromLb(Number(i.weightLb || 0))}
                        </td>
                      </tr>
                    );
                  })}
                  {!detailItems.length ? (
                    <tr>
                      <td colSpan={3} className="p-3 text-white/60">
                        Caja sin items.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
