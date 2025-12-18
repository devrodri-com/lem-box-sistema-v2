#!/usr/bin/env tsx
// scripts/sync-all-partners-managed-client-ids.ts
// Sincroniza managedClientIds para todos los partners basado en clientes donde managerUid == partnerUid
import * as admin from "firebase-admin";

// Inicializar Firebase Admin
let app: admin.app.App;
try {
  // Intentar usar serviceAccount.json si existe
  const serviceAccount = require("../serviceAccount.json");
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} catch (e) {
  // Fallback a Application Default Credentials
  app = admin.initializeApp();
}

const db = admin.firestore();

async function syncPartner(partnerUid: string) {
  // Consultar todos los clientes donde managerUid == partnerUid
  const clientsSnap = await db
    .collection("clients")
    .where("managerUid", "==", partnerUid)
    .get();

  const managedClientIds = clientsSnap.docs.map((d) => d.id);

  // Actualizar users/{partnerUid}.managedClientIds
  await db.collection("users").doc(partnerUid).set(
    {
      managedClientIds,
      role: "partner_admin",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { partnerUid, count: managedClientIds.length };
}

async function main() {
  console.log("Sincronizando managedClientIds para todos los partners...\n");

  try {
    // 1. Obtener todos los usuarios con role == "partner_admin"
    const usersSnap = await db
      .collection("users")
      .where("role", "==", "partner_admin")
      .get();

    console.log(`Encontrados ${usersSnap.size} partners con role == "partner_admin"`);

    // 2. También obtener partners desde clientes (por si hay partners sin users/{uid})
    const clientsSnap = await db
      .collection("clients")
      .where("managerUid", "!=", null)
      .get();

    const partnerUidsFromClients = new Set<string>();
    clientsSnap.docs.forEach((d) => {
      const managerUid = d.data()?.managerUid;
      if (typeof managerUid === "string" && managerUid) {
        partnerUidsFromClients.add(managerUid);
      }
    });

    console.log(`Encontrados ${partnerUidsFromClients.size} partners únicos desde clientes\n`);

    // 3. Combinar ambos sets
    const allPartnerUids = new Set<string>();
    usersSnap.docs.forEach((d) => allPartnerUids.add(d.id));
    partnerUidsFromClients.forEach((uid) => allPartnerUids.add(uid));

    console.log(`Total de partners únicos a sincronizar: ${allPartnerUids.size}\n`);

    // 4. Sincronizar cada partner
    const results: Array<{ partnerUid: string; count: number }> = [];
    for (const partnerUid of allPartnerUids) {
      try {
        const result = await syncPartner(partnerUid);
        results.push(result);
        console.log(`✅ ${partnerUid}: ${result.count} clientes`);
      } catch (err) {
        console.error(`❌ Error sincronizando ${partnerUid}:`, err);
      }
    }

    // 5. Resumen
    console.log(`\n=== Resumen ===`);
    console.log(`Partners sincronizados: ${results.length}`);
    console.log(`Total clientes asignados: ${results.reduce((sum, r) => sum + r.count, 0)}`);
    console.log(`Promedio clientes por partner: ${results.length > 0 ? (results.reduce((sum, r) => sum + r.count, 0) / results.length).toFixed(1) : 0}`);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

void main();

