// src/app/admin/facturas/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { collection, getDocs, query, addDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import type { Invoice, Client, Shipment } from "@/types/lem";
import { normalizeInvoiceStatus } from "@/types/lem";
import { BrandSelect, type BrandOption } from "@/components/ui/BrandSelect";

const btnPrimary =
  "inline-flex items-center justify-center h-10 px-4 rounded-md bg-[#eb6619] text-white font-medium shadow-md hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
const btnSecondary =
  "inline-flex items-center justify-center h-10 px-4 rounded-md border border-[#1f3f36] bg-white/5 text-white/90 font-medium hover:bg-white/10 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed";

const inputCls =
  "h-10 w-full rounded-md border border-[#1f3f36] bg-[#0f2a22] px-3 text-white placeholder:text-white/40 focus:outline-none focus:border-[#005f40] focus:ring-1 focus:ring-[#005f40]";

const INPUT_BG_STYLE = {
  backgroundColor: "#0f2a22",
  WebkitBoxShadow: "0 0 0px 1000px #0f2a22 inset",
  WebkitTextFillColor: "#ffffff",
} as const;

function InvoiceStatusBadge({ status }: { status: Invoice["status"] }) {
  const config = {
    draft: { label: "Borrador", classes: "bg-slate-100 text-slate-700 border-slate-300" },
    open: { label: "Pendiente", classes: "bg-yellow-100 text-yellow-800 border-yellow-300" },
    paid: { label: "Pagada", classes: "bg-green-100 text-green-800 border-green-300" },
    void: { label: "Anulada", classes: "bg-rose-100 text-rose-700 border-rose-300" },
  }[status];

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${config.classes}`}>
      {config.label}
    </span>
  );
}

export default function AdminFacturasPage() {
  return (
    <RequireAuth requireAdmin>
      <PageInner />
    </RequireAuth>
  );
}

function PageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clientsById, setClientsById] = useState<Record<string, Client>>({});
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newClientId, setNewClientId] = useState("");
  const [selectedShipmentId, setSelectedShipmentId] = useState("");
  const [creating, setCreating] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [claimsChecked, setClaimsChecked] = useState(false);
  const [payUrls, setPayUrls] = useState<Record<string, string>>({});
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState("");

  const shipmentIdFilter = searchParams.get("shipmentId")?.trim() || "";

  const clientOptions: BrandOption[] = useMemo(() => {
    return Object.values(clientsById)
      .filter((c) => c.id)
      .map((c) => ({
        value: c.id!,
        label: `${c.code || ""} ${c.name || ""}`.trim() || c.id!,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [clientsById]);

  const shipmentsById = useMemo(() => {
    const map: Record<string, Shipment> = {};
    shipments.forEach((s) => {
      if (s.id) map[s.id] = s;
    });
    return map;
  }, [shipments]);

  const shipmentOptions: BrandOption[] = useMemo(() => {
    return shipments
      .filter((s) => s.id)
      .map((s) => ({
        value: s.id!,
        label: s.code || s.id!,
      }));
  }, [shipments]);

  const filteredClientOptions = useMemo(() => {
    const q = clientSearch.trim().toUpperCase();
    if (!q) return clientOptions;
    return clientOptions.filter((o) => o.label.toUpperCase().includes(q));
  }, [clientOptions, clientSearch]);

  // Verificar superadmin
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setClaimsChecked(true);
      return;
    }
    user
      .getIdTokenResult(true)
      .then((r) => {
        const claims = r.claims as any;
        setIsSuperAdmin(Boolean(claims?.superadmin === true || claims?.role === "superadmin"));
      })
      .catch(() => setIsSuperAdmin(false))
      .finally(() => setClaimsChecked(true));
  }, []);

  useEffect(() => {
    // Solo cargar datos si es superadmin
    if (!isSuperAdmin || !claimsChecked) return;
    async function loadData() {
      try {
        // Cargar invoices
        const invoicesQuery = query(collection(db, "invoices"));
        const invoicesSnap = await getDocs(invoicesQuery);
        const loadedInvoices: Invoice[] = invoicesSnap.docs.map((d) => {
          const data = d.data();
            return {
              id: d.id,
              shipmentId: typeof data.shipmentId === "string" ? data.shipmentId : "",
              shipmentCode: typeof data.shipmentCode === "string" ? data.shipmentCode : undefined,
              clientId: typeof data.clientId === "string" ? data.clientId : "",
              currency: data.currency === "usd" ? "usd" : "usd",
              status: normalizeInvoiceStatus(data.status),
              items: Array.isArray(data.items) ? data.items : [],
              totalUsd: typeof data.totalUsd === "number" ? data.totalUsd : 0,
              createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
              publishedAt: typeof data.publishedAt === "number" ? data.publishedAt : undefined,
              paidAt: typeof data.paidAt === "number" ? data.paidAt : undefined,
              stripeSessionId: typeof data.stripeSessionId === "string" ? data.stripeSessionId : undefined,
              stripePaymentIntentId: typeof data.stripePaymentIntentId === "string" ? data.stripePaymentIntentId : undefined,
            };
        });
        // Ordenar en memoria por createdAt desc
        loadedInvoices.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setInvoices(loadedInvoices);

        // Cargar clients
        const clientsSnap = await getDocs(collection(db, "clients"));
        const map: Record<string, Client> = {};
        clientsSnap.docs.forEach((d) => {
          map[d.id] = { id: d.id, ...(d.data() as Omit<Client, "id">) };
        });
        setClientsById(map);

        // Cargar shipments
        const shipmentsSnap = await getDocs(collection(db, "shipments"));
        const loadedShipments: Shipment[] = shipmentsSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Shipment, "id">),
        }));
        // Ordenar en memoria por (openedAt || closedAt || arrivedAt || 0) desc
        loadedShipments.sort((a, b) => {
          const aTime = a.openedAt || a.closedAt || a.arrivedAt || 0;
          const bTime = b.openedAt || b.closedAt || b.arrivedAt || 0;
          return bTime - aTime;
        });
        setShipments(loadedShipments);
      } catch (e) {
        console.error("[admin/facturas] Error loading data:", e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [isSuperAdmin, claimsChecked]);

  // Filtrar invoices por shipmentId
  const filteredInvoices = useMemo(() => {
    if (!shipmentIdFilter) {
      return invoices;
    }
    return invoices.filter((inv) => inv.shipmentId === shipmentIdFilter);
  }, [invoices, shipmentIdFilter]);

  // Prefill modal cuando se abre con shipmentIdFilter
  useEffect(() => {
    if (showNewModal && shipmentIdFilter && !selectedShipmentId) {
      setSelectedShipmentId(shipmentIdFilter);
    }
  }, [showNewModal, shipmentIdFilter, selectedShipmentId]);

  // Resetear búsqueda de cliente al abrir el modal
  useEffect(() => {
    if (showNewModal) {
      setClientSearch("");
    }
  }, [showNewModal]);

  function clearShipmentIdFilter() {
    router.replace("/admin/facturas");
  }

  // No renderizar contenido si no es superadmin
  if (!claimsChecked) {
    return (
      <main className="min-h-[100dvh] bg-[#02120f] text-white flex flex-col items-center p-4 md:p-8 pt-24 md:pt-28">
        <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-4 md:p-6">
          <p className="text-white/70">Verificando permisos...</p>
        </div>
      </main>
    );
  }

  if (!isSuperAdmin) {
    return (
      <main className="min-h-[100dvh] bg-[#02120f] text-white flex flex-col items-center p-4 md:p-8 pt-24 md:pt-28">
        <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-4 md:p-6">
          <p className="text-white/70">Sin permisos</p>
        </div>
      </main>
    );
  }

  async function createInvoice() {
    if (!newClientId.trim()) {
      alert("Debes seleccionar un cliente");
      return;
    }

    setCreating(true);
    try {
      let shipmentId = "";
      let shipmentCode = "";
      if (selectedShipmentId.trim()) {
        shipmentId = selectedShipmentId.trim();
        const shipment = shipmentsById[shipmentId];
        if (shipment && shipment.code) {
          shipmentCode = shipment.code;
        }
      }

      const payload: any = {
        clientId: newClientId,
        shipmentId,
        currency: "usd",
        status: "draft",
        items: [],
        totalUsd: 0,
        createdAt: Date.now(),
      };

      if (shipmentCode && shipmentCode.trim()) {
        payload.shipmentCode = shipmentCode.trim();
      }

      const docRef = await addDoc(collection(db, "invoices"), payload);
      setShowNewModal(false);
      setNewClientId("");
      setSelectedShipmentId("");
      router.push(`/admin/facturas/${docRef.id}`);
    } catch (e: any) {
      console.error("[admin/facturas] Error creating invoice:", e);
      alert(`Error: ${e?.message || "No se pudo crear la factura"}`);
    } finally {
      setCreating(false);
    }
  }

  async function generatePaymentLink(invoiceId: string) {
    setGeneratingId(invoiceId);
    try {
      const user = auth.currentUser;
      if (!user) {
        alert("Debes estar autenticado para generar el link de pago");
        return;
      }

      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/payments/create-checkout-session", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ invoiceId }),
      });

      const contentType = res.headers.get("content-type");
      const isJson = contentType && contentType.includes("application/json");

      let data: any;
      if (isJson) {
        try {
          data = await res.json();
        } catch (e: any) {
          console.error("[admin/facturas] Error parsing JSON response:", e);
          alert("Error al procesar la respuesta del servidor.");
          return;
        }
      } else {
        const text = await res.text();
        console.error("[admin/facturas] Received non-JSON response:", text.substring(0, 200));
        alert("Error del servidor. Por favor, intenta nuevamente.");
        return;
      }

      if (!res.ok) {
        let errorMessage = "Error al generar el link de pago.";
        if (res.status === 401) {
          errorMessage = "No estás autenticado. Por favor, inicia sesión nuevamente.";
        } else if (res.status === 403) {
          errorMessage = "No tienes permiso para generar este link de pago.";
        } else if (res.status === 400) {
          if (data.error === "invoice_not_open") {
            errorMessage = "Esta factura no está disponible para pago.";
          } else if (data.error === "invoice_no_items") {
            errorMessage = "La factura no tiene items.";
          } else if (data.error) {
            errorMessage = `Error: ${data.error}`;
          }
        } else if (res.status === 500) {
          if (data.error === "stripe_not_configured") {
            errorMessage = "El sistema de pagos no está configurado. Contacta al soporte.";
          } else if (data.error === "stripe_api_error") {
            errorMessage = "Error al comunicarse con el procesador de pagos. Intenta nuevamente.";
          } else if (data.error) {
            errorMessage = `Error del servidor: ${data.error}`;
          }
        }
        alert(errorMessage);
        return;
      }

      if (data.url) {
        setPayUrls((prev) => ({ ...prev, [invoiceId]: data.url }));
      } else {
        alert("No se recibió la URL de pago.");
      }
    } catch (e: any) {
      console.error("[admin/facturas] Error generating payment link:", e);
      alert("Error al generar el link de pago.");
    } finally {
      setGeneratingId(null);
    }
  }

  async function copyToClipboard(text: string, invoiceId: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(invoiceId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e) {
      console.error("Error copying to clipboard:", e);
      alert("No se pudo copiar al portapapeles");
    }
  }

  function copyWhatsAppMessage(invoice: Invoice) {
    const invoiceId = invoice.id;
    if (!invoiceId || !payUrls[invoiceId]) return;
    const shipmentCode = invoice.shipmentCode || invoice.shipmentId || "-";
    const message = `LEM-BOX: Tenés una factura pendiente por USD ${invoice.totalUsd.toFixed(2)}. Embarque: ${shipmentCode}. Pagá acá: ${payUrls[invoiceId]}`;
    copyToClipboard(message, invoiceId);
  }

  if (loading) {
    return (
      <main className="min-h-[100dvh] bg-[#02120f] text-white flex flex-col items-center p-4 md:p-8 pt-24 md:pt-28">
        <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-4 md:p-6">
          <p className="text-white/70">Cargando facturas...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#02120f] text-white flex flex-col items-center p-4 md:p-8 pt-24 md:pt-28">
      <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Facturas</h1>
          <button className={btnPrimary} onClick={() => setShowNewModal(true)}>
            Nueva factura
          </button>
        </div>

        {/* Filtro por embarque */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2">
            <span className="text-sm text-white/60">Filtrar por embarque:</span>
            <div className="w-48">
              <BrandSelect
                value={shipmentIdFilter}
                onChange={(val) => {
                  const v = String(val || "");
                  if (!v) router.replace("/admin/facturas");
                  else router.replace(`/admin/facturas?shipmentId=${encodeURIComponent(v)}`);
                }}
                options={[{ value: "", label: "Todos" }, ...shipmentOptions]}
                placeholder="Todos"
              />
            </div>
          </label>
          {shipmentIdFilter && (
            <button
              className="h-9 px-3 rounded-md border border-[#1f3f36] bg-white/5 text-white/90 text-sm font-medium hover:bg-white/10 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40]"
              onClick={clearShipmentIdFilter}
            >
              Limpiar
            </button>
          )}
        </div>

        {filteredInvoices.length === 0 ? (
          <p className="text-white/70">
            {shipmentIdFilter ? `No hay facturas para el embarque "${shipmentIdFilter}".` : "No hay facturas disponibles."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-[#1f3f36] bg-[#071f19] ring-1 ring-white/10">
            <table className="min-w-full text-sm tabular-nums">
              <thead className="sticky top-0 z-10 bg-[#0f2a22] shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)]">
                <tr>
                  <th className="px-3 py-2 text-left text-white/80 text-xs font-medium">Fecha</th>
                  <th className="px-3 py-2 text-left text-white/80 text-xs font-medium">Cliente</th>
                  <th className="px-3 py-2 text-left text-white/80 text-xs font-medium">Embarque</th>
                  <th className="px-3 py-2 text-right text-white/80 text-xs font-medium">Total</th>
                  <th className="px-3 py-2 text-left text-white/80 text-xs font-medium">Estado</th>
                  <th className="px-3 py-2 text-left text-white/80 text-xs font-medium">Pago</th>
                  <th className="px-3 py-2 text-left text-white/80 text-xs font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => {
                  const client = clientsById[inv.clientId];
                  const clientLabel = client
                    ? `${client.code || ""} ${client.name || ""}`.trim() || inv.clientId
                    : inv.clientId;
                  return (
                    <tr key={inv.id} className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10">
                      <td className="px-3 py-2 text-white">
                        {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : "-"}
                      </td>
                      <td className="px-3 py-2 text-white">{clientLabel}</td>
                      <td className="px-3 py-2 text-white font-mono text-xs">
                        {inv.shipmentCode || inv.shipmentId || "-"}
                      </td>
                      <td className="px-3 py-2 text-right text-white font-medium">
                        ${inv.totalUsd.toFixed(2)} USD
                      </td>
                      <td className="px-3 py-2">
                        <InvoiceStatusBadge status={inv.status} />
                      </td>
                      <td className="px-3 py-2">
                        {inv.status === "open" ? (
                          <div className="flex flex-wrap items-center gap-2">
                            {!payUrls[inv.id || ""] ? (
                              <button
                                className={btnSecondary}
                                onClick={() => inv.id && generatePaymentLink(inv.id)}
                                disabled={generatingId === inv.id || !inv.id}
                              >
                                {generatingId === inv.id ? "Generando…" : "Generar link"}
                              </button>
                            ) : (
                              <>
                                <button
                                  className={btnSecondary}
                                  onClick={() => inv.id && copyToClipboard(payUrls[inv.id], inv.id)}
                                  disabled={copiedId === inv.id || !inv.id}
                                >
                                  {copiedId === inv.id ? "Copiado" : "Copiar link"}
                                </button>
                                <button
                                  className={btnSecondary}
                                  onClick={() => copyWhatsAppMessage(inv)}
                                  disabled={!inv.id || !payUrls[inv.id]}
                                >
                                  Copiar WhatsApp
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="text-white/40 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          className={btnSecondary}
                          onClick={() => {
                            if (inv.id) {
                              router.push(`/admin/facturas/${inv.id}`);
                            }
                          }}
                          disabled={!inv.id}
                        >
                          Abrir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal Nueva Factura */}
        {showNewModal && (
          <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
            <div className="bg-[#071f19] w-full max-w-md rounded-xl shadow-xl border border-[#1f3f36] p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Nueva factura</h3>
                <button
                  className="text-white/60 hover:text-white"
                  onClick={() => {
                    setShowNewModal(false);
                    setNewClientId("");
                    setSelectedShipmentId("");
                  }}
                  disabled={creating}
                >
                  ×
                </button>
              </div>
              <div className="space-y-4">
                <label className="block">
                  <span className="text-xs text-white/60 mb-1 block">Cliente *</span>
                  <input
                    className={inputCls}
                    style={INPUT_BG_STYLE}
                    type="text"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Buscar cliente"
                  />
                  <div className="mt-2">
                    <BrandSelect
                      value={newClientId}
                      onChange={setNewClientId}
                      options={filteredClientOptions}
                      placeholder="Seleccionar cliente"
                      disabled={creating}
                    />
                  </div>
                </label>
                <label className="block">
                  <span className="text-xs text-white/60 mb-1 block">Embarque (opcional)</span>
                  <BrandSelect
                    value={selectedShipmentId}
                    onChange={setSelectedShipmentId}
                    options={[
                      { value: "", label: "Ninguno" },
                      ...shipmentOptions,
                    ]}
                    placeholder="Seleccionar embarque"
                    disabled={creating}
                  />
                </label>
                <div className="flex justify-end gap-2 mt-6">
                  <button
                    className={btnSecondary}
                    onClick={() => {
                      setShowNewModal(false);
                      setNewClientId("");
                      setSelectedShipmentId("");
                    }}
                    disabled={creating}
                  >
                    Cancelar
                  </button>
                  <button className={btnPrimary} onClick={createInvoice} disabled={creating || !newClientId}>
                    {creating ? "Creando…" : "Crear"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
