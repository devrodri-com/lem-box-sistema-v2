import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'node:fs';

const serviceAccount = JSON.parse(fs.readFileSync('./serviceAccount.json','utf8'));
initializeApp({ credential: cert(serviceAccount) });

const email = 'r.opalo@icloud.com'; // tu usuario
const auth = getAuth();
const user = await auth.getUserByEmail(email);
await auth.setCustomUserClaims(user.uid, { role: 'admin' });
console.log('OK role=admin para', email, 'uid=', user.uid);