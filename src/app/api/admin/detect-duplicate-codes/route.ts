// src/app/api/admin/detect-duplicate-codes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const me = await adminAuth.verifyIdToken(token);
    const claims = (me as unknown) as { superadmin?: boolean; role?: string };
    const isSuper = Boolean(claims?.superadmin === true || claims?.role === "superadmin");
    const isAdmin = isSuper || claims?.role === "admin";
    if (!isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    // Cargar todos los clientes
    const clientsSnap = await adminDb.collection("clients").get();

    // Agrupar por code
    const byCode: Record<string, Array<{ id: string; name?: string; code: string }>> = {};

    clientsSnap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const code = typeof data.code === "string" ? data.code : "";
      const name = typeof data.name === "string" ? data.name : undefined;

      if (!code) return; // Ignorar clientes sin code

      if (!byCode[code]) {
        byCode[code] = [];
      }
      byCode[code].push({
        id: docSnap.id,
        name,
        code,
      });
    });

    // Encontrar duplicados (codes con más de 1 cliente)
    const duplicates: Record<string, Array<{ id: string; name?: string; code: string }>> = {};
    for (const [code, clients] of Object.entries(byCode)) {
      if (clients.length > 1) {
        duplicates[code] = clients;
      }
    }

    // Estadísticas
    const totalClients = clientsSnap.size;
    const duplicateCodes = Object.keys(duplicates);
    const totalDuplicateClients = Object.values(duplicates).reduce((sum, arr) => sum + arr.length, 0);

    return NextResponse.json({
      ok: true,
      stats: {
        totalClients,
        duplicateCodesCount: duplicateCodes.length,
        totalDuplicateClients,
      },
      duplicates,
      // Lista plana para facilitar el consumo
      duplicateList: Object.entries(duplicates).map(([code, clients]) => ({
        code,
        clientIds: clients.map((c) => c.id),
        clients: clients.map((c) => ({ id: c.id, name: c.name })),
      })),
    });
  } catch (e: any) {
    console.error("Error detecting duplicate codes:", e);
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 });
  }
}

