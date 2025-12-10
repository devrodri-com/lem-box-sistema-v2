"use client";

import { useEffect, useState } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { fmtWeightPairFromLb } from "@/lib/weight";
import StatusBadge from "@/components/ui/StatusBadge";
import { useMiContext } from "../layout";

const btnSecondary =
  "inline-flex items-center justify-center h-10 px-4 rounded-md border border-slate-300 bg-white text-slate-800 font-medium shadow-sm hover:bg-slate-50 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed";

export default function MiCajasPage() {
  const { clientId } = useMiContext();
  const [boxes, setBoxes] = useState<any[]>([]);
  const [detailBox, setDetailBox] = useState<any | null>(null);
  const [detailItems, setDetailItems] = useState<any[]>([]);

  useEffect(() => {
    if (clientId) {
      loadBoxes(clientId);
    }
  }, [clientId]);

  async function loadBoxes(cid: string) {
    const qb = query(collection(db, "boxes"), where("clientId", "==", cid));
    const sb = await getDocs(qb);
    const bs = sb.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    setBoxes(bs);
  }

  async function openBoxDetail(b: any) {
    setDetailBox(b);
    const items: any[] = [];
    // cargar items por id (itemIds) si existen
    if (Array.isArray(b.itemIds) && b.itemIds.length) {
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
      <div className="overflow-x-auto border rounded">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-neutral-50 shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)]">
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
            {boxes.map((b) => (
              <tr key={b.id} className="border-t odd:bg-white even:bg-neutral-50 hover:bg-slate-50 h-11">
                <td className="p-2 font-mono">{b.code}</td>
                <td className="p-2">{b.country}</td>
                <td className="p-2">{b.type}</td>
                <td className="p-2 text-right tabular-nums">{b.itemIds?.length || 0}</td>
                <td className="p-2 text-right tabular-nums">{fmtWeightPairFromLb(Number(b.weightLb || 0))}</td>
                <td className="p-2">{b.status ? <StatusBadge scope="box" status={b.status} /> : "—"}</td>
                <td className="p-2">
                  <button className={btnSecondary} onClick={() => openBoxDetail(b)}>
                    Ver detalle
                  </button>
                </td>
              </tr>
            ))}
            {!boxes.length ? (
              <tr>
                <td colSpan={7} className="p-3 text-neutral-500">
                  Sin cajas.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {detailBox ? (
        <div className="fixed inset-0 z-40 bg-black/40 grid place-items-center p-4">
          <div className="bg-white w-full max-w-xl rounded-xl shadow-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Caja {detailBox.code}</h3>
              <button className={btnSecondary} onClick={() => setDetailBox(null)}>
                Cerrar
              </button>
            </div>
            <div className="overflow-x-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="text-left p-2">Tracking</th>
                    <th className="text-left p-2">Carrier</th>
                    <th className="text-right p-2">Peso</th>
                  </tr>
                </thead>
                <tbody>
                  {detailItems.map((i) => (
                    <tr key={i.id} className="border-t">
                      <td className="p-2 font-mono">{i.tracking}</td>
                      <td className="p-2">{i.carrier}</td>
                      <td className="p-2 text-right tabular-nums">{fmtWeightPairFromLb(Number(i.weightLb || 0))}</td>
                    </tr>
                  ))}
                  {!detailItems.length ? (
                    <tr>
                      <td colSpan={3} className="p-3 text-neutral-500">
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
    </section>
  );
}

