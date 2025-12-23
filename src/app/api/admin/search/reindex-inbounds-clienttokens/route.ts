// src/app/api/admin/search/reindex-inbounds-clienttokens/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { buildClientTokens } from "@/lib/searchTokens";
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
      console.error("[reindex-inbounds-clienttokens] Token verification failed:", e?.message);
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
      console.error("[reindex-inbounds-clienttokens] Error parsing request body:", e?.message);
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
    // Primero identificar inbounds que necesitan tokens
    const inboundsToProcess: Array<{ docId: string; clientId: string; data: any }> = [];
    let skipped = 0;

    for (const docSnap of docs) {
      const data = docSnap.data();
      const docId = docSnap.id;

      // Skip si ya tiene clientTokens array no vacío
      if (Array.isArray(data.clientTokens) && data.clientTokens.length > 0) {
        skipped++;
        continue;
      }

      // Skip si no tiene clientId o tracking
      if (!data.clientId || typeof data.clientId !== "string") {
        skipped++;
        continue;
      }
      if (!data.tracking || typeof data.tracking !== "string") {
        skipped++;
        continue;
      }

      inboundsToProcess.push({ docId, clientId: data.clientId, data });
    }

    // 7. Cargar clients en batch para los clientIds únicos
    const clientIds = Array.from(new Set(inboundsToProcess.map((i) => i.clientId)));
    const clientsById: Record<string, any> = {};

    if (clientIds.length > 0) {
      try {
        // Chunking de clientIds (máximo 10 por query)
        const chunks: string[][] = [];
        for (let i = 0; i < clientIds.length; i += 10) {
          chunks.push(clientIds.slice(i, i + 10));
        }

        for (const chunk of chunks) {
          const clientSnap = await adminDb
            .collection("clients")
            .where(admin.firestore.FieldPath.documentId(), "in", chunk)
            .get();
          
          clientSnap.docs.forEach((doc) => {
            clientsById[doc.id] = doc.data();
          });
        }
      } catch (e: any) {
        console.error("[reindex-inbounds-clienttokens] Error loading clients:", e?.message);
        // Continuar con los clients que se pudieron cargar
      }
    }

    // 8. Generar tokens y preparar batch update
    const batch = adminDb.batch();
    let updated = 0;

    for (const inbound of inboundsToProcess) {
      const client = clientsById[inbound.clientId];
      
      if (!client) {
        // Cliente no encontrado, skip
        skipped++;
        continue;
      }

      // Generar tokens
      const tokens = buildClientTokens(
        client?.name,
        client?.code,
        client?.email ?? client?.emailAlt
      );

      // Validar que tokens sea un array
      if (!Array.isArray(tokens)) {
        skipped++;
        continue;
      }

      // Preparar update
      const docRef = adminDb.collection("inboundPackages").doc(inbound.docId);
      batch.update(docRef, {
        clientTokens: tokens,
      });

      updated++;
    }

    // 9. Commit batch (máximo 500 operaciones por batch)
    if (updated > 0) {
      await batch.commit();
    }

    // 10. Responder
    const lastDoc = docs[docs.length - 1];
    const lastId = lastDoc ? lastDoc.id : null;
    const hasMore = docs.length === batchSize;

    return NextResponse.json({
      ok: true,
      processed: docs.length,
      updated,
      skipped: skipped + (inboundsToProcess.length - updated),
      lastId,
      hasMore,
    });
  } catch (e: any) {
    console.error("[reindex-inbounds-clienttokens] Unexpected error:", e);
    // Asegurar que siempre devolvemos JSON, nunca HTML
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

