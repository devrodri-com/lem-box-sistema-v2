// src/app/mi/envios/page.tsx
"use client";

import { useEffect, useState } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import StatusBadge from "@/components/ui/StatusBadge";
import { useMiContext } from "../layout";

export default function MiEnviosPage() {
  const { clientId } = useMiContext();
  const [shipments, setShipments] = useState<any[]>([]);
  const [boxesByShipment, setBoxesByShipment] = useState<Record<string, any[]>>({});

  useEffect(() => {
    if (clientId) {
      loadShipments(clientId);
    }
  }, [clientId]);

  async function loadShipments(cid: string) {
    const qb = query(collection(db, "boxes"), where("clientId", "==", cid));
    const sb = await getDocs(qb);
    const bs = sb.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const byShipment: Record<string, any[]> = {};
    for (const b of bs) {
      const sid = b.shipmentId;
      if (!sid) continue;
      (byShipment[sid] ||= []).push(b);
    }
    // Sort boxes by code for stable display
    for (const sid of Object.keys(byShipment)) {
      byShipment[sid].sort((a: any, b: any) => String(a.code || "").localeCompare(String(b.code || "")));
    }
    setBoxesByShipment(byShipment);
    const shipmentIds = Array.from(
      new Set(bs.map((b) => b.shipmentId).filter((x: string | null | undefined) => !!x))
    ) as string[];
    const ss: any[] = [];
    for (const sid of shipmentIds) {
      try {
        const snap = await getDoc(doc(db, "shipments", sid));
        if (snap.exists()) ss.push({ id: sid, ...(snap.data() as any) });
      } catch (e) {
        // Permisos insuficientes en embarques antiguos sin clientIds: omitir
        continue;
      }
    }
    setShipments(ss);
  }

  return (
    <section className="space-y-3">
      <div className="overflow-x-auto border rounded">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-neutral-50 shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)]">
            <tr>
              <th className="text-left p-2">Embarque</th>
              <th className="text-left p-2">País/Tipo</th>
              <th className="text-left p-2">Cajas</th>
              <th className="text-left p-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {shipments.map((s) => (
              <tr key={s.id} className="border-t odd:bg-white even:bg-neutral-50 hover:bg-slate-50 h-11">
                <td className="p-2 font-mono">{s.code}</td>
                <td className="p-2">
                  {s.country} / {s.type}
                </td>
                <td className="p-2">
                  {Array.isArray(boxesByShipment[s.id]) && boxesByShipment[s.id].length ? (
                    <div className="flex flex-wrap gap-1">
                      {boxesByShipment[s.id].map((b) => (
                        <span
                          key={b.id}
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-white/60"
                        >
                          {b.code}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-neutral-500">-</span>
                  )}
                </td>
                <td className="p-2">
                  {s.status === "open" ? (
                    <StatusBadge scope="shipment" status="open" />
                  ) : s.status === "shipped" ? (
                    <StatusBadge scope="shipment" status="shipped" />
                  ) : s.status === "arrived" ? (
                    <StatusBadge scope="shipment" status="arrived" />
                  ) : (
                    <StatusBadge scope="shipment" status="closed" />
                  )}
                </td>
              </tr>
            ))}
            {!shipments.length ? (
              <tr>
                <td colSpan={4} className="p-3 text-neutral-500">
                  Sin envíos.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
