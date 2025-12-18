#!/usr/bin/env tsx
// scripts/verify-partner-managed-client-ids.ts
// Verifica que los partners tengan managedClientIds poblado correctamente
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

async function verifyPartner(partnerUid: string) {
  console.log(`\n=== Verificando partner: ${partnerUid} ===`);

  // 1. Leer users/{partnerUid}
  const userSnap = await db.collection("users").doc(partnerUid).get();
  if (!userSnap.exists) {
    console.log(`❌ users/${partnerUid} NO existe`);
    return;
  }

  const userData = userSnap.data();
  const managedClientIds = userData?.managedClientIds;
  const role = userData?.role;

  console.log(`Role: ${role || "undefined"}`);
  console.log(`managedClientIds en users/: ${Array.isArray(managedClientIds) ? managedClientIds.length : 0} items`);
  if (Array.isArray(managedClientIds) && managedClientIds.length > 0) {
    console.log(`  IDs: ${managedClientIds.slice(0, 5).join(", ")}${managedClientIds.length > 5 ? "..." : ""}`);
  }

  // 2. Consultar clientes donde managerUid == partnerUid
  const clientsSnap = await db
    .collection("clients")
    .where("managerUid", "==", partnerUid)
    .get();

  const clientIdsFromQuery = clientsSnap.docs.map((d) => d.id);
  console.log(`Clientes con managerUid == ${partnerUid}: ${clientIdsFromQuery.length}`);
  if (clientIdsFromQuery.length > 0) {
    console.log(`  IDs: ${clientIdsFromQuery.slice(0, 5).join(", ")}${clientIdsFromQuery.length > 5 ? "..." : ""}`);
  }

  // 3. Comparar
  const managedSet = new Set(Array.isArray(managedClientIds) ? managedClientIds : []);
  const querySet = new Set(clientIdsFromQuery);

  const missingInManaged = clientIdsFromQuery.filter((id) => !managedSet.has(id));
  const extraInManaged = Array.isArray(managedClientIds)
    ? managedClientIds.filter((id: string) => !querySet.has(id))
    : [];

  if (missingInManaged.length > 0) {
    console.log(`⚠️  FALTAN en managedClientIds: ${missingInManaged.length} clientes`);
    console.log(`   ${missingInManaged.slice(0, 5).join(", ")}${missingInManaged.length > 5 ? "..." : ""}`);
  }

  if (extraInManaged.length > 0) {
    console.log(`⚠️  EXTRAS en managedClientIds (no tienen managerUid): ${extraInManaged.length} clientes`);
    console.log(`   ${extraInManaged.slice(0, 5).join(", ")}${extraInManaged.length > 5 ? "..." : ""}`);
  }

  if (missingInManaged.length === 0 && extraInManaged.length === 0) {
    console.log(`✅ managedClientIds está sincronizado correctamente`);
  }
}

async function main() {
  const partnerUid = process.argv[2];
  if (!partnerUid) {
    console.error("Uso: tsx scripts/verify-partner-managed-client-ids.ts <partnerUid>");
    console.error("Ejemplo: tsx scripts/verify-partner-managed-client-ids.ts RiKnUwmxgtawvlymaowxXUxDp9z1");
    process.exit(1);
  }

  try {
    await verifyPartner(partnerUid);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

void main();

