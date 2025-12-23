// src/app/api/admin/bootstrap-all-clients/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import admin from "firebase-admin";

function generateRandomPassword(): string {
  // Genera una contraseña aleatoria de 16 caracteres
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[bootstrap-all-clients] Token verification failed:", msg);
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // 2. Verificar que es superadmin
    const claims = decoded as Record<string, unknown>;
    if (claims?.superadmin !== true && claims?.role !== "superadmin") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // 3. Leer parámetros del body (opcional: batchSize, startAfterId)
    let body: { batchSize?: number; startAfterId?: string };
    try {
      body = await req.json();
    } catch (e: unknown) {
      // Si no hay body, usar defaults
      body = {};
    }

    const batchSize = Math.min(Math.max(1, body.batchSize || 200), 400);
    const startAfterId = typeof body.startAfterId === "string" && body.startAfterId.trim() ? body.startAfterId.trim() : undefined;

    // 4. Construir query usando Admin SDK
    let q = adminDb.collection("clients").orderBy(admin.firestore.FieldPath.documentId()).limit(batchSize);

    if (startAfterId) {
      const startAfterDoc = adminDb.collection("clients").doc(startAfterId);
      const startAfterSnap = await startAfterDoc.get();
      if (!startAfterSnap.exists) {
        return NextResponse.json({ error: "startAfterId not found" }, { status: 400 });
      }
      q = q.startAfter(startAfterSnap);
    }

    const clientsSnap = await q.get();
    const clients = clientsSnap.docs;

    let processed = 0;
    let linked = 0;
    let created = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    // 5. Procesar cada cliente
    for (const clientDoc of clients) {
      processed++;
      const clientId = clientDoc.id;
      const clientData = clientDoc.data() as Record<string, unknown>;
      
      // Obtener email (email o emailAlt)
      const email = typeof clientData.email === "string" ? clientData.email.trim().toLowerCase() : "";
      const emailAlt = typeof clientData.emailAlt === "string" ? clientData.emailAlt.trim().toLowerCase() : "";
      const finalEmail = email || emailAlt;

      if (!finalEmail) {
        skipped++;
        continue;
      }

      try {
        // Buscar usuario por email
        let user;
        try {
          user = await adminAuth.getUserByEmail(finalEmail);
        } catch (e: unknown) {
          const err = e as { code?: string };
          if (err?.code !== "auth/user-not-found") {
            throw e;
          }
        }

        // Si no existe, crearlo
        if (!user) {
          const randomPassword = generateRandomPassword();
          user = await adminAuth.createUser({
            email: finalEmail,
            password: randomPassword,
            emailVerified: false,
            disabled: false,
          });
          created++;
        } else {
          // Guard: verificar que no sea cuenta interna antes de modificar claims
          const existingUser = await adminAuth.getUser(user.uid);
          const existingClaims = existingUser.customClaims as Record<string, unknown> | undefined;
          
          if (existingClaims) {
            const isAdmin = existingClaims.admin === true;
            const isSuperadmin = existingClaims.superadmin === true;
            const role = existingClaims.role;
            const isInternalRole = role === "admin" || role === "superadmin" || role === "partner_admin";
            
            if (isAdmin || isSuperadmin || isInternalRole) {
              skipped++;
              continue;
            }
          }
          
          linked++;
        }

        // Crear/mergear users/{uid} en Firestore
        await adminDb.collection("users").doc(user.uid).set(
          {
            role: "client",
            clientId: clientId,
            email: finalEmail,
            uid: user.uid,
          },
          { merge: true }
        );

        // Asegurar claims en Auth (solo si pasó el guard)
        await adminAuth.setCustomUserClaims(user.uid, {
          role: "client",
          clientId: clientId,
        });
      } catch (e: unknown) {
        errors++;
        const msg = e instanceof Error ? e.message : String(e);
        errorDetails.push(`Client ${clientId} (${finalEmail}): ${msg}`);
        console.error(`[bootstrap-all-clients] Error processing client ${clientId}:`, msg);
      }
    }

    const lastId = clients.length > 0 ? clients[clients.length - 1].id : null;
    const hasMore = clients.length === batchSize;

    return NextResponse.json({
      ok: true,
      processed,
      linked,
      created,
      skipped,
      errors,
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
      lastId,
      hasMore,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[bootstrap-all-clients] Unexpected error:", msg);
    return NextResponse.json({ error: "internal_error", message: msg }, { status: 500 });
  }
}

