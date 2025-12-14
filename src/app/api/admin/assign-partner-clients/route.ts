// src/app/api/admin/assign-partner-clients/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const me = await adminAuth.verifyIdToken(token);
    const isSuper = me?.superadmin === true || me?.role === "superadmin";
    if (!isSuper) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const { partnerUidOrDocId, managedClientIds } = await req.json();
    if (!partnerUidOrDocId || !Array.isArray(managedClientIds)) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    let partnerUid: string;

    // Intentar resolver partner UID real
    try {
      const user = await adminAuth.getUser(partnerUidOrDocId);
      partnerUid = user.uid;
    } catch (err: any) {
      const code = err?.code || err?.errorInfo?.code;
      if (code === "auth/user-not-found") {
        // Intentar leer desde users/{partnerUidOrDocId} o admins/{partnerUidOrDocId}
        const userSnap = await adminDb.collection("users").doc(partnerUidOrDocId).get();
        const adminSnap = await adminDb.collection("admins").doc(partnerUidOrDocId).get();
        
        let email: string | undefined;
        if (userSnap.exists) {
          email = (userSnap.data() as any)?.email;
        } else if (adminSnap.exists) {
          email = (adminSnap.data() as any)?.email;
        }
        
        if (!email) {
          return NextResponse.json({ error: "user_not_found" }, { status: 404 });
        }
        
        const byEmail = await adminAuth.getUserByEmail(email);
        partnerUid = byEmail.uid;
      } else {
        throw err;
      }
    }

    // Validar que los clientIds existen (opcional pero recomendado)
    const uniqueClientIds = Array.from(new Set(managedClientIds.filter((id: any) => typeof id === "string" && id.trim())));
    
    // Setear/mergear users/{partnerUid}.managedClientIds
    await adminDb.collection("users").doc(partnerUid).set(
      {
        managedClientIds: uniqueClientIds,
        role: "partner_admin", // Asegurar que el role esté correcto
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, partnerUid, count: uniqueClientIds.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 });
  }
}

