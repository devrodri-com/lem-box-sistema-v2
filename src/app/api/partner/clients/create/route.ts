// src/app/api/partner/clients/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const me = await adminAuth.verifyIdToken(token);
    const uid = me.uid;

    // Verificar que sea partner_admin (en claims o en users/{uid})
    const claims = (me as unknown) as { role?: string };
    let isPartnerAdmin = claims?.role === "partner_admin";
    
    if (!isPartnerAdmin) {
      // Verificar en Firestore users/{uid}
      const userSnap = await adminDb.collection("users").doc(uid).get();
      if (userSnap.exists) {
        const userData = userSnap.data() as { role?: string } | undefined;
        isPartnerAdmin = userData?.role === "partner_admin";
      }
    }

    if (!isPartnerAdmin) {
      return NextResponse.json({ error: "forbidden: partner_admin required" }, { status: 403 });
    }

    const body = await req.json();
    const {
      name,
      country,
      email,
      phone,
      address,
      state,
      city,
      postalCode,
      contact,
      docType,
      docNumber,
      emailAlt,
    } = body;

    // Validación de campos obligatorios
    if (!name || typeof name !== "string" || !country || typeof country !== "string") {
      return NextResponse.json({ error: "invalid_input: name and country are required" }, { status: 400 });
    }

    // Generar código único usando transacción (mismo sistema que admin)
    const counterRef = adminDb.collection("counters").doc("clients");
    let nextCode: string | undefined;
    let maxRetries = 10;

    while (maxRetries > 0) {
      // Incrementar contador en transacción (garantiza secuencialidad)
      const result = await adminDb.runTransaction(async (tx) => {
        const counterSnap = await tx.get(counterRef);
        let currSeq = 1200;
        if (counterSnap.exists) {
          const data = counterSnap.data() as { seq?: number } | undefined;
          if (typeof data?.seq === "number") {
            currSeq = data.seq;
          }
        }
        const nextSeq = currSeq + 1;
        tx.set(counterRef, { seq: nextSeq }, { merge: true });
        return nextSeq;
      });

      const candidateCode = String(result);

      // Verificar que no exista duplicado
      const existingSnap = await adminDb
        .collection("clients")
        .where("code", "==", candidateCode)
        .limit(1)
        .get();

      if (existingSnap.empty) {
        // Código disponible
        nextCode = candidateCode;
        break;
      }

      // Código ocupado, reintentar
      maxRetries--;
      if (maxRetries === 0) {
        throw new Error("No se pudo generar un código único después de 10 intentos");
      }
    }

    if (!nextCode) {
      throw new Error("No se pudo generar un código único");
    }

    // Crear documento del cliente con managerUid automático
    const clientData: Record<string, unknown> = {
      code: nextCode!,
      name: String(name).trim(),
      country: String(country).trim(),
      managerUid: uid, // Partner admin siempre asigna su propio UID
      activo: true,
      createdAt: FieldValue.serverTimestamp(),
    };

    if (email && typeof email === "string") clientData.email = email.trim();
    if (phone && typeof phone === "string") clientData.phone = phone.trim();
    if (address && typeof address === "string") clientData.address = address.trim();
    if (state && typeof state === "string") clientData.state = state.trim();
    if (city && typeof city === "string") clientData.city = city.trim();
    if (postalCode && typeof postalCode === "string") clientData.postalCode = postalCode.trim();
    if (contact && typeof contact === "string") clientData.contact = contact.trim();
    if (docType && typeof docType === "string") clientData.docType = docType.trim();
    if (docNumber && typeof docNumber === "string") clientData.docNumber = docNumber.trim();
    if (emailAlt && typeof emailAlt === "string") clientData.emailAlt = emailAlt.trim();

    const clientRef = await adminDb.collection("clients").add(clientData);
    const clientId = clientRef.id;

    return NextResponse.json({ ok: true, clientId, code: nextCode });
  } catch (e: any) {
    console.error("Error creating client (partner):", e);
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 });
  }
}

