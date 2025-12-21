// src/app/mi/pagos/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useMiContext } from "../layout";
import type { Invoice } from "@/types/lem";
import { normalizeInvoiceStatus } from "@/types/lem";

const btnPrimary =
  "inline-flex items-center justify-center h-10 px-4 rounded-md bg-[#eb6619] text-white font-medium shadow-md hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

const CONTROL_BORDER = "border-[#1f3f36]";
const btnSecondary =
  "inline-flex items-center justify-center h-10 px-4 rounded-md border border-[#1f3f36] bg-white/5 text-white/90 font-medium hover:bg-white/10 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed";

export default function MiPagosPage() {
  const { clientId } = useMiContext();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    if (clientId) {
      loadInvoices(clientId);
    }
  }, [clientId]);

  async function loadInvoices(cid: string) {
    setLoading(true);
    setError(null);
    try {
      const q = query(
        collection(db, "invoices"),
        where("clientId", "==", cid)
      );
      const snap = await getDocs(q);
      const loaded: Invoice[] = snap.docs.map((d) => {
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
      loaded.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setInvoices(loaded);
    } catch (e: any) {
      console.error("Error loading invoices:", e);
      setError("No se pudieron cargar las facturas.");
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }

  async function handlePay(invoiceId: string) {
    const user = auth.currentUser;
    if (!user) {
      alert("Debes estar autenticado para pagar.");
      return;
    }

    setPayingInvoiceId(invoiceId);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/payments/create-checkout-session", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ invoiceId }),
      });

      // Verificar content-type antes de parsear JSON
      const contentType = res.headers.get("content-type");
      const isJson = contentType && contentType.includes("application/json");

      let data: any;
      if (isJson) {
        try {
          data = await res.json();
        } catch (e: any) {
          console.error("[mi/pagos] Error parsing JSON response:", e);
          const text = await res.text();
          console.error("[mi/pagos] Response text:", text);
          alert("Error al procesar la respuesta del servidor.");
          return;
        }
      } else {
        // Si no es JSON, probablemente es HTML (página de error de Next.js)
        const text = await res.text();
        console.error("[mi/pagos] Received non-JSON response (likely HTML error page):", text.substring(0, 200));
        alert("Error del servidor. Por favor, intenta nuevamente o contacta al soporte.");
        return;
      }

      if (!res.ok) {
        // Manejar errores específicos
        let errorMessage = "Error al procesar el pago.";
        if (res.status === 401) {
          errorMessage = "No estás autenticado. Por favor, inicia sesión nuevamente.";
        } else if (res.status === 403) {
          errorMessage = "No tienes permiso para pagar esta factura.";
        } else if (res.status === 400) {
          if (data.error === "invoice_not_open") {
            errorMessage = "Esta factura no está disponible para pago.";
          } else if (data.error === "invoice_no_items") {
            errorMessage = "La factura no tiene items.";
          } else if (data.error === "invalid_input") {
            errorMessage = "Datos inválidos en la solicitud.";
          } else if (data.error) {
            errorMessage = `Error: ${data.error}`;
          }
        } else if (res.status === 500) {
          if (data.error === "stripe_not_configured") {
            errorMessage = "El sistema de pagos no está configurado. Contacta al soporte.";
          } else if (data.error === "stripe_api_error") {
            errorMessage = "Error al comunicarse con el procesador de pagos. Intenta nuevamente.";
          } else if (data.error === "internal_error") {
            errorMessage = "Error interno del servidor. Por favor, intenta nuevamente.";
          } else if (data.error) {
            errorMessage = `Error del servidor: ${data.error}`;
          }
        }
        alert(errorMessage);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("No se recibió la URL de pago.");
      }
    } catch (e: any) {
      console.error("[mi/pagos] Error creating checkout session:", e);
      alert("Error al conectar con el servicio de pago.");
    } finally {
      setPayingInvoiceId(null);
    }
  }

  const openInvoices = useMemo(() => {
    return invoices.filter((inv) => inv.status === "open");
  }, [invoices]);

  const paidInvoices = useMemo(() => {
    return invoices.filter((inv) => inv.status === "paid");
  }, [invoices]);

  if (loading) {
    return (
      <section className="space-y-3">
        <div className="text-sm text-white/60">Cargando facturas…</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-3">
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {/* Sección Pendientes */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Facturas Pendientes</h2>
        {openInvoices.length === 0 ? (
          <div className="text-sm text-white/60">No hay facturas pendientes.</div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-[#1f3f36] bg-[#071f19] ring-1 ring-white/10">
            <table className="w-full text-sm">
              <thead className="bg-[#0f2a22] text-white/80 text-xs font-medium">
                <tr>
                  <th className="text-left p-2">Fecha</th>
                  <th className="text-left p-2">Descripción</th>
                  <th className="text-right p-2">Total</th>
                  <th className="text-left p-2">Estado</th>
                  <th className="text-left p-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {openInvoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10">
                    <td className="p-2 text-white">
                      {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : "-"}
                    </td>
                    <td className="p-2 text-white">
                      {inv.items.length > 0
                        ? inv.items.map((item, idx) => (
                            <div key={idx} className="text-sm">
                              {item.description}
                              {item.quantity !== 1 ? ` (${item.quantity})` : ""}
                            </div>
                          ))
                        : "Factura sin items"}
                    </td>
                    <td className="p-2 text-right tabular-nums font-medium text-white">
                      ${inv.totalUsd.toFixed(2)} USD
                    </td>
                    <td className="p-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/25 text-amber-100 ring-amber-400/60 border border-amber-400/60">
                        Pendiente
                      </span>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <button
                          className={btnSecondary}
                          onClick={() => inv.id && setOpenInvoiceId(inv.id)}
                          disabled={!inv.id}
                        >
                          Ver
                        </button>
                        <button
                          className={btnPrimary}
                          onClick={() => inv.id && handlePay(inv.id)}
                          disabled={payingInvoiceId === inv.id || !inv.id}
                        >
                          {payingInvoiceId === inv.id ? "Procesando…" : "Pagar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sección Pagadas */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Facturas Pagadas</h2>
        {paidInvoices.length === 0 ? (
          <div className="text-sm text-white/60">No hay facturas pagadas.</div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-[#1f3f36] bg-[#071f19] ring-1 ring-white/10">
            <table className="w-full text-sm">
              <thead className="bg-[#0f2a22] text-white/80 text-xs font-medium">
                <tr>
                  <th className="text-left p-2">Fecha</th>
                  <th className="text-left p-2">Descripción</th>
                  <th className="text-right p-2">Total</th>
                  <th className="text-left p-2">Estado</th>
                  <th className="text-left p-2">Fecha de pago</th>
                  <th className="text-left p-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paidInvoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10">
                    <td className="p-2 text-white">
                      {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : "-"}
                    </td>
                    <td className="p-2 text-white">
                      {inv.items.length > 0
                        ? inv.items.map((item, idx) => (
                            <div key={idx} className="text-sm">
                              {item.description}
                              {item.quantity !== 1 ? ` (${item.quantity})` : ""}
                            </div>
                          ))
                        : "Factura sin items"}
                    </td>
                    <td className="p-2 text-right tabular-nums font-medium text-white">
                      ${inv.totalUsd.toFixed(2)} USD
                    </td>
                    <td className="p-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-100 ring-emerald-400/60 border border-emerald-400/60">
                        Pagada
                      </span>
                    </td>
                    <td className="p-2 text-white/80">
                      {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : "-"}
                    </td>
                    <td className="p-2">
                      <button
                        className={btnSecondary}
                        onClick={() => inv.id && setOpenInvoiceId(inv.id)}
                        disabled={!inv.id}
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de detalle de factura */}
      {openInvoiceId && (() => {
        const invoice = invoices.find((inv) => inv.id === openInvoiceId);
        if (!invoice) {
          // Si no encuentra la factura, cerrar el modal
          setOpenInvoiceId(null);
          return null;
        }

        return (
          <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
            <div className="bg-[#071f19] border border-[#1f3f36] w-full max-w-2xl rounded-xl shadow-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-white">Factura</h3>
                <button
                  className="text-white/60 hover:text-white text-2xl leading-none"
                  onClick={() => setOpenInvoiceId(null)}
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                {/* Embarque */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white/80">Embarque:</span>
                  <span className="text-sm text-white font-mono">
                    {invoice.shipmentCode || invoice.shipmentId || "-"}
                  </span>
                </div>

                {/* Estado */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white/80">Estado:</span>
                  {invoice.status === "open" ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-300">
                      Pendiente
                    </span>
                  ) : invoice.status === "paid" ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-300">
                      Pagada
                    </span>
                  ) : invoice.status === "draft" ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-300">
                      Borrador
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-700 border border-rose-300">
                      Anulada
                    </span>
                  )}
                </div>

                {/* Total */}
                <div className="flex items-baseline gap-2">
                  <span className="text-sm text-white/80">Total:</span>
                  <span className="text-lg font-semibold text-white">
                    ${invoice.totalUsd.toFixed(2)} USD
                  </span>
                </div>

                {/* Tabla de items */}
                <div className="overflow-x-auto rounded-md border border-[#1f3f36] bg-[#071f19] ring-1 ring-white/10">
                  <table className="w-full text-sm">
                    <thead className="bg-[#0f2a22] text-white/80 text-xs font-medium">
                      <tr>
                        <th className="text-left p-2">Descripción</th>
                        <th className="text-right p-2">Cantidad</th>
                        <th className="text-right p-2">Unit USD</th>
                        <th className="text-right p-2">Total USD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.items.length > 0 ? (
                        invoice.items.map((item, idx) => (
                          <tr key={idx} className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10">
                            <td className="p-2 text-white">{item.description}</td>
                            <td className="p-2 text-right tabular-nums text-white">
                              {item.quantity}
                            </td>
                            <td className="p-2 text-right tabular-nums text-white">
                              ${item.unitPriceUsd.toFixed(2)}
                            </td>
                            <td className="p-2 text-right tabular-nums font-medium text-white">
                              ${item.totalUsd.toFixed(2)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="p-3 text-white/40 text-center" colSpan={4}>
                            Sin items
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Botón Cerrar */}
                <div className="flex justify-end pt-2">
                  <button
                    className={btnSecondary}
                    onClick={() => setOpenInvoiceId(null)}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </section>
  );
}

