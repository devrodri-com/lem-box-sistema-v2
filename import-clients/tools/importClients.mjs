import fs from "fs";
import { parse } from "csv-parse/sync";
import admin from "firebase-admin";

const csvPath = process.argv[2] || "users_firestore_final.csv";
const collection = process.argv[3] || "clients";

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Falta GOOGLE_APPLICATION_CREDENTIALS"); process.exit(1);
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();
const rows = parse(fs.readFileSync(csvPath), { columns: true, skip_empty_lines: true });

const BATCH = 400;
let done = 0;

for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH);
  const batch = db.batch();
  for (const r of chunk) {
    const ref = db.collection(collection).doc(); // auto-ID
    const ms = Number(r.createdAt) || null;
    batch.set(ref, {
      legacyId: r.legacyId?.toString() || null,
      code: r.code || null,
      name: r.name || null,
      email: r.email || null,
      phone: r.phone || null,
      address: r.address || null,
      postalCode: r.postal_code || null,
      state: r.state || null,
      city: r.city || null,
      country: r.country || null,
      activo: String(r.activo) === "1",
      createdAt: ms ? admin.firestore.Timestamp.fromMillis(ms) : null,
      importedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();
  done += chunk.length;
  console.log(`OK ${done}/${rows.length}`);
}
console.log("Importación completa.");
