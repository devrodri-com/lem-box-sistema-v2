// src/app/api/admin/update-admin-user/route.ts
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

    const { uid, name, permissions } = await req.json();
    const safeName = typeof name === "string" ? name.trim() : "";
    if (!uid) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

    let targetUid = String(uid);
    let targetEmail: string | undefined;

    // Resolve legacy admin docs whose id is not the Auth UID
    let ur;
    try {
      ur = await adminAuth.getUser(targetUid);
      targetEmail = ur.email || undefined;
    } catch (err: any) {
      const code = err?.code || err?.errorInfo?.code;
      if (code === "auth/user-not-found") {
        const adminSnap = await adminDb.collection("admins").doc(targetUid).get();
        const emailFromDoc = adminSnap.exists ? String((adminSnap.data() as any)?.email || "").trim().toLowerCase() : "";
        if (!emailFromDoc) {
          return NextResponse.json({ error: "user_not_found" }, { status: 404 });
        }
        const byEmail = await adminAuth.getUserByEmail(emailFromDoc);
        ur = byEmail;
        targetUid = byEmail.uid;
        targetEmail = byEmail.email || emailFromDoc;

        // Ensure there's an admins doc at the canonical uid too
        await adminDb.collection("admins").doc(targetUid).set(
          {
            email: targetEmail,
            role: "admin",
            ...(safeName ? { name: safeName } : {}),
            ...(permissions ? { permissions } : {}),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        throw err;
      }
    }

    // actualizar displayName si vino
    if (safeName) await adminAuth.updateUser(targetUid, { displayName: safeName });

    // Canonical auth role for route guards (do not store full permissions in claims)
    await adminAuth.setCustomUserClaims(targetUid, {
      ...(ur?.customClaims || {}),
      role: "admin",
      superadmin: false,
    });

    // Ensure canonical user profile exists and not as client
    await adminDb.collection("users").doc(targetUid).set(
      {
        ...(safeName ? { displayName: safeName } : {}),
        role: "admin",
        clientId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // actualizar doc en Firestore (admins)
    await adminDb.collection("admins").doc(targetUid).set(
      {
        ...(safeName ? { name: safeName } : {}),
        ...(permissions ? { permissions } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, uid: targetUid });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 });
  }
}