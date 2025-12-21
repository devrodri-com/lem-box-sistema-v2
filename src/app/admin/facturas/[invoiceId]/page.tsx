// src/app/admin/facturas/[invoiceId]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import type { Invoice, InvoiceItem, Client } from "@/types/lem";
import { normalizeInvoiceStatus } from "@/types/lem";

const btnPrimary =
  "inline-flex items-center justify-center h-10 px-4 rounded-md bg-[#eb6619] text-white font-medium shadow-md hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
const btnSecondary =
  "inline-flex items-center justify-center h-10 px-4 rounded-md border border-[#1f3f36] bg-white/5 text-white/90 font-medium hover:bg-white/10 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed";
const btnDanger =
  "inline-flex items-center justify-center h-10 px-4 rounded-md border border-red-500/70 bg-[#0f2a22] text-red-300 hover:bg-white/5 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed";

const inputCls =
  "h-10 w-full rounded-md border border-[#1f3f36] bg-[#0f2a22] px-3 text-white placeholder:text-white/40 focus:outline-none focus:border-[#005f40] focus:ring-1 focus:ring-[#005f40]";

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

export default function InvoiceEditorPage() {
  return (
    <RequireAuth requireAdmin>
      <PageInner />
    </RequireAuth>
  );
}

function PageInner() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params?.invoiceId as string;
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [claimsChecked, setClaimsChecked] = useState(false);

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
    // Solo cargar invoice si es superadmin
    if (!isSuperAdmin || !claimsChecked) {
      setLoading(false);
      return;
    }
    if (!invoiceId) {
      setError("ID de factura no válido");
      setLoading(false);
      return;
    }
    loadInvoice();
  }, [invoiceId, isSuperAdmin, claimsChecked]);

  async function loadInvoice() {
    try {
      setError(null);
      const invoiceDoc = await getDoc(doc(db, "invoices", invoiceId));
      if (!invoiceDoc.exists()) {
        setError("Factura no encontrada");
        setLoading(false);
        return;
      }

      const data = invoiceDoc.data();
      const loadedInvoice: Invoice = {
        id: invoiceDoc.id,
        shipmentId: typeof data.shipmentId === "string" ? data.shipmentId : "",
        clientId: typeof data.clientId === "string" ? data.clientId : "",
        currency: data.currency === "usd" ? "usd" : "usd",
        status: normalizeInvoiceStatus(data.status),
        items: Array.isArray(data.items)
          ? data.items.map((item: unknown) => {
              const rec = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
              return {
                description: typeof rec.description === "string" ? rec.description : "",
                quantity: typeof rec.quantity === "number" ? rec.quantity : 0,
                unitPriceUsd: typeof rec.unitPriceUsd === "number" ? rec.unitPriceUsd : 0,
                totalUsd: typeof rec.totalUsd === "number" ? rec.totalUsd : 0,
              };
            })
          : [],
        totalUsd: typeof data.totalUsd === "number" ? data.totalUsd : 0,
        createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
        publishedAt: typeof data.publishedAt === "number" ? data.publishedAt : undefined,
        paidAt: typeof data.paidAt === "number" ? data.paidAt : undefined,
        stripeSessionId: typeof data.stripeSessionId === "string" ? data.stripeSessionId : undefined,
        stripePaymentIntentId:
          typeof data.stripePaymentIntentId === "string" ? data.stripePaymentIntentId : undefined,
      };

      setInvoice(loadedInvoice);
      setItems(loadedInvoice.items);

      // Cargar cliente
      if (loadedInvoice.clientId) {
        const clientDoc = await getDoc(doc(db, "clients", loadedInvoice.clientId));
        if (clientDoc.exists()) {
          setClient({ id: clientDoc.id, ...(clientDoc.data() as Omit<Client, "id">) });
        }
      }
    } catch (e: any) {
      console.error("[admin/facturas] Error loading invoice:", e);
      setError(e?.message || "Error al cargar la factura");
    } finally {
      setLoading(false);
    }
  }

  function recalculateItemTotal(item: InvoiceItem): InvoiceItem {
    const total = item.quantity * item.unitPriceUsd;
    return { ...item, totalUsd: Number.isFinite(total) ? total : 0 };
  }

  function recalculateTotal(): number {
    return items.reduce((sum, item) => {
      const total = item.quantity * item.unitPriceUsd;
      return sum + (Number.isFinite(total) ? total : 0);
    }, 0);
  }

  function updateItem(index: number, updates: Partial<InvoiceItem>) {
    const updated = [...items];
    updated[index] = recalculateItemTotal({ ...updated[index], ...updates });
    setItems(updated);
  }

  function addItem() {
    setItems([...items, { description: "", quantity: 1, unitPriceUsd: 0, totalUsd: 0 }]);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  async function saveDraft() {
    if (!invoice) return;
    setSaving(true);
    setError(null);
    try {
      const recalculatedItems = items.map((item) => recalculateItemTotal(item));
      const totalUsd = recalculateTotal();

      const updateData: Partial<Invoice> = {
        items: recalculatedItems,
        totalUsd,
        status: invoice.status === "draft" ? "draft" : invoice.status,
      };

      await updateDoc(doc(db, "invoices", invoiceId), updateData);
      setInvoice({ ...invoice, ...updateData });
      alert("Factura guardada como borrador");
    } catch (e: any) {
      console.error("[admin/facturas] Error saving draft:", e);
      setError(e?.message || "Error al guardar la factura");
      alert(`Error: ${e?.message || "No se pudo guardar la factura"}`);
    } finally {
      setSaving(false);
    }
  }

  async function confirmAndSend() {
    if (!invoice) return;
    if (invoice.status === "paid" || invoice.status === "void") {
      alert("No se puede confirmar una factura pagada o anulada");
      return;
    }

    if (items.length === 0) {
      alert("La factura debe tener al menos un item");
      return;
    }

    const hasInvalidItems = items.some(
      (item) =>
        !item.description.trim() ||
        item.quantity <= 0 ||
        item.unitPriceUsd < 0 ||
        !Number.isFinite(item.quantity) ||
        !Number.isFinite(item.unitPriceUsd)
    );

    if (hasInvalidItems) {
      alert("Todos los items deben tener descripción, cantidad > 0 y precio unitario >= 0");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const recalculatedItems = items.map((item) => recalculateItemTotal(item));
      const totalUsd = recalculateTotal();

      // Actualizar invoice: items, total, status y publishedAt
      await updateDoc(doc(db, "invoices", invoiceId), {
        items: recalculatedItems,
        totalUsd,
        status: "open",
        publishedAt: Date.now(),
      });

      // Actualizar estado local
      setInvoice({ ...invoice, items: recalculatedItems, totalUsd, status: "open", publishedAt: Date.now() });
      setItems(recalculatedItems);
      
      alert("Enviado");
    } catch (e: any) {
      console.error("[admin/facturas] Error confirming invoice:", e);
      setError(e?.message || "Error al confirmar la factura");
      alert(`Error: ${e?.message || "No se pudo confirmar la factura"}`);
    } finally {
      setSaving(false);
    }
  }

  async function voidInvoice() {
    if (!invoice) return;
    if (invoice.status === "paid") {
      alert("No se puede anular una factura pagada");
      return;
    }

    const confirmed = confirm("¿Seguro que quieres anular esta factura?");
    if (!confirmed) return;

    setSaving(true);
    setError(null);
    try {
      await updateDoc(doc(db, "invoices", invoiceId), { status: "void" });
      setInvoice({ ...invoice, status: "void" });
      alert("Factura anulada");
    } catch (e: any) {
      console.error("[admin/facturas] Error voiding invoice:", e);
      setError(e?.message || "Error al anular la factura");
      alert(`Error: ${e?.message || "No se pudo anular la factura"}`);
    } finally {
      setSaving(false);
    }
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

  if (loading) {
    return (
      <main className="min-h-[100dvh] bg-[#02120f] text-white flex flex-col items-center p-4 md:p-8 pt-24 md:pt-28">
        <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-4 md:p-6">
          <p className="text-white/70">Cargando factura...</p>
        </div>
      </main>
    );
  }

  if (error && !invoice) {
    return (
      <main className="min-h-[100dvh] bg-[#02120f] text-white flex flex-col items-center p-4 md:p-8 pt-24 md:pt-28">
        <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-4 md:p-6 space-y-4">
          <p className="text-red-300">{error}</p>
          <button className={btnSecondary} onClick={() => router.push("/admin/facturas")}>
            Volver a facturas
          </button>
        </div>
      </main>
    );
  }

  if (!invoice) {
    return null;
  }

  const clientLabel = client
    ? `${client.code || ""} ${client.name || ""}`.trim() || invoice.clientId
    : invoice.clientId;
  const totalUsd = recalculateTotal();
  const canEdit = invoice.status !== "paid" && invoice.status !== "void";

  return (
    <main className="min-h-[100dvh] bg-[#02120f] text-white flex flex-col items-center p-4 md:p-8 pt-24 md:pt-28">
      <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Editar Factura</h1>
          <button className={btnSecondary} onClick={() => router.push("/admin/facturas")}>
            Volver
          </button>
        </div>

        {error && (
          <div className="rounded-md border border-red-500/70 bg-red-900/20 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Header */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-md border border-[#1f3f36] bg-[#071f19] p-4">
          <div>
            <div className="text-xs text-white/60 mb-1">Cliente</div>
            <div className="text-white font-medium">{clientLabel}</div>
          </div>
          <div>
            <div className="text-xs text-white/60 mb-1">Embarque</div>
            <div className="text-white font-mono text-sm">{invoice.shipmentId || "-"}</div>
          </div>
          <div>
            <div className="text-xs text-white/60 mb-1">Estado</div>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
        </div>

        {/* Items Table */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Items</h2>
            {canEdit && (
              <button className={btnSecondary} onClick={addItem} disabled={saving}>
                Agregar línea
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-md border border-[#1f3f36] bg-[#071f19] ring-1 ring-white/10">
            <table className="min-w-full text-sm tabular-nums">
              <thead className="sticky top-0 z-10 bg-[#0f2a22] shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)]">
                <tr>
                  <th className="px-3 py-2 text-left text-white/80 text-xs font-medium">Descripción</th>
                  <th className="px-3 py-2 text-right text-white/80 text-xs font-medium">Cantidad</th>
                  <th className="px-3 py-2 text-right text-white/80 text-xs font-medium">Unit USD</th>
                  <th className="px-3 py-2 text-right text-white/80 text-xs font-medium">Total USD</th>
                  {canEdit && (
                    <th className="px-3 py-2 text-center text-white/80 text-xs font-medium">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 5 : 4} className="px-3 py-4 text-center text-white/60">
                      No hay items. {canEdit && "Agrega una línea para comenzar."}
                    </td>
                  </tr>
                ) : (
                  items.map((item, index) => (
                    <tr
                      key={index}
                      className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10"
                    >
                      <td className="px-3 py-2">
                        {canEdit ? (
                          <input
                            className={inputCls}
                            type="text"
                            value={item.description}
                            onChange={(e) => updateItem(index, { description: e.target.value })}
                            placeholder="Descripción del item"
                            disabled={saving}
                          />
                        ) : (
                          <span className="text-white">{item.description || "-"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {canEdit ? (
                          <input
                            className={inputCls}
                            type="text"
                            inputMode="decimal"
                            value={item.quantity === 0 ? "" : item.quantity}
                            onChange={(e) => {
                              const val = e.target.value.trim();
                              const parsed = val === "" ? 0 : Number(val);
                              if (val === "" || (Number.isFinite(parsed) && parsed >= 0)) {
                                updateItem(index, { quantity: parsed });
                              }
                            }}
                            placeholder="0"
                            disabled={saving}
                          />
                        ) : (
                          <span className="text-white text-right block">{item.quantity}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {canEdit ? (
                          <input
                            className={inputCls}
                            type="text"
                            inputMode="decimal"
                            value={item.unitPriceUsd === 0 ? "" : item.unitPriceUsd}
                            onChange={(e) => {
                              const val = e.target.value.trim();
                              const parsed = val === "" ? 0 : Number(val);
                              if (val === "" || (Number.isFinite(parsed) && parsed >= 0)) {
                                updateItem(index, { unitPriceUsd: parsed });
                              }
                            }}
                            placeholder="0.00"
                            disabled={saving}
                          />
                        ) : (
                          <span className="text-white text-right block">${item.unitPriceUsd.toFixed(2)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-white text-right block font-medium">
                          ${recalculateItemTotal(item).totalUsd.toFixed(2)}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="px-3 py-2">
                          <button
                            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-red-500/70 bg-[#0f2a22] text-red-300 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                            onClick={() => removeItem(index)}
                            disabled={saving}
                            title="Eliminar línea"
                          >
                            ×
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-[#0f2a22] border-t-2 border-white/20">
                <tr>
                  <td colSpan={canEdit ? 3 : 2} className="px-3 py-3 text-right text-white/80 font-medium">
                    Total USD:
                  </td>
                  <td className="px-3 py-3 text-right text-white font-bold text-base">
                    ${totalUsd.toFixed(2)}
                  </td>
                  {canEdit && <td className="px-3 py-3"></td>}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Actions */}
        {canEdit && (
          <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-white/10">
            <button className={btnSecondary} onClick={saveDraft} disabled={saving}>
              {saving ? "Guardando…" : "Guardar borrador"}
            </button>
            <button className={btnPrimary} onClick={confirmAndSend} disabled={saving}>
              {saving ? "Confirmando…" : "Confirmar y enviar"}
            </button>
            <button className={btnDanger} onClick={voidInvoice} disabled={saving}>
              Anular
            </button>
          </div>
        )}

        {!canEdit && (
          <div className="pt-4 border-t border-white/10 text-sm text-white/60">
            Esta factura no puede ser editada porque está {invoice.status === "paid" ? "pagada" : "anulada"}.
          </div>
        )}
      </div>
    </main>
  );
}

