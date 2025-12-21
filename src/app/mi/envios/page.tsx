// src/app/mi/envios/page.tsx
"use client";

import { useEffect, useState } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import StatusBadge from "@/components/ui/StatusBadge";
import { useMiContext } from "../layout";

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
      <div className="overflow-x-auto rounded-md border border-[#1f3f36] bg-[#071f19] ring-1 ring-white/10">
        <table className="w-full text-sm">
          <thead className="bg-[#0f2a22] text-white/80 text-xs font-medium">
            <tr>
              <th className="text-left p-2">Embarque</th>
              <th className="text-left p-2">País/Tipo</th>
              <th className="text-left p-2">Cajas</th>
              <th className="text-left p-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {shipments.map((s) => (
              <tr key={s.id} className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10">
                <td className="p-2 font-mono text-white">{s.code}</td>
                <td className="p-2 text-white">
                  {s.country} / {s.type}
                </td>
                <td className="p-2">
                  {Array.isArray(boxesByShipment[s.id]) && boxesByShipment[s.id].length ? (
                    <div className="flex flex-wrap gap-1">
                      {boxesByShipment[s.id].map((b) => (
                        <span
                          key={b.id}
                          className="inline-flex items-center rounded-full border border-white/20 px-2 py-0.5 text-xs bg-white/10 text-white/80"
                        >
                          {b.code}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-white/40">-</span>
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
                <td colSpan={4} className="p-3 text-white/40">
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
