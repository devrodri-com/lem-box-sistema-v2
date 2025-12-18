// src/lib/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Dev-only: expose Firebase handles for quick debugging in the browser console.
// Example: window.__lemBoxFirebase.app.options.projectId
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as any).__lemBoxFirebase = { app, auth, db, storage };

  // Log the runtime projectId once (helps confirm you're connected to the intended Firebase project).
  const pid = (app as any)?.options?.projectId;
  if (!(window as any).__lemBoxFirebaseLoggedProjectId) {
    (window as any).__lemBoxFirebaseLoggedProjectId = true;
    // eslint-disable-next-line no-console
    console.log(
      "%c[Firebase] projectId:",
      "color: #005f40; font-weight: bold; font-size: 14px",
      pid || "undefined"
    );
    // eslint-disable-next-line no-console
    console.log(
      "%c[Firebase] Expected: lem-box-sistema-v2",
      pid === "lem-box-sistema-v2" ? "color: green" : "color: red; font-weight: bold"
    );
  }
}