// src/app/admin/historial-tracking/_lib/loadAlertedTrackings.ts
import { collection, getDocs, query, where, type Firestore } from "firebase/firestore";
import { chunk } from "@/lib/utils";

export async function loadAlertedTrackings(
  db: Firestore,
  trackingsUpper: string[]
): Promise<Set<string>> {
  if (trackingsUpper.length === 0) {
    return new Set();
  }

  const alertSet = new Set<string>();
  const trackingChunks = chunk(trackingsUpper, 10);
  
  for (const chunk of trackingChunks) {
    try {
      const alertQuery = query(
        collection(db, "trackingAlerts"),
        where("tracking", "in", chunk),
        where("status", "==", "open")
      );
      const alertSnap = await getDocs(alertQuery);
      alertSnap.docs.forEach((d) => {
        const data = d.data();
        if (data.tracking && typeof data.tracking === "string") {
          alertSet.add(data.tracking.toUpperCase());
        }
      });
    } catch (e) {
      console.error("Error loading alerts:", e);
    }
  }

  return alertSet;
}

