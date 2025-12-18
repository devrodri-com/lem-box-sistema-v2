// src/app/api/admin/delete-client/route.ts
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

    const { clientId } = await req.json();
    if (!clientId || typeof clientId !== "string") {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    // Borrar con Admin SDK
    await adminDb.collection("clients").doc(clientId).delete();

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 });
  }
}

