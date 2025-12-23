// src/app/admin/historial-tracking/_lib/loadOpenAlerts.ts
import { collection, getDocs, query, where, type Firestore } from "firebase/firestore";

export type OpenAlert = {
  id: string;
  tracking: string;
  clientId: string;
  createdAt?: number;
  note?: string;
};

export async function loadOpenAlerts(
  db: Firestore
): Promise<OpenAlert[]> {
  try {
    const allAlertsQuery = query(
      collection(db, "trackingAlerts"),
      where("status", "==", "open")
    );
    const allAlertsSnap = await getDocs(allAlertsQuery);
    const allAlerts = allAlertsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        tracking: typeof data.tracking === "string" ? data.tracking.toUpperCase() : "",
        clientId: typeof data.clientId === "string" ? data.clientId : "",
        createdAt: typeof data.createdAt === "number" ? data.createdAt : undefined,
        note: typeof data.note === "string" ? data.note : undefined,
      };
    }).filter((a) => a.tracking && a.clientId);

    return allAlerts;
  } catch (e) {
    console.error("Error loading all alerts:", e);
    return [];
  }
}

