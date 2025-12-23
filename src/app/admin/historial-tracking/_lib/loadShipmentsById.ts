// src/app/admin/historial-tracking/_lib/loadShipmentsById.ts
import { collection, getDocs, query, where, documentId, type Firestore, type QueryDocumentSnapshot, type DocumentData } from "firebase/firestore";
import type { Shipment } from "@/types/lem";
import { chunk } from "@/lib/utils";

export async function loadShipmentsById(
  db: Firestore,
  shipmentIds: string[]
): Promise<Record<string, Shipment>> {
  if (shipmentIds.length === 0) {
    return {};
  }

  let shipmentDocs: QueryDocumentSnapshot<DocumentData>[] = [];
  
  if (shipmentIds.length <= 10) {
    const q = query(
      collection(db, "shipments"),
      where(documentId(), "in", shipmentIds)
    );
    const snap = await getDocs(q);
    shipmentDocs = snap.docs;
  } else {
    const chunks = chunk(shipmentIds, 10);
    const snaps = await Promise.all(
      chunks.map((ids) =>
        getDocs(
          query(
            collection(db, "shipments"),
            where(documentId(), "in", ids)
          )
        )
      )
    );
    shipmentDocs = snaps.flatMap((s) => s.docs);
  }

  const shipmentsMap: Record<string, Shipment> = {};
  shipmentDocs.forEach((d) => {
    const data = d.data();
    shipmentsMap[d.id] = {
      id: d.id,
      code: typeof data.code === "string" ? data.code : "",
      status: (["open", "shipped", "arrived", "closed"].includes(
        data.status
      )
        ? data.status
        : "open") as Shipment["status"],
      country: typeof data.country === "string" ? data.country : "",
      type:
        data.type === "COMERCIAL" || data.type === "FRANQUICIA"
          ? data.type
          : "COMERCIAL",
    };
  });

  return shipmentsMap;
}

