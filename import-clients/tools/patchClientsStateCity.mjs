import fs from "fs";
import { parse } from "csv-parse/sync";
import admin from "firebase-admin";

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) { console.error("Falta GOOGLE_APPLICATION_CREDENTIALS"); process.exit(1); }
admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

const users  = parse(fs.readFileSync("users_firestore_final.csv"), { columns: true });
const states = parse(fs.readFileSync("states.tsv"), { columns: true, delimiter: "\t" });
const cities = parse(fs.readFileSync("cities.tsv"), { columns: true, delimiter: "\t" });

const stateByName = new Map(states.map(s => [String(s.name).trim(), String(s.id)]));
const cityByKey   = new Map(cities.map(c => [
  (String(c.name).trim()+"|"+String(c.state_id||"")).toLowerCase(),
  { cityId: String(c.id), stateId: String(c.state_id) }
]));

function resolveIds(row){
  const stateName = String(row.state||"").trim();
  const cityName  = String(row.city||"").trim();
  let stateId = stateByName.get(stateName) || "";
  const kA = (cityName+"|"+stateId).toLowerCase();
  const kB = (cityName+"|").toLowerCase();
  const hit = cityByKey.get(kA) || cityByKey.get(kB);
  const cityId = hit?.cityId || "";
  if (!stateId && hit?.stateId) stateId = hit.stateId;
  return { stateId, cityId };
}

const BATCH = 300;
(async () => {
  let done = 0, ok = 0, miss = 0;
  for (let i = 0; i < users.length; i += BATCH) {
    const chunk = users.slice(i, i+BATCH);
    const batch = db.batch();

    for (const r of chunk) {
      const legacyId = String(r.legacyId||"").trim();
      if (!legacyId) { miss++; continue; }
      const { stateId, cityId } = resolveIds(r);
      if (!stateId && !cityId) { miss++; continue; }

      const snap = await db.collection("clients").where("legacyId","==",legacyId).limit(1).get();
      if (snap.empty) { miss++; continue; }
      const ref = snap.docs[0].ref;
      batch.set(ref, {
        stateId: stateId || admin.firestore.FieldValue.delete(),
        cityId:  cityId  || admin.firestore.FieldValue.delete()
      }, { merge: true });
      ok++;
    }
    await batch.commit();
    done += chunk.length;
    console.log(`Patch: ${done}/${users.length} • actualizados:${ok} • sin match:${miss}`);
  }
  console.log("Parche finalizado.");
})();
