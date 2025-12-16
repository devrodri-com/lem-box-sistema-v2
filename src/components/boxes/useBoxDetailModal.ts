// src/components/boxes/useBoxDetailModal.ts
import { useState, useCallback } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { printBoxLabel } from "@/lib/printBoxLabel";
import { fmtWeightPairFromLb } from "@/lib/weight";
import type { BoxDetailModalProps } from "./BoxDetailModal";

type ModalBox = NonNullable<BoxDetailModalProps["box"]>;

type BoxRow = {
  id: string;
  code: string;
  itemIds?: string[];
  clientId: string;
  type?: "COMERCIAL" | "FRANQUICIA";
  weightLb?: number;
  labelRef?: string;
  status?: "open" | "closed" | "shipped" | "delivered";
};

type DetailItem = { id: string; tracking: string; weightLb: number; photoUrl?: string };

type Client = {
  id?: string;
  code: string;
};

// Helpers para parse seguro de datos de Firestore
function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}
function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
}

interface UseBoxDetailModalOptions {
  boxes: BoxRow[];
  setBoxes: React.Dispatch<React.SetStateAction<Array<Record<string, unknown> & { id: string }>>>;
  setRows: React.Dispatch<React.SetStateAction<Array<Record<string, unknown> & { id: string }>>>;
  clientsById: Record<string, Client>;
}

export function useBoxDetailModal({
  boxes,
  setBoxes,
  setRows,
  clientsById,
}: UseBoxDetailModalOptions) {
  const [boxDetailOpen, setBoxDetailOpen] = useState(false);
  const [detailBox, setDetailBox] = useState<ModalBox | null>(null);
  const [detailItems, setDetailItems] = useState<DetailItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editType, setEditType] = useState<"COMERCIAL" | "FRANQUICIA">("COMERCIAL");
  const [labelRef, setLabelRef] = useState<string>("");

  const openBoxDetailByBoxId = useCallback(
    async (boxId: string) => {
      const b = boxes.find((x) => x.id === boxId);
      if (!b) return;
      const bRecord = asRecord(b);
      const itemIds = bRecord ? asStringArray(bRecord["itemIds"]) : [];
      const normalizedBox = { ...b, itemIds } as ModalBox;
      setDetailBox(normalizedBox);
      
      // Parse type: solo "COMERCIAL" o "FRANQUICIA"; fallback "COMERCIAL"
      const typeRaw = bRecord ? asString(bRecord["type"]) : undefined;
      const type = typeRaw === "FRANQUICIA" ? "FRANQUICIA" : "COMERCIAL";
      setEditType(type);
      
      // Parse labelRef: solo si es string
      const labelRefRaw = bRecord ? asString(bRecord["labelRef"]) : undefined;
      setLabelRef(labelRefRaw || "");
      
      setBoxDetailOpen(true);
      setLoadingDetail(true);
      try {
        const items: DetailItem[] = [];
        for (const id of (normalizedBox.itemIds || [])) {
          const snap = await getDoc(doc(db, "inboundPackages", id));
          if (snap.exists()) {
            const rec = asRecord(snap.data());
            const tracking = asString(rec?.tracking) ?? "";
            const weightLb = asNumber(rec?.weightLb) ?? 0;
            const photoUrl = asString(rec?.photoUrl);
            items.push({
              id: snap.id,
              tracking,
              weightLb,
              photoUrl,
            });
          }
        }
        setDetailItems(items);
      } finally {
        setLoadingDetail(false);
      }
    },
    [boxes]
  );

  const removeItemFromBox = useCallback(
    async (itemId: string) => {
      if (!detailBox) return;
      const remainingIds = (detailBox.itemIds || []).filter((id) => id !== itemId);
      const remainingItems = detailItems.filter((i) => remainingIds.includes(i.id));
      const newWeight = remainingItems.reduce((acc, i) => acc + (Number(i.weightLb) || 0), 0);
      await updateDoc(doc(db, "boxes", detailBox.id), {
        itemIds: remainingIds,
        weightLb: newWeight,
      });
      await updateDoc(doc(db, "inboundPackages", itemId), { status: "received" });
      setDetailItems(remainingItems);
      setDetailBox({ ...detailBox, itemIds: remainingIds, weightLb: newWeight });
      setBoxes((prev) =>
        prev.map((b) =>
          (b as BoxRow).id === detailBox.id ? { ...(b as BoxRow), itemIds: remainingIds, weightLb: newWeight } : b
        )
      );
      setRows((prev) => prev.map((r) => (r.id === itemId ? { ...r, status: "received" } : r)));
    },
    [detailBox, detailItems, setBoxes, setRows]
  );

  const applyBoxTypeChange = useCallback(async () => {
    if (!detailBox) return;
    await updateDoc(doc(db, "boxes", detailBox.id), { type: editType });
    setDetailBox({ ...detailBox, type: editType });
    setBoxes((prev) => prev.map((b) => ((b as BoxRow).id === detailBox.id ? { ...(b as BoxRow), type: editType } : b)));
  }, [detailBox, editType, setBoxes]);

  const handlePrintLabel = useCallback(() => {
    if (!detailBox) return;
    const clientCode = clientsById[detailBox.clientId]?.code || detailBox.clientId;
    void printBoxLabel({
      reference: labelRef,
      clientCode: String(clientCode),
      boxCode: String(detailBox.code),
    });
  }, [detailBox, labelRef, clientsById]);

  const saveLabelRef = useCallback(async () => {
    if (!detailBox) return;
    await updateDoc(doc(db, "boxes", detailBox.id), { labelRef });
    setDetailBox({ ...detailBox, labelRef });
  }, [detailBox, labelRef]);

  const closeModal = useCallback(() => {
    setBoxDetailOpen(false);
    setDetailBox(null);
  }, []);

  const modalProps: BoxDetailModalProps = {
    open: boxDetailOpen,
    box: detailBox,
    items: detailItems,
    loading: loadingDetail,
    editType,
    onChangeType: setEditType,
    onApplyType: applyBoxTypeChange,
    labelRef,
    onChangeLabelRef: setLabelRef,
    onBlurSaveLabelRef: saveLabelRef,
    onPrintLabel: handlePrintLabel,
    onRemoveItem: removeItemFromBox,
    weightText: fmtWeightPairFromLb(Number(detailBox?.weightLb || 0)),
    onClose: closeModal,
  };

  return {
    openBoxDetailByBoxId,
    modalProps,
    closeModal,
  };
}
