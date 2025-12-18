// scripts/diagnose-partner-access.ts
// Diagnóstico de permisos para partner_admin desde terminal
import admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";

// Configuración: intentar serviceAccount.json, luego Application Default Credentials
let adminApp: admin.app.App;

try {
  const serviceAccountPath = path.join(__dirname, "../serviceAccount.json");
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    adminApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key,
      }),
    });
    console.log("✅ Usando serviceAccount.json");
    console.log(`   Project ID: ${serviceAccount.project_id}\n`);
  } else {
    // Fallback a Application Default Credentials
    adminApp = admin.initializeApp({
      projectId: "lem-box-sistema-v2",
    });
    console.log("✅ Usando Application Default Credentials");
    console.log("   (Asegúrate de haber ejecutado: gcloud auth application-default login)");
    console.log(`   Project ID: lem-box-sistema-v2\n`);
  }
} catch (err: any) {
  console.error("❌ Error inicializando Firebase Admin:");
  console.error(`   ${err.message}`);
  console.error("\nOpciones:");
  console.error("   1. Colocar serviceAccount.json en la raíz del proyecto");
  console.error("   2. Ejecutar: gcloud auth application-default login");
  process.exit(1);
}

const db = admin.firestore();

// Datos del partner
const PARTNER_UID = "RiKnUwmxgtawvlymaowxXUxDp9z1";
const SCOPED_CLIENT_IDS = [
  "17Drtc8lWbHjm4U4C2G8",
  "21VztbZpvF4kZeJfYnDv",
  "AisnLGJK86LkPsH8siQc",
  "DrSd3rPYj24ebQk1hzV9",
  "EoJK4XJr6OkacwgPbOn3",
  "FEl3YxI0qVE5hFGsGKuV",
  "JjGGGdtx9mil1KrDkjE5",
  "UbkgvHlaUkZ78cMCUVy9",
  "WzQuzWVzeRgZ03uypoBW",
  "YMCc5BRKA7gi6SKvUj5I",
  "md3I8R1l8iCaB6IKgGxX",
  "sSJIXIxzRslruFYsI92w",
  "vqLYvRvou2bNCJyjYmSC",
  "wKrmrBr2RFuFhZWWNC9U",
  "wLIjLjvJOeGKznPeU5mG",
  "zpCXB8NJy0Z8reqLiMkB",
];

interface Summary {
  clientsInexistentes: number;
  clientsManagerUidDistinto: number;
  boxesClientIdFaltante: number;
  boxesManagerUidDistinto: number;
  inboundsClientIdFaltante: number;
  inboundsManagerUidDistinto: number;
}

async function diagnose() {
  const summary: Summary = {
    clientsInexistentes: 0,
    clientsManagerUidDistinto: 0,
    boxesClientIdFaltante: 0,
    boxesManagerUidDistinto: 0,
    inboundsClientIdFaltante: 0,
    inboundsManagerUidDistinto: 0,
  };

  console.log("=== DIAGNÓSTICO DE PERMISOS PARTNER_ADMIN ===\n");
  console.log(`Partner UID: ${PARTNER_UID}`);
  console.log(`Scoped Client IDs: ${SCOPED_CLIENT_IDS.length}\n`);

  // 1. Leer users/{uid}
  console.log(`1. /users/${PARTNER_UID}:`);
  try {
    const userSnap = await db.collection("users").doc(PARTNER_UID).get();
    if (userSnap.exists) {
      const data = userSnap.data()!;
      const role = data.role || "undefined";
      const managedClientIds = Array.isArray(data.managedClientIds)
        ? data.managedClientIds
        : [];
      const clientId = data.clientId || "undefined";

      console.log(`   role: ${role}`);
      console.log(`   managedClientIds: tipo=${Array.isArray(data.managedClientIds) ? "array" : typeof data.managedClientIds}, length=${managedClientIds.length}`);
      if (managedClientIds.length > 0) {
        console.log(`   managedClientIds sample: ${managedClientIds.slice(0, 3).join(", ")}`);
      }
      console.log(`   clientId: ${clientId}\n`);
    } else {
      console.log(`   ❌ Usuario NO existe\n`);
    }
  } catch (err: any) {
    console.error(`   ❌ Error: ${err.message}\n`);
  }

  // 2. Para cada scopedClientId
  console.log(`2. Verificando ${SCOPED_CLIENT_IDS.length} clientes:\n`);
  for (const cid of SCOPED_CLIENT_IDS) {
    console.log(`   Cliente: ${cid}`);

    // Leer client
    try {
      const clientSnap = await db.collection("clients").doc(cid).get();
      if (clientSnap.exists) {
        const data = clientSnap.data()!;
        const managerUid = data.managerUid || null;
        const managerUidMatch = managerUid === PARTNER_UID;

        console.log(`     ✅ Existe`);
        console.log(`     managerUid: ${managerUid || "null"}`);
        console.log(`     managerUid==partnerUid: ${managerUidMatch}`);

        if (!managerUidMatch && managerUid) {
          summary.clientsManagerUidDistinto++;
        }
      } else {
        console.log(`     ❌ NO existe`);
        summary.clientsInexistentes++;
      }
    } catch (err: any) {
      console.error(`     ❌ Error leyendo client: ${err.message}`);
      summary.clientsInexistentes++;
    }

    // Buscar boxes
    try {
      const boxesSnap = await db
        .collection("boxes")
        .where("clientId", "==", cid)
        .limit(3)
        .get();

      console.log(`     Boxes encontrados: ${boxesSnap.size}`);
      boxesSnap.forEach((doc) => {
        const data = doc.data();
        const boxClientId = data.clientId || "null";
        const boxManagerUid = data.managerUid || null;

        console.log(`       - docId: ${doc.id}`);
        console.log(`         clientId: ${boxClientId}`);
        console.log(`         managerUid: ${boxManagerUid || "null"}`);

        if (!boxClientId || boxClientId === "null") {
          summary.boxesClientIdFaltante++;
        }
        if (boxManagerUid && boxManagerUid !== PARTNER_UID) {
          summary.boxesManagerUidDistinto++;
        }
      });
    } catch (err: any) {
      console.error(`     ❌ Error buscando boxes: ${err.message}`);
    }

    // Buscar inbounds
    try {
      const inboundsSnap = await db
        .collection("inboundPackages")
        .where("clientId", "==", cid)
        .limit(3)
        .get();

      console.log(`     InboundPackages encontrados: ${inboundsSnap.size}`);
      inboundsSnap.forEach((doc) => {
        const data = doc.data();
        const inboundClientId = data.clientId || "null";
        const inboundManagerUid = data.managerUid || null;

        console.log(`       - docId: ${doc.id}`);
        console.log(`         clientId: ${inboundClientId}`);
        console.log(`         managerUid: ${inboundManagerUid || "null"}`);

        if (!inboundClientId || inboundClientId === "null") {
          summary.inboundsClientIdFaltante++;
        }
        if (inboundManagerUid && inboundManagerUid !== PARTNER_UID) {
          summary.inboundsManagerUidDistinto++;
        }
      });
    } catch (err: any) {
      console.error(`     ❌ Error buscando inbounds: ${err.message}`);
    }

    // Buscar shipments (si aplica)
    try {
      const shipmentsSnap = await db
        .collection("shipments")
        .where("clientIds", "array-contains", cid)
        .limit(3)
        .get();

      if (shipmentsSnap.size > 0) {
        console.log(`     Shipments encontrados: ${shipmentsSnap.size}`);
        shipmentsSnap.forEach((doc) => {
          const data = doc.data();
          const clientIds = Array.isArray(data.clientIds) ? data.clientIds : [];

          console.log(`       - docId: ${doc.id}`);
          console.log(`         clientIds: [${clientIds.join(", ")}]`);
        });
      }
    } catch (err: any) {
      // Ignorar errores de shipments (puede no tener índice)
    }

    console.log(""); // Línea en blanco entre clientes
  }

  // 3. Resumen
  console.log("=== RESUMEN ===\n");
  console.log(`Clients inexistentes: ${summary.clientsInexistentes}`);
  console.log(`Clients con managerUid distinto: ${summary.clientsManagerUidDistinto}`);
  console.log(`Boxes con clientId faltante: ${summary.boxesClientIdFaltante}`);
  console.log(`Boxes con managerUid presente pero distinto: ${summary.boxesManagerUidDistinto}`);
  console.log(`Inbounds con clientId faltante: ${summary.inboundsClientIdFaltante}`);
  console.log(`Inbounds con managerUid presente pero distinto: ${summary.inboundsManagerUidDistinto}`);

  // 4. Análisis de causa raíz
  console.log("\n=== ANÁLISIS ===\n");
  if (summary.clientsInexistentes > 0) {
    console.log("⚠️  CAUSA: Clients inexistentes → isClientManagedByUid() retorna false");
    console.log("   SOLUCIÓN: Verificar scopedClientIds o crear clients faltantes");
  } else if (summary.clientsManagerUidDistinto > 0) {
    console.log("⚠️  CAUSA: Clients con managerUid diferente → isClientManagedByUid() retorna false");
    console.log("   SOLUCIÓN: Asignar managerUid correcto a estos clients");
  } else if (summary.boxesClientIdFaltante > 0 || summary.inboundsClientIdFaltante > 0) {
    console.log("⚠️  CAUSA: Boxes/inbounds sin clientId → reglas fallan");
    console.log("   SOLUCIÓN: Corregir clientId en estos documentos");
  } else if (summary.boxesManagerUidDistinto > 0 || summary.inboundsManagerUidDistinto > 0) {
    console.log("⚠️  CAUSA: Boxes/inbounds con managerUid diferente (no crítico si client.managerUid es correcto)");
    console.log("   SOLUCIÓN: Backfill opcional (mejora rendimiento)");
  } else {
    console.log("✅ Datos consistentes. El problema puede ser:");
    console.log("   1. Reglas no desplegadas a producción");
    console.log("   2. ProjectId mismatch");
    console.log("   3. Query con array vacío o null");
  }

  console.log("\n=== FIN DEL DIAGNÓSTICO ===\n");
}

// Ejecutar
diagnose()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Error fatal:", err);
    process.exit(1);
  });
