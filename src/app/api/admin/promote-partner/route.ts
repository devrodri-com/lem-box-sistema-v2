// src/app/api/admin/promote-partner/route.ts
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

    const { email: rawEmail } = await req.json();
    const email = String(rawEmail || "").trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    // Obtener usuario por email
    const user = await adminAuth.getUserByEmail(email);

    // Setear custom claims
    await adminAuth.setCustomUserClaims(user.uid, {
      ...(user.customClaims || {}),
      role: "partner_admin",
      superadmin: false,
    });

    // Upsert users/{uid}
    await adminDb.collection("users").doc(user.uid).set(
      {
        email: user.email || email,
        displayName: user.displayName || "",
        role: "partner_admin",
        clientId: FieldValue.delete(), // Asegurar que no sea tratado como cliente
        updatedAt: FieldValue.serverTimestamp(),
        ...(user.metadata.creationTime ? { createdAt: new Date(user.metadata.creationTime) } : {}),
      },
      { merge: true }
    );

    // Upsert admins/{uid}
    await adminDb.collection("admins").doc(user.uid).set(
      {
        email: user.email || email,
        name: user.displayName || "",
        role: "partner_admin",
        // permissions NO obligatorias en esta fase
        updatedAt: FieldValue.serverTimestamp(),
        ...(user.metadata.creationTime ? { createdAt: new Date(user.metadata.creationTime) } : {}),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, uid: user.uid });
  } catch (e: any) {
    const code = e?.code || e?.errorInfo?.code;
    if (code === "auth/user-not-found") {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 });
  }
}

