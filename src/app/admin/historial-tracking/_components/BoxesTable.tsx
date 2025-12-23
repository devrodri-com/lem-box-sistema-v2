// src/app/admin/historial-tracking/_components/BoxesTable.tsx
"use client";

import StatusBadge from "@/components/ui/StatusBadge";
import { fmtWeightPairFromLb } from "@/lib/weight";
import type { Client } from "@/types/lem";

type Box = {
  id: string;
  code: string;
  itemIds: string[];
  clientId: string;
  country?: string;
  type?: "COMERCIAL" | "FRANQUICIA";
  weightLb?: number;
  labelRef?: string;
  shipmentId?: string | null;
};

interface BoxesTableProps {
  boxes: Box[];
  clientsById: Record<string, Client>;
  onOpenBox: (boxId: string) => void;
  emptyText?: string;
}

export function BoxesTable({
  boxes,
  clientsById,
  onOpenBox,
  emptyText = "Sin cajas.",
}: BoxesTableProps) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-white/5 text-white/80">
        <tr>
          <th className="text-left p-2">Caja</th>
          <th className="text-left p-2">Cliente</th>
          <th className="text-left p-2">Tipo</th>
          <th className="text-left p-2">Items</th>
          <th className="text-left p-2">Peso</th>
          <th className="text-left p-2">Estado</th>
          <th className="text-left p-2">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {boxes.map((b) => {
          const c = clientsById[b.clientId];
          const cliente = c?.code ? `${c.code} ${c.name}` : b.clientId;
          return (
            <tr key={b.id} className="border-t border-white/10">
              <td className="p-2">
                <button
                  className="underline text-sm text-white/80 hover:text-white"
                  onClick={() => onOpenBox(b.id)}
                >
                  {b.code}
                </button>
              </td>
              <td className="p-2">{cliente}</td>
              <td className="p-2">
                {b.type === "FRANQUICIA" ? "Franquicia" : "Comercial"}
              </td>
              <td className="p-2">{b.itemIds?.length || 0}</td>
              <td className="p-2 whitespace-nowrap">{fmtWeightPairFromLb(Number(b.weightLb || 0))}</td>
              <td className="p-2">
                <StatusBadge scope="package" status="boxed" />
              </td>
              <td className="p-2">
                <button
                  className="inline-flex items-center justify-center rounded-md border border-[#1f3f36] bg-white/5 px-3 py-1.5 text-white/90 hover:bg-white/10"
                  onClick={() => onOpenBox(b.id)}
                >
                  Ver
                </button>
              </td>
            </tr>
          );
        })}
        {!boxes.length ? (
          <tr>
            <td className="p-3 text-white/40" colSpan={7}>
              {emptyText}
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

