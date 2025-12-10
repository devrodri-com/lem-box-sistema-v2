"use client";

import { useEffect, useState } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import StatusBadge from "@/components/ui/StatusBadge";
import { useMiContext } from "../layout";

export default function MiEnviosPage() {
  const { clientId } = useMiContext();
  const [shipments, setShipments] = useState<any[]>([]);

  useEffect(() => {
    if (clientId) {
      loadShipments(clientId);
    }
  }, [clientId]);

  async function loadShipments(cid: string) {
    const qb = query(collection(db, "boxes"), where("clientId", "==", cid));
    const sb = await getDocs(qb);
    const bs = sb.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
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
                <td colSpan={3} className="p-3 text-neutral-500">
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

