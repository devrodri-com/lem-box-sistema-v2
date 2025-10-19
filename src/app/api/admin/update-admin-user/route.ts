// src/app/api/admin/update-admin-user/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const me = await adminAuth.verifyIdToken(token);
    const isSuper = me?.superadmin === true || me?.role === "superadmin";
    if (!isSuper) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const { uid, name, permissions } = await req.json();
    if (!uid) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

    // actualizar displayName si vino
    if (name) await adminAuth.updateUser(uid, { displayName: name });

    // merge claims previos + admin true + permissions
    const ur = await adminAuth.getUser(uid);
    await adminAuth.setCustomUserClaims(uid, {
      ...(ur.customClaims || {}),
      admin: true,
      permissions: permissions ?? (ur.customClaims?.permissions || {}),
    });

    // actualizar doc en Firestore
    await adminDb.collection("admins").doc(uid).set(
      {
        ...(name ? { name } : {}),
        ...(permissions ? { permissions } : {}),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 });
  }
}