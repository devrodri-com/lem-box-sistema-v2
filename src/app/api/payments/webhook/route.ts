// src/app/api/payments/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { adminDb } from "@/lib/firebaseAdmin";
import type { Invoice } from "@/types/lem";

export async function POST(req: NextRequest) {
  try {
    // 1. Leer body raw (no JSON)
    const rawBody = await req.text();
    const sig = req.headers.get("stripe-signature");
    
    if (!sig) {
      return NextResponse.json({ error: "missing_signature" }, { status: 400 });
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[webhook] STRIPE_WEBHOOK_SECRET not configured");
      return NextResponse.json({ error: "webhook_not_configured" }, { status: 500 });
    }

    // 2. Validar firma con Stripe
    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err: any) {
      console.error("[webhook] Signature verification failed:", err.message);
      return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
    }

    // 3. Loggear event type en development
    if (process.env.NODE_ENV === "development") {
      console.log("[webhook] Event type:", event.type);
    }

    // 4. Manejar eventos
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as any;
      const invoiceId = session.metadata?.invoiceId;

      if (!invoiceId || typeof invoiceId !== "string") {
        console.error("[webhook] Missing invoiceId in metadata");
        return NextResponse.json({ error: "missing_invoice_id" }, { status: 400 });
      }

      // Validar que el invoice existe
      const invoiceDoc = await adminDb.collection("invoices").doc(invoiceId).get();
      if (!invoiceDoc.exists) {
        console.error("[webhook] Invoice not found:", invoiceId);
        return NextResponse.json({ error: "invoice_not_found" }, { status: 404 });
      }

      const invoiceData = invoiceDoc.data() as Invoice;
      
      // Idempotencia: no actualizar si ya está paid o void
      if (invoiceData.status === "paid") {
        if (process.env.NODE_ENV === "development") {
          console.log("[webhook] Invoice already paid, skipping update:", invoiceId);
        }
        return NextResponse.json({ received: true });
      }

      // No permitir que un evento cambie una invoice void a paid
      if (invoiceData.status === "void") {
        if (process.env.NODE_ENV === "development") {
          console.log("[webhook] Invoice is void, skipping update:", invoiceId);
        }
        return NextResponse.json({ received: true });
      }

      // Actualizar invoice
      const updateData: Partial<Invoice> = {
        status: "paid",
        paidAt: Date.now(),
      };

      // Guardar stripePaymentIntentId si viene
      if (session.payment_intent && typeof session.payment_intent === "string") {
        updateData.stripePaymentIntentId = session.payment_intent;
      }

      // Guardar stripeSessionId si no estaba
      if (!invoiceData.stripeSessionId && session.id) {
        updateData.stripeSessionId = session.id;
      }

      await adminDb.collection("invoices").doc(invoiceId).update(updateData);

      if (process.env.NODE_ENV === "development") {
        console.log("[webhook] Invoice updated to paid:", invoiceId);
      }
    }

    // 5. Responder 200
    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error("[webhook] Error:", e);
    return NextResponse.json(
      { error: e?.message || "unknown_error" },
      { status: 500 }
    );
  }
}

