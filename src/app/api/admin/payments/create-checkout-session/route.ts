// src/app/api/admin/payments/create-checkout-session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { getStripe } from "@/lib/stripe";
import type { Invoice, InvoiceItem } from "@/types/lem";

export async function POST(req: NextRequest) {
  try {
    // 0. Validar configuración de Stripe
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "stripe_not_configured" }, { status: 500 });
    }

    // 1. Autenticación
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(token);
    } catch (e: any) {
      console.error("[admin/create-checkout-session] Token verification failed:", e?.message);
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // 2. Verificar que es superadmin
    const claims = decoded as any;
    if (claims?.superadmin !== true && claims?.role !== "superadmin") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // 3. Leer invoiceId del body
    let invoiceId: string;
    try {
      const body = await req.json();
      invoiceId = body.invoiceId;
    } catch (e: any) {
      console.error("[admin/create-checkout-session] Error parsing request body:", e?.message);
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    if (!invoiceId || typeof invoiceId !== "string") {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    // 4. Leer invoice
    const invoiceDoc = await adminDb.collection("invoices").doc(invoiceId).get();
    if (!invoiceDoc.exists) {
      return NextResponse.json({ error: "invoice_not_found" }, { status: 404 });
    }

    const invoiceData = invoiceDoc.data() as Invoice;
    const invoice: Invoice = {
      ...invoiceData,
      id: invoiceDoc.id,
    };

    // 5. Validar invoice
    if (invoice.status !== "open") {
      return NextResponse.json({ error: "invoice_not_open" }, { status: 400 });
    }

    if (invoice.currency !== "usd") {
      return NextResponse.json({ error: "invalid_currency" }, { status: 400 });
    }

    if (!invoice.totalUsd || invoice.totalUsd <= 0) {
      return NextResponse.json({ error: "invalid_total" }, { status: 400 });
    }

    // Validar que invoice tenga items
    if (!invoice.items?.length) {
      return NextResponse.json({ error: "invoice_no_items" }, { status: 400 });
    }

    // Validar cada item
    for (const item of invoice.items) {
      if (!Number.isFinite(item.totalUsd) || item.totalUsd <= 0) {
        return NextResponse.json({ error: "invalid_item_total" }, { status: 400 });
      }
    }

    // Validar coherencia de items
    const calculatedTotal = invoice.items.reduce(
      (sum, item) => sum + item.totalUsd,
      0
    );
    const tolerance = 0.01; // Permitir pequeñas diferencias por redondeo
    if (Math.abs(calculatedTotal - invoice.totalUsd) > tolerance) {
      return NextResponse.json({ error: "invoice_total_mismatch" }, { status: 400 });
    }

    // 6. Obtener ORIGIN
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      req.headers.get("origin") ||
      req.headers.get("referer")?.split("/").slice(0, 3).join("/") ||
      "http://localhost:3000";

    // 7. Crear Stripe Checkout Session
    const lineItems = invoice.items.map((item: InvoiceItem) => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: item.quantity !== 1
            ? `${item.description} (${item.quantity})`
            : item.description,
        },
        unit_amount: Math.round(item.totalUsd * 100), // Convertir a centavos
      },
      quantity: 1,
    }));

    let session;
    try {
      const stripe = getStripe();
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: lineItems,
        payment_method_types: ["card"],
        success_url: `${origin}/mi/pagos?success=1&invoiceId=${invoiceId}`,
        cancel_url: `${origin}/mi/pagos?canceled=1&invoiceId=${invoiceId}`,
        metadata: {
          invoiceId: invoiceId,
        },
      });
    } catch (e: any) {
      const errorMessage = e?.message || "Unknown Stripe API error";
      console.error("[admin/create-checkout-session] Stripe API error:", errorMessage);
      return NextResponse.json({ error: "stripe_api_error" }, { status: 500 });
    }

    // 8. Guardar stripeSessionId en Firestore (opcional, merge)
    try {
      await adminDb.collection("invoices").doc(invoiceId).update({
        stripeSessionId: session.id,
      });
    } catch (e: any) {
      console.error("[admin/create-checkout-session] Error updating invoice:", e?.message);
      // No fallar aquí - la sesión ya fue creada en Stripe
    }

    // 9. Validar que session.url existe
    if (!session.url) {
      console.error("[admin/create-checkout-session] Stripe session created but URL is missing");
      return NextResponse.json({ error: "stripe_missing_url" }, { status: 500 });
    }

    // 10. Responder con la URL de la sesión
    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("[admin/create-checkout-session] Unexpected error:", e);
    // Asegurar que siempre devolvemos JSON, nunca HTML
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

