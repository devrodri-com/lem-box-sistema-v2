// src/app/api/admin/fix-duplicate-codes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

type ProposedChange = {
  oldCode: string;
  keepClientId: string;
  recode: Array<{ clientId: string; newCode: string }>;
};

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const me = await adminAuth.verifyIdToken(token);
    const claims = (me as unknown) as { superadmin?: boolean; role?: string };
    const isSuper = Boolean(claims?.superadmin === true || claims?.role === "superadmin");
    if (!isSuper) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const body = (await req.json()) as { dryRun?: boolean };
    const dryRun = body.dryRun !== false; // default true

    // 1. Leer todos los clients
    const clientsSnap = await adminDb.collection("clients").get();

    // 2. Agrupar por code (normalizar a string)
    const byCode: Record<string, Array<{
      id: string;
      code: string;
      createdAt?: number;
      name?: string;
    }>> = {};

    clientsSnap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const code = typeof data.code === "string" ? data.code : (typeof data.code === "number" ? String(data.code) : "");
      if (!code) return; // Ignorar sin code

      if (!byCode[code]) {
        byCode[code] = [];
      }
      byCode[code].push({
        id: docSnap.id,
        code,
        createdAt: typeof data.createdAt === "number" ? data.createdAt : undefined,
        name: typeof data.name === "string" ? data.name : undefined,
      });
    });

    // 3. Identificar duplicados y elegir cuál mantener
    const proposedChanges: ProposedChange[] = [];

    for (const [code, clients] of Object.entries(byCode)) {
      if (clients.length <= 1) continue; // No es duplicado

      // Ordenar por createdAt (más antiguo primero, undefined al final)
      const sorted = [...clients].sort((a, b) => {
        const aTime = a.createdAt ?? Number.MAX_SAFE_INTEGER;
        const bTime = b.createdAt ?? Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });

      const keepClient = sorted[0]; // El más antiguo
      const toRecode = sorted.slice(1); // Los demás

      if (toRecode.length === 0) continue;

      proposedChanges.push({
        oldCode: code,
        keepClientId: keepClient.id,
        recode: toRecode.map((c) => ({ clientId: c.id, newCode: "" })), // newCode se asignará después
      });
    }

    // Si dryRun, devolver los cambios propuestos
    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        totalDuplicateCodes: proposedChanges.length,
        totalClientsToRecode: proposedChanges.reduce((sum, pc) => sum + pc.recode.length, 0),
        changes: proposedChanges.map((pc) => ({
          oldCode: pc.oldCode,
          keepClientId: pc.keepClientId,
          recode: pc.recode.map((r) => ({ clientId: r.clientId })),
        })),
      });
    }

    // 4. Modo real: generar nuevos códigos y actualizar
    const counterRef = adminDb.collection("counters").doc("clients");

    // Asignar nuevos códigos a cada cliente a recodificar
    for (const change of proposedChanges) {
      for (const recodeItem of change.recode) {
        let maxRetries = 10;
        let newCode: string | undefined;

        while (maxRetries > 0) {
          // Incrementar contador en transacción
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
            newCode = candidateCode;
            break;
          }

          maxRetries--;
          if (maxRetries === 0) {
            throw new Error(`No se pudo generar código único para cliente ${recodeItem.clientId}`);
          }
        }

        if (!newCode) {
          throw new Error(`No se pudo generar código único para cliente ${recodeItem.clientId}`);
        }

        recodeItem.newCode = newCode;
      }
    }

    // 5. Actualizar documentos en batches de 500
    const BATCH_SIZE = 500;
    let updatedCount = 0;
    let currentBatch = adminDb.batch();
    let batchCount = 0;

    for (const change of proposedChanges) {
      for (const recodeItem of change.recode) {
        const clientRef = adminDb.collection("clients").doc(recodeItem.clientId);
        
        currentBatch.update(clientRef, {
          code: recodeItem.newCode,
          legacyCodes: FieldValue.arrayUnion(change.oldCode),
          updatedAt: Date.now(),
        });

        updatedCount++;
        batchCount++;

        // Si alcanzamos el tamaño de batch, hacer commit
        if (batchCount >= BATCH_SIZE) {
          await currentBatch.commit();
          currentBatch = adminDb.batch();
          batchCount = 0;
        }
      }
    }

    // Commit del batch final si hay operaciones pendientes
    if (batchCount > 0) {
      await currentBatch.commit();
    }

    return NextResponse.json({
      ok: true,
      dryRun: false,
      fixedCodesCount: proposedChanges.length,
      updatedClientsCount: updatedCount,
      summary: `Se actualizaron ${updatedCount} clientes con códigos duplicados.`,
    });
  } catch (e: any) {
    console.error("Error fixing duplicate codes:", e);
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 });
  }
}

