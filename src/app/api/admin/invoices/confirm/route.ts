// src/app/api/admin/invoices/confirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { sendInvoiceReadyEmail } from "@/lib/email";
import type { Invoice, Client } from "@/types/lem";

export async function POST(req: NextRequest) {
  try {
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
      console.error("[admin/invoices/confirm] Token verification failed:", e?.message);
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // 2. Validar rol admin/superadmin
    const claims = decoded as any;
    const isAdmin =
      claims?.role === "admin" ||
      claims?.role === "superadmin" ||
      claims?.admin === true ||
      claims?.superadmin === true;
    if (!isAdmin) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // 3. Leer invoiceId del body
    let invoiceId: string;
    try {
      const body = await req.json();
      invoiceId = body.invoiceId;
      if (!invoiceId || typeof invoiceId !== "string") {
        return NextResponse.json({ error: "invalid_input" }, { status: 400 });
      }
    } catch (e: any) {
      console.error("[admin/invoices/confirm] Error parsing request body:", e?.message);
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    // 4. Leer invoice
    let invoiceDoc;
    try {
      invoiceDoc = await adminDb.collection("invoices").doc(invoiceId).get();
    } catch (e: any) {
      console.error("[admin/invoices/confirm] Error reading invoice:", e?.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (!invoiceDoc.exists) {
      return NextResponse.json({ error: "invoice_not_found" }, { status: 404 });
    }

    const invoiceData = invoiceDoc.data() as Invoice;
    const invoice: Invoice = {
      ...invoiceData,
      id: invoiceDoc.id,
    };

    // 5. Validar estado
    if (invoice.status === "paid" || invoice.status === "void") {
      return NextResponse.json(
        { error: "invoice_already_processed" },
        { status: 400 }
      );
    }

    // 6. Leer cliente para obtener email y name
    let clientDoc;
    try {
      clientDoc = await adminDb.collection("clients").doc(invoice.clientId).get();
    } catch (e: any) {
      console.error("[admin/invoices/confirm] Error reading client:", e?.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (!clientDoc.exists) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 });
    }

    const clientData = clientDoc.data() as Client;
    const clientEmail = clientData.email || clientData.emailAlt;
    const clientName = clientData.name || "Cliente";

    if (!clientEmail) {
      return NextResponse.json(
        { error: "client_missing_email" },
        { status: 400 }
      );
    }

    // 7. Actualizar invoice
    try {
      await adminDb.collection("invoices").doc(invoiceId).update({
        status: "open",
        publishedAt: Date.now(),
      });
    } catch (e: any) {
      console.error("[admin/invoices/confirm] Error updating invoice:", e?.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    // 8. Enviar email
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      req.headers.get("origin") ||
      req.headers.get("referer")?.split("/").slice(0, 3).join("/") ||
      "http://localhost:3000";

    const emailResult = await sendInvoiceReadyEmail({
      to: clientEmail,
      clientName,
      invoiceId,
      totalUsd: invoice.totalUsd,
      appUrl,
    });

    if (!emailResult.success) {
      // No fallar si el email falla - el invoice ya fue actualizado
      console.error(
        "[admin/invoices/confirm] Email send failed:",
        emailResult.error
      );
    }

    // 9. Responder éxito
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[admin/invoices/confirm] Unexpected error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

