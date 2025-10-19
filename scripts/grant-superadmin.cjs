// scripts/grant-superadmin.cjs
const admin = require("firebase-admin");
const path = require("path");

// Carga directa desde serviceAccount.json para evitar depender de env vars
const serviceAccount = require(path.join(__dirname, "../serviceAccount.json"));

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: serviceAccount.project_id,
    clientEmail: serviceAccount.client_email,
    privateKey: serviceAccount.private_key,
  }),
});

(async () => {
  try {
    const email = process.env.SUPERADMIN_EMAIL || "r.opalo@icloud.com"; // ajusta si corresponde
    const u = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(u.uid, { superadmin: true });
    console.log("OK: superadmin set for", email);
    process.exit(0);
  } catch (e) {
    console.error("Failed:", e?.message || e);
    process.exit(1);
  }
})();