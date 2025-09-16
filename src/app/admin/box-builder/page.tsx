// src/app/admin/box-builder/page.tsx
"use client";

import RequireAuth from "@/components/RequireAuth";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import type { Client, Inbound, Box } from "@/types/lem";

type ClientOption = Pick<Client, "id" | "code" | "name">;

export default function BoxBuilderPage() {
  return (
    <RequireAuth>
      <PageInner />
    </RequireAuth>
  );
}

function PageInner() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [clientCode, setClientCode] = useState<string>("");
  const [openBox, setOpenBox] = useState<Box | null>(null);
  const [eligible, setEligible] = useState<Inbound[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [closing, setClosing] = useState(false);
  const [reference, setReference] = useState("MIA-UY");
  const [errMsg, setErrMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");

  // load clients on mount
  useEffect(() => {
    getDocs(collection(db, "clients")).then((s) =>
      setClients(
        s.docs.map((d) => {
          const data = d.data() as Partial<Client>;
          return { id: d.id, code: String(data.code || ""), name: String(data.name || "") };
        })
      )
    );
  }, []);

  // when client changes, fetch open box and eligible inbounds
  useEffect(() => {
    if (!clientId) {
      setOpenBox(null);
      setEligible([]);
      setSelected({});
      setClientCode("");
      setErrMsg("");
      setOkMsg("");
      return;
    }

    (async () => {
      // client code
      const cSnap = await getDoc(doc(db, "clients", clientId));
      const cData = cSnap.data() as Partial<Client> | undefined;
      setClientCode((cData?.code as string) || "");

      // fetch existing open box for client (at most 1)
      const qBox = query(
        collection(db, "boxes"),
        where("clientId", "==", clientId),
        where("status", "==", "open"),
        limit(1)
      );
      const sBox = await getDocs(qBox);
      if (!sBox.empty) {
        const d = sBox.docs[0];
        const boxData = d.data() as Omit<Box, "id">;
        setOpenBox({ id: d.id, ...boxData });
      } else {
        setOpenBox(null);
      }

      // fetch inbound packages for client that are not boxed
      const qIn = query(
        collection(db, "inboundPackages"),
        where("clientId", "==", clientId),
        where("status", "==", "received"),
        orderBy("receivedAt", "desc")
      );
      const sIn = await getDocs(qIn);
      const rows = sIn.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<Inbound, "id">;
        return { id: docSnap.id, ...data } as Inbound;
      });
      setEligible(rows);
      setSelected({});
    })();
  }, [clientId]);

  const totalWeight = useMemo(
    () =>
      eligible
        .filter((r) => !!r.id && !!selected[String(r.id)])
        .reduce((acc, r) => acc + (Number(r.weightLb) || 0), 0),
    [eligible, selected]
  );

  async function ensureOpenBoxForClient(): Promise<Box> {
    if (openBox) return openBox;
    // create an open box
    const code = `${Date.now()}`; // numérico legible y único
    const ref = await addDoc(collection(db, "boxes"), {
      code,
      clientId,
      itemIds: [],
      weightLb: 0,
      status: "open",
      createdAt: Timestamp.now().toMillis(),
    });
    const box: Box = {
      id: ref.id,
      code,
      clientId,
      itemIds: [],
      weightLb: 0,
      status: "open",
      createdAt: Date.now(),
    };
    setOpenBox(box);
    return box;
  }

  async function addSelectedToBox() {
    if (!clientId) return;
    const chosen = eligible.filter((r) => {
      const id = String(r.id || r.tracking);
      return !!selected[id];
    });
    setErrMsg("");
    setOkMsg("");
    if (!chosen.length) return;

    const box = await ensureOpenBoxForClient();

    // update box and inbounds atomically
    const batch = writeBatch(db);
    const newItemIds = Array.from(new Set([...(box.itemIds || []), ...chosen.filter((r) => !!r.id).map((r) => String(r.id))]));

    const boxRef = doc(db, "boxes", String(box.id));
    const nextWeight = (Number(box.weightLb) || 0) + chosen.reduce((a, r) => a + (Number(r.weightLb) || 0), 0);
    batch.update(boxRef, {
      itemIds: newItemIds,
      weightLb: nextWeight,
    });

    chosen.forEach((r) => {
      const inRef = doc(db, "inboundPackages", String(r.id));
      batch.update(inRef, { status: "boxed" });
    });

    await batch.commit();
    setOkMsg(`Se agregaron ${chosen.length} tracking(s) a la caja.`);

    // reflect UI
    setOpenBox({ ...box, itemIds: newItemIds, weightLb: nextWeight });
    setEligible((rows) => rows.filter((r) => !chosen.find((c) => c.id === r.id)));
    setSelected({});
  }

  async function closeBox() {
    if (!openBox) return;
    setErrMsg("");
    setOkMsg("");
    if ((openBox.itemIds?.length || 0) === 0 || (Number(openBox.weightLb) || 0) <= 0) {
      setErrMsg("La caja debe tener items y peso total > 0 para cerrar.");
      setClosing(false);
      return;
    }
    setClosing(true);
    try {
      const boxRef = doc(db, "boxes", String(openBox.id));
      await updateDoc(boxRef, {
        status: "closed",
        closedAt: Timestamp.now().toMillis(),
      });
      setOpenBox({ ...openBox, status: "closed", closedAt: Date.now() });
    } finally {
      setClosing(false);
    }
  }

  function printLabel6x4() {
    if (!openBox || !clientCode) return;
    const w = window.open("", "_blank");
    if (!w) return;
    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Etiqueta ${openBox.code}</title>
<style>
  @page { size: 6in 4in; margin: 0; }
  html, body { height: 100%; }
  body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  .sheet { width: 6in; height: 4in; padding: 0.15in; box-sizing: border-box; }
  .box { border: 3px solid #111; border-radius: 6px; width: 100%; height: 100%; display: grid; grid-template-rows: 1fr 1fr; }
  .ref { display: grid; place-items: center; border-bottom: 3px solid #111; font-weight: 800; }
  .ref small { display:block; font-size: 14px; letter-spacing: .08em; margin-bottom: 4px; }
  .ref h1 { margin: 0; font-size: 42px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; height: 100%; }
  .cell { border-right: 3px solid #111; display: grid; place-items: center; }
  .cell:last-child { border-right: 0; }
  .cell small { display:block; font-size: 14px; letter-spacing: .08em; margin-bottom: 6px; }
  .big { font-weight: 800; font-size: 42px; margin: 0; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="box">
      <div class="ref"><div><small>#REFERENCIA</small><h1>${escapeHtml(reference)}</h1></div></div>
      <div class="cols">
        <div class="cell"><div><small>#CLIENTE</small><div class="big">${escapeHtml(clientCode)}</div></div></div>
        <div class="cell"><div><small>#CAJA</small><div class="big">${escapeHtml(String(openBox.code))}</div></div></div>
      </div>
    </div>
  </div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  return (
    <main className="p-4 md:p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Box Builder</h1>

      {errMsg ? (
        <div className="p-3 rounded border border-red-300 bg-red-50 text-sm text-red-700">{errMsg}</div>
      ) : null}
      {okMsg ? (
        <div className="p-3 rounded border border-emerald-300 bg-emerald-50 text-sm text-emerald-700">{okMsg}</div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <select
          className="border rounded px-4 h-12 text-base"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        >
          <option value="">Elegir cliente…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>

        <div className="border rounded p-4">
          <div className="text-sm text-neutral-600">Caja</div>
          {openBox ? (
            <div className="text-sm">
              <div><b>{openBox.code}</b> · estado: <b>{openBox.status}</b></div>
              <div>Peso total: {Number(openBox.weightLb || 0).toFixed(2)} lb</div>
              <div>Items: {openBox.itemIds?.length || 0}</div>
            </div>
          ) : (
            <div className="text-sm text-neutral-500">No hay caja abierta. Se creará al agregar items.</div>
          )}
        </div>

        <div className="border rounded p-4">
          <div className="text-sm text-neutral-600">Seleccionados</div>
          <div className="text-sm">
            {Object.values(selected).filter(Boolean).length} items · {totalWeight.toFixed(2)} lb
          </div>
          <div className="flex gap-2 mt-2">
            <button
              className="h-12 px-4 rounded bg-black text-white disabled:opacity-50 text-sm md:text-base"
              onClick={addSelectedToBox}
              disabled={!clientId || !Object.values(selected).some(Boolean)}
            >
              Agregar a caja
            </button>
            <button
              className="h-12 px-4 rounded border disabled:opacity-50 text-sm md:text-base"
              onClick={() => setSelected({})}
              disabled={!Object.values(selected).some(Boolean)}
            >
              Limpiar
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Paquetes del cliente (recibidos)</h2>
        <div className="grid gap-2">
          {eligible.map((r) => {
            const id = String(r.id || r.tracking);
            return (
              <label key={id} className="border rounded p-3 md:p-4 flex items-center gap-3">
                {r.photoUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.photoUrl} alt="" className="w-16 h-16 object-cover rounded" />
                  </>
                ) : (
                  <div className="w-16 h-16 bg-neutral-100 rounded" />
                )}
                <input
                  type="checkbox"
                  className="w-5 h-5"
                  checked={!!selected[id]}
                  onChange={(e) => setSelected((s) => ({ ...s, [id]: e.target.checked }))}
                />
                <div className="flex-1">
                  <div className="text-sm">
                    #{r.tracking} · {r.carrier} · {r.weightLb} lb
                  </div>
                  <div className="text-xs text-neutral-500">
                    Recibido: {r.receivedAt ? new Date(r.receivedAt).toLocaleString() : "-"}
                  </div>
                </div>
              </label>
            );
          })}
          {!eligible.length && clientId ? (
            <div className="text-sm text-neutral-500">No hay paquetes “recibidos” para este cliente.</div>
          ) : null}
        </div>
      </section>

      <section className="md:static fixed left-0 right-0 bottom-0 bg-white/95 backdrop-blur border-t p-3 z-10">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <button
            className="h-12 px-4 rounded bg-emerald-600 text-white disabled:opacity-50"
            onClick={closeBox}
            disabled={!openBox || openBox.status !== "open" || (openBox.itemIds?.length || 0) === 0 || closing}
          >
            {closing ? "Cerrando…" : "Cerrar caja"}
          </button>

          <div className="flex items-center gap-2 flex-1">
            <input
              className="border rounded px-4 h-12 w-full md:w-80"
              placeholder="Referencia (editable)"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            <button
              className="h-12 px-4 rounded border disabled:opacity-50"
              onClick={printLabel6x4}
              disabled={!openBox || openBox.status !== "closed"}
            >
              Imprimir etiqueta 6x4
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}