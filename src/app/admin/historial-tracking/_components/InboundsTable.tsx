// src/app/admin/historial-tracking/_components/InboundsTable.tsx
"use client";

import StatusBadge from "@/components/ui/StatusBadge";
import { fmtWeightPairFromLb } from "@/lib/weight";
import { IconPhoto, IconTrash } from "@/components/ui/icons";
import type { Carrier, Client, Shipment } from "@/types/lem";
import { getPhotoUrls } from "@/lib/inboundPhotos";

type Inbound = {
  id: string;
  tracking: string;
  carrier: Carrier;
  clientId: string;
  weightLb: number;
  status: "received" | "boxed" | "void";
  photoUrl?: string;
  receivedAt?: number;
};

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

type InboundsTableProps = {
  rows: Inbound[];
  clientsById: Record<string, Client>;
  boxByInbound: Record<string, Box>;
  shipmentsById: Record<string, Shipment>;
  alertedTrackings: Set<string>;
  openAlerts: Array<{ id: string; tracking: string; clientId: string; createdAt?: number; note?: string }>;
  isStaff: boolean;
  statusFilter: 'all' | 'alerted' | 'received' | 'boxed';
  onOpenBox: (inboundId: string) => void;
  onDelete: (row: Inbound) => void;
  onOpenGallery?: (photoUrls: string[], tracking?: string) => void;
};

export function InboundsTable({
  rows,
  clientsById,
  boxByInbound,
  shipmentsById,
  alertedTrackings,
  openAlerts,
  isStaff,
  statusFilter,
  onOpenBox,
  onDelete,
  onOpenGallery,
}: InboundsTableProps) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-white/5 text-white/80">
        <tr>
          <th className="text-left p-2">Fecha</th>
          <th className="text-left p-2">Cliente</th>
          <th className="text-left p-2">Tracking</th>
          <th className="text-left p-2">Carrier</th>
          <th className="text-left p-2">Peso</th>
          <th className="text-left p-2">Caja</th>
          <th className="text-left p-2">Estado</th>
          <th className="text-left p-2">Foto</th>
          <th className="text-left p-2">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {(() => {
          // Para filtro "alerted": mostrar inboundPackages alertados + alertas sin inboundPackage
          if (statusFilter === "alerted") {
            const rowTrackings = new Set(rows.map((r) => String(r.tracking || "").toUpperCase()));
            const inboundRows = rows.filter((r) => alertedTrackings.has(String(r.tracking || "").toUpperCase()));
            const alertOnlyRows = openAlerts.filter((alert) => !rowTrackings.has(alert.tracking));
            
            return (
              <>
                {/* InboundPackages alertados */}
                {inboundRows.map((r) => {
                  const c = clientsById[r.clientId];
                  const cliente = c?.code
                    ? `${c.code} ${c.name}`
                    : r.clientId;
                  return (
                    <tr key={r.id} className="border-t border-white/10">
                      <td className="p-2">
                        {r.receivedAt
                          ? new Date(r.receivedAt).toLocaleDateString()
                          : "-"}
                      </td>
                      <td className="p-2">{cliente}</td>
                      <td className="p-2 font-mono text-sm">
                        <a
                          className="underline text-white/80 hover:text-white"
                          href={`/admin/trackings/${r.id}`}
                        >
                          {r.tracking}
                        </a>
                      </td>
                      <td className="p-2">{r.carrier}</td>
                      <td className="p-2 whitespace-nowrap">
                        {fmtWeightPairFromLb(Number(r.weightLb || 0))}
                      </td>
                      <td className="p-2">
                        {boxByInbound[r.id]?.code ? (
                          <button
                            className="underline text-sm text-white/80 hover:text-white"
                            onClick={() => onOpenBox(r.id)}
                          >
                            {boxByInbound[r.id]?.code}
                          </button>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {(() => {
                            const box = boxByInbound[r.id];
                            const sid = box?.shipmentId;
                            const sh = sid ? shipmentsById[sid] : undefined;
                            const shipStatus = sh?.status;

                            if (r.status === "received") {
                              return (
                                <>
                                  <StatusBadge scope="package" status="received" />
                                </>
                              );
                            }

                            if (r.status === "boxed") {
                              if (shipStatus === "shipped") {
                                return (
                                  <>
                                    <StatusBadge scope="shipment" status="shipped" />
                                  </>
                                );
                              }
                              if (shipStatus === "arrived" || shipStatus === "closed") {
                                return (
                                  <>
                                    <StatusBadge scope="shipment" status="arrived" />
                                  </>
                                );
                              }
                              return (
                                <>
                                  <StatusBadge scope="package" status="boxed" />
                                </>
                              );
                            }

                            return <span className="text-xs">{r.status}</span>;
                          })()}
                          {alertedTrackings.has(r.tracking.toUpperCase()) && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-900/40 text-yellow-300 border border-yellow-700/50">
                              Alertado
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-2">
                        {(() => {
                          const photoUrls = getPhotoUrls(r);
                          const primaryPhoto = photoUrls[0];
                          const extraCount = photoUrls.length - 1;
                          
                          if (!primaryPhoto) {
                            return <span className="text-white/40">-</span>;
                          }
                          
                          if (extraCount === 0) {
                            // Una sola foto: comportamiento actual
                            return (
                              <a
                                href={primaryPhoto}
                                target="_blank"
                                rel="noreferrer"
                                title="Ver foto"
                                aria-label="Ver foto"
                                className="inline-flex items-center justify-center text-white/80 hover:text-white"
                              >
                                <IconPhoto />
                              </a>
                            );
                          }
                          
                          // Múltiples fotos: icono + badge, click abre galería
                          return (
                            <button
                              onClick={() => onOpenGallery?.(photoUrls, r.tracking)}
                              title={`Ver ${photoUrls.length} fotos`}
                              aria-label={`Ver ${photoUrls.length} fotos`}
                              className="inline-flex items-center gap-1 text-white/80 hover:text-white"
                            >
                              <IconPhoto />
                              <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-600 text-white">+{extraCount}</span>
                            </button>
                          );
                        })()}
                      </td>
                      <td className="p-2">
                        {isStaff && !boxByInbound[r.id] && r.status === "received" ? (
                          <button
                            className="inline-flex items-center justify-center rounded border px-1.5 py-1 text-white/80 hover:text-red-400 hover:border-red-400"
                            title="Eliminar"
                            onClick={() => onDelete(r)}
                          >
                            <IconTrash />
                          </button>
                        ) : (
                          <span className="text-white/40">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {/* Alertas sin inboundPackage */}
                {alertOnlyRows.map((alert) => {
                  const c = clientsById[alert.clientId];
                  const cliente = c?.code
                    ? `${c.code} ${c.name}`
                    : alert.clientId;
                  return (
                    <tr key={`alert-${alert.id}`} className="border-t border-white/10 opacity-75">
                      <td className="p-2">
                        {alert.createdAt
                          ? new Date(alert.createdAt).toLocaleDateString()
                          : "-"}
                      </td>
                      <td className="p-2">{cliente}</td>
                      <td className="p-2 font-mono text-sm">{alert.tracking}</td>
                      <td className="p-2 text-white/40">-</td>
                      <td className="p-2 text-white/40">-</td>
                      <td className="p-2 text-white/40">-</td>
                      <td className="p-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-900/40 text-yellow-300 border border-yellow-700/50">
                          Alertado
                        </span>
                      </td>
                      <td className="p-2 text-white/40">-</td>
                      <td className="p-2 text-white/40">-</td>
                    </tr>
                  );
                })}
              </>
            );
          }
          
          // Para otros filtros: comportamiento normal
          const rowsToShow = statusFilter === "received"
            ? rows.filter((r) => !boxByInbound[r.id])
            : rows;
          
          return rowsToShow.map((r) => {
            const c = clientsById[r.clientId];
            const cliente = c?.code
              ? `${c.code} ${c.name}`
              : r.clientId;
            return (
              <tr key={r.id} className="border-t border-white/10">
                <td className="p-2">
                  {r.receivedAt
                    ? new Date(r.receivedAt).toLocaleDateString()
                    : "-"}
                </td>
                <td className="p-2">{cliente}</td>
                <td className="p-2 font-mono text-sm">
                  <a
                    className="underline text-white/80 hover:text-white"
                    href={`/admin/trackings/${r.id}`}
                  >
                    {r.tracking}
                  </a>
                </td>
                <td className="p-2">{r.carrier}</td>
                <td className="p-2 whitespace-nowrap">
                  {fmtWeightPairFromLb(Number(r.weightLb || 0))}
                </td>
                <td className="p-2">
                  {boxByInbound[r.id]?.code ? (
                    <button
                      className="underline text-sm text-white/80 hover:text-white"
                      onClick={() => onOpenBox(r.id)}
                    >
                      {boxByInbound[r.id]?.code}
                    </button>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="p-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {(() => {
                      const box = boxByInbound[r.id];
                      const sid = box?.shipmentId;
                      const sh = sid ? shipmentsById[sid] : undefined;
                      const shipStatus = sh?.status;

                      if (r.status === "received") {
                        return (
                          <>
                            <StatusBadge scope="package" status="received" />
                          </>
                        );
                      }

                      if (r.status === "boxed") {
                        if (shipStatus === "shipped") {
                          return (
                            <>
                              <StatusBadge scope="shipment" status="shipped" />
                            </>
                          );
                        }
                        if (shipStatus === "arrived" || shipStatus === "closed") {
                          return (
                            <>
                              <StatusBadge scope="shipment" status="arrived" />
                            </>
                          );
                        }
                        return (
                          <>
                            <StatusBadge scope="package" status="boxed" />
                          </>
                        );
                      }

                      return <span className="text-xs">{r.status}</span>;
                    })()}
                    {alertedTrackings.has(r.tracking.toUpperCase()) && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-900/40 text-yellow-300 border border-yellow-700/50">
                        Alertado
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-2">
                  {(() => {
                    const photoUrls = getPhotoUrls(r);
                    const primaryPhoto = photoUrls[0];
                    const extraCount = photoUrls.length - 1;
                    
                    if (!primaryPhoto) {
                      return <span className="text-white/40">-</span>;
                    }
                    
                    if (extraCount === 0) {
                      // Una sola foto: comportamiento actual
                      return (
                        <a
                          href={primaryPhoto}
                          target="_blank"
                          rel="noreferrer"
                          title="Ver foto"
                          aria-label="Ver foto"
                          className="inline-flex items-center justify-center text-white/80 hover:text-white"
                        >
                          <IconPhoto />
                        </a>
                      );
                    }
                    
                    // Múltiples fotos: icono + badge, click abre galería
                    return (
                      <button
                        onClick={() => onOpenGallery?.(photoUrls, r.tracking)}
                        title={`Ver ${photoUrls.length} fotos`}
                        aria-label={`Ver ${photoUrls.length} fotos`}
                        className="inline-flex items-center gap-1 text-white/80 hover:text-white"
                      >
                        <IconPhoto />
                        <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-600 text-white">+{extraCount}</span>
                      </button>
                    );
                  })()}
                </td>
                <td className="p-2">
                  {isStaff && !boxByInbound[r.id] && r.status === "received" ? (
                    <button
                      className="inline-flex items-center justify-center rounded border px-1.5 py-1 text-white/80 hover:text-red-400 hover:border-red-400"
                      title="Eliminar"
                      onClick={() => onDelete(r)}
                    >
                      <IconTrash />
                    </button>
                  ) : (
                    <span className="text-white/40">-</span>
                  )}
                </td>
              </tr>
            );
          });
        })()}
        {!rows.length ? (
          <tr>
            <td className="p-3 text-white/40" colSpan={9}>
              Sin datos aún.
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

