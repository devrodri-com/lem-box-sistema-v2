// src/app/api/admin/search/reindex-inbounds/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { buildTrackingTokens } from "@/lib/searchTokens";
import admin from "firebase-admin";

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
      console.error("[reindex-inbounds] Token verification failed:", e?.message);
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // 2. Verificar que es superadmin
    const claims = decoded as any;
    if (claims?.superadmin !== true && claims?.role !== "superadmin") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // 3. Leer parámetros del body
    let body: { batchSize?: number; startAfterId?: string };
    try {
      body = await req.json();
    } catch (e: any) {
      console.error("[reindex-inbounds] Error parsing request body:", e?.message);
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const batchSize = Math.min(Math.max(1, body.batchSize || 200), 400);
    const startAfterId = typeof body.startAfterId === "string" && body.startAfterId.trim() ? body.startAfterId.trim() : undefined;

    // 4. Construir query usando Admin SDK
    let q = adminDb.collection("inboundPackages").orderBy(admin.firestore.FieldPath.documentId()).limit(batchSize);

    if (startAfterId) {
      const startAfterDoc = adminDb.collection("inboundPackages").doc(startAfterId);
      const startAfterSnap = await startAfterDoc.get();
      if (!startAfterSnap.exists) {
        return NextResponse.json({ error: "startAfterId not found" }, { status: 400 });
      }
      q = q.startAfter(startAfterSnap);
    }

    // 5. Ejecutar query
    const snapshot = await q.get();
    const docs = snapshot.docs;

    if (docs.length === 0) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        updated: 0,
        skipped: 0,
        lastId: null,
        hasMore: false,
      });
    }

    // 6. Procesar documentos
    const batch = adminDb.batch();
    let updated = 0;
    let skipped = 0;

    for (const docSnap of docs) {
      const data = docSnap.data();
      const docId = docSnap.id;

      // Skip si ya tiene trackingTokens array no vacío
      if (Array.isArray(data.trackingTokens) && data.trackingTokens.length > 0) {
        skipped++;
        continue;
      }

      // Skip si no tiene tracking o no es string
      if (!data.tracking || typeof data.tracking !== "string") {
        skipped++;
        continue;
      }

      // Calcular tokens
      const { trackingNorm, trackingTokens } = buildTrackingTokens(data.tracking);

      // Preparar update
      const docRef = adminDb.collection("inboundPackages").doc(docId);
      batch.update(docRef, {
        trackingNorm,
        trackingTokens,
      });

      updated++;
    }

    // 7. Commit batch (máximo 500 operaciones por batch)
    if (updated > 0) {
      await batch.commit();
    }

    // 8. Responder
    const lastDoc = docs[docs.length - 1];
    const lastId = lastDoc ? lastDoc.id : null;
    const hasMore = docs.length === batchSize;

    return NextResponse.json({
      ok: true,
      processed: docs.length,
      updated,
      skipped,
      lastId,
      hasMore,
    });
  } catch (e: any) {
    console.error("[reindex-inbounds] Unexpected error:", e);
    // Asegurar que siempre devolvemos JSON, nunca HTML
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

