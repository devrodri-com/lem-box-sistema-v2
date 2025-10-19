// src/app/api/admin/update-client-password/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const authz = req.headers.get("authorization") || "";
    const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!token) return NextResponse.json({ error: "missing_token" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const claims = decoded as any;
    const isSuper = claims?.role === "superadmin" || claims?.superadmin === true || claims?.admin === true;
    if (!isSuper) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const { clientId, newPassword } = await req.json();
    if (!clientId || !newPassword || String(newPassword).length < 8) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const ref = adminDb.collection("clients").doc(String(clientId));
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "client_not_found" }, { status: 404 });

    const data = snap.data() as any;
    const email: string | undefined = data?.email;
    if (!email) return NextResponse.json({ error: "client_missing_email" }, { status: 400 });

    // 1) Buscar usuario por email
    let user;
    try {
      user = await adminAuth.getUserByEmail(email);
    } catch (e: any) {
      if (e?.code !== "auth/user-not-found") throw e;
    }

    // 2) Si no existe, crearlo y asignar claims
    if (!user) {
      user = await adminAuth.createUser({
        email,
        password: String(newPassword),
        emailVerified: false,
        disabled: false,
      });
      await adminAuth.setCustomUserClaims(user.uid, { role: "client", clientId: String(clientId) });
      await ref.set({ authUid: user.uid }, { merge: true });
      return NextResponse.json({ ok: true, created: true });
    }

    // 3) Si existe, actualizar password y asegurar claims
    await adminAuth.updateUser(user.uid, { password: String(newPassword) });
    await adminAuth.setCustomUserClaims(user.uid, {
      ...(user.customClaims || {}),
      role: "client",
      clientId: String(clientId),
    });
    await ref.set({ authUid: user.uid }, { merge: true });

    return NextResponse.json({ ok: true, created: false });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 });
  }
}