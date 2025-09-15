// src/app/admin/clientes/page.tsx
"use client";
import RequireAuth from "@/components/RequireAuth";
import { db } from "@/lib/firebase";
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, Timestamp, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import type { Client } from "@/types/lem";

export default function ClientesPage() {
  return (
    <RequireAuth>
      <PageInner />
    </RequireAuth>
  );
}

function PageInner() {
  const [rows, setRows] = useState<Client[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [country, setCountry] = useState<"UY" | "US" | "AR">("US");
  const [busyId, setBusyId] = useState<string>("");

  useEffect(() => {
    const q = query(collection(db, "clients"), orderBy("createdAt", "desc"));
    getDocs(q).then((s) =>
      setRows(
        s.docs.map((d) => {
          const data = d.data() as Omit<Client, "id">;
          return { id: d.id, ...data } as Client;
        })
      )
    );
  }, []);

  async function createClient(e: React.FormEvent) {
    e.preventDefault();
    if (!code || !name) return;
    const ref = await addDoc(collection(db, "clients"), {
      code,
      name,
      country,
      activo: true,
      createdAt: Timestamp.now().toMillis(),
    });
    setRows([
      { id: ref.id, code, name, country, activo: true, createdAt: Date.now() } as Client,
      ...rows,
    ]);
    setCode("");
    setName("");
  }

  async function toggleActivo(id: string, current: boolean) {
    try {
      setBusyId(id);
      await updateDoc(doc(db, "clients", id), { activo: !current });
      setRows((r) => r.map((c) => (c.id === id ? { ...c, activo: !current } : c)));
    } finally {
      setBusyId("");
    }
  }

  async function removeClient(id: string, code: string) {
    const ok = confirm(`Seguro que quiere eliminar al cliente ${code}?`);
    if (!ok) return;
    try {
      setBusyId(id);
      await deleteDoc(doc(db, "clients", id));
      setRows((r) => r.filter((c) => c.id !== id));
    } finally {
      setBusyId("");
    }
  }

  return (
    <main className="p-4 md:p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Clientes</h1>
      <form onSubmit={createClient} className="grid gap-3 md:grid-cols-4">
        <input
          className="border rounded p-3"
          placeholder="Código (ej: ROD001)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <input
          className="border rounded p-3"
          placeholder="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="border rounded p-3"
          value={country}
          onChange={(e) => setCountry(e.target.value as "US" | "UY" | "AR")}
        >
          <option value="US">US</option>
          <option value="UY">UY</option>
          <option value="AR">AR</option>
        </select>
        <button className="bg-black text-white rounded p-3">Crear</button>
      </form>

      <section className="grid gap-2">
        {rows.map((c) => (
          <div key={c.id} className="border rounded p-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm"><b>{c.code}</b> — {c.name}</div>
              <div className="text-xs text-neutral-500">País: {c.country} · Estado: {c.activo ? "Activo" : "Inactivo"}</div>
            </div>
            <div className="flex items-center gap-2">
              <a href={`/admin/clientes/${c.id}`} className="px-2 py-1 text-xs rounded border" aria-label="Ver perfil">Ver perfil</a>
              <button
                onClick={() => toggleActivo(c.id!, c.activo !== false)}
                disabled={busyId === c.id}
                className={`px-2 py-1 text-xs rounded border ${ c.activo !== false ? "border-red-500 text-red-600" : "border-emerald-600 text-emerald-700"}`}
                aria-label={c.activo !== false ? "Desactivar" : "Activar"}
                title={c.activo !== false ? "Desactivar" : "Activar"}
              >
                {c.activo !== false ? "Desactivar" : "Activar"}
              </button>
              <button
                onClick={() => removeClient(c.id!, c.code)}
                disabled={busyId === c.id}
                className="px-2 py-1 text-xs rounded border border-neutral-400"
                aria-label="Eliminar"
                title="Eliminar definitivamente"
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {!rows.length ? (
          <div className="text-sm text-neutral-500">Sin clientes aún.</div>
        ) : null}
      </section>
    </main>
  );
}