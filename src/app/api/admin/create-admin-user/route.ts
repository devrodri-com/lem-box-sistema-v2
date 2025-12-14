// src/app/api/admin/create-admin-user/route.ts
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

    const { email: rawEmail, password, name, permissions } = await req.json();
    const email = String(rawEmail || "").trim().toLowerCase();
    if (!email || !password || String(password).length < 8) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const user = await adminAuth.createUser({ email, password, displayName: name ?? "" });

    // Canonical auth role for route guards (do not store full permissions in claims)
    await adminAuth.setCustomUserClaims(user.uid, {
      ...(user.customClaims || {}),
      role: "admin",
      superadmin: false,
    });

    await adminDb.collection("users").doc(user.uid).set(
      {
        email,
        displayName: name ?? "",
        role: "admin",
        // Important: admins should not be treated as clients
        clientId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await adminDb.collection("admins").doc(user.uid).set(
      {
        email,
        name: name ?? "",
        role: "admin",
        permissions: permissions ?? {},
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, uid: user.uid });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 });
  }
}