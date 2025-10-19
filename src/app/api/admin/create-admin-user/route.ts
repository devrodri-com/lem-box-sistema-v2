// src/app/api/admin/create-admin-user/route.ts
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

    const { email, password, name, permissions } = await req.json();
    if (!email || !password || String(password).length < 8) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const user = await adminAuth.createUser({ email, password, displayName: name ?? "" });

    await adminAuth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), admin: true, permissions });

    await adminDb.collection("admins").doc(user.uid).set({
      email,
      name: name ?? "",
      role: "admin",
      permissions: permissions ?? {},
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, uid: user.uid });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 });
  }
}