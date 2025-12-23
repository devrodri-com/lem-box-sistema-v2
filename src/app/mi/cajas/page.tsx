"use client";

import { useEffect, useState } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { fmtWeightPairFromLb } from "@/lib/weight";
import StatusBadge from "@/components/ui/StatusBadge";
import { useMiContext } from "../_context/MiContext";

const CONTROL_BORDER = "border-[#1f3f36]";
const btnSecondary =
  "inline-flex items-center justify-center h-10 px-4 rounded-md border border-[#1f3f36] bg-white/5 text-white/90 font-medium hover:bg-white/10 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed";
const inputCls =
  "h-10 w-full rounded-md border border-[#1f3f36] bg-[#0f2a22] px-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#005f40]";
const INPUT_BG_STYLE = {
  backgroundColor: "#0f2a22",
  WebkitBoxShadow: "0 0 0px 1000px #0f2a22 inset",
  WebkitTextFillColor: "#ffffff",
} as const;

type Box = {
  id: string;
  code: string;
  country?: string;
  type?: string;
  itemIds?: string[];
  weightLb?: number;
  weightOverrideLb?: number | null;
  status?: string;
};

export default function MiCajasPage() {
  const { clientId } = useMiContext();
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [detailBox, setDetailBox] = useState<Box | null>(null);
  const [detailItems, setDetailItems] = useState<any[]>([]);

  useEffect(() => {
    if (clientId) {
      loadBoxes(clientId);
    }
  }, [clientId]);

  async function loadBoxes(cid: string) {
    const qb = query(collection(db, "boxes"), where("clientId", "==", cid));
    const sb = await getDocs(qb);
    const bs = sb.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Box));
    setBoxes(bs);
  }

  async function openBoxDetail(b: Box) {
    setDetailBox(b);
    const items: any[] = [];
    // cargar items por id (itemIds) si existen (solo si no hay weightOverrideLb)
    if (b.weightOverrideLb == null && Array.isArray(b.itemIds) && b.itemIds.length) {
      const it = await Promise.all(
        b.itemIds.map(async (iid: string) => {
          const snap = await getDoc(doc(db, "inboundPackages", iid));
          return snap.exists() ? { id: iid, ...(snap.data() as any) } : null;
        })
      );
      for (const i of it) if (i) items.push(i);
    }
    setDetailItems(items);
  }

  return (
    <section className="space-y-3">
      <div className="overflow-x-auto rounded-md border border-[#1f3f36] bg-[#071f19] ring-1 ring-white/10">
        <table className="w-full text-sm">
          <thead className="bg-[#0f2a22] text-white/80 text-xs font-medium">
            <tr>
              <th className="text-left p-2">Caja</th>
              <th className="text-left p-2">País</th>
              <th className="text-left p-2">Tipo</th>
              <th className="text-right p-2">Items</th>
              <th className="text-right p-2">Peso</th>
              <th className="text-left p-2">Estado</th>
              <th className="text-left p-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {boxes.map((b) => {
              const effectiveLb = b.weightOverrideLb != null ? Number(b.weightOverrideLb) : Number(b.weightLb || 0);
              return (
                <tr key={b.id} className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10">
                  <td className="p-2 font-mono text-white">{b.code}</td>
                  <td className="p-2 text-white">{b.country}</td>
                  <td className="p-2 text-white">{b.type}</td>
                  <td className="p-2 text-right tabular-nums text-white">{b.itemIds?.length || 0}</td>
                  <td className="p-2 text-right tabular-nums text-white">{fmtWeightPairFromLb(effectiveLb)}</td>
                  <td className="p-2">{b.status ? <StatusBadge scope="box" status={b.status as "open" | "closed"} /> : " "}</td>
                  <td className="p-2">
                    <button className={btnSecondary} onClick={() => openBoxDetail(b)}>
                      Ver detalle
                    </button>
                  </td>
                </tr>
              );
            })}
            {!boxes.length ? (
              <tr>
                <td colSpan={7} className="p-3 text-white/40">
                  Sin cajas.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {detailBox ? (() => {
        const calculatedWeightLb = detailItems.reduce((acc, i) => acc + (Number(i.weightLb) || 0), 0);
        const effectiveLb = detailBox.weightOverrideLb != null ? Number(detailBox.weightOverrideLb) : calculatedWeightLb;
        const hasOverride = detailBox.weightOverrideLb != null;
        
        return (
          <div className="fixed inset-0 z-40 bg-black/40 grid place-items-center p-4">
            <div className="bg-[#071f19] border border-[#1f3f36] w-full max-w-xl rounded-xl shadow-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-white">Caja {detailBox.code}</h3>
                <button className={btnSecondary} onClick={() => setDetailBox(null)}>
                  Cerrar
                </button>
              </div>
              {!hasOverride && (
                <div className="overflow-x-auto rounded-md border border-[#1f3f36] bg-[#071f19] ring-1 ring-white/10 mb-3">
                  <table className="w-full text-sm">
                    <thead className="bg-[#0f2a22] text-white/80 text-xs font-medium">
                      <tr>
                        <th className="text-left p-2">Tracking</th>
                        <th className="text-left p-2">Carrier</th>
                        <th className="text-right p-2">Peso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailItems.map((i) => (
                        <tr key={i.id} className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10">
                          <td className="p-2 font-mono text-white">{i.tracking}</td>
                          <td className="p-2 text-white">{i.carrier}</td>
                          <td className="p-2 text-right tabular-nums text-white">{fmtWeightPairFromLb(Number(i.weightLb || 0))}</td>
                        </tr>
                      ))}
                      {!detailItems.length ? (
                        <tr>
                          <td colSpan={3} className="p-3 text-white/40">
                            Caja sin items.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="text-sm font-medium text-white">
                Peso total: {fmtWeightPairFromLb(effectiveLb)}
              </div>
            </div>
          </div>
        );
      })() : null}
    </section>
  );
}

