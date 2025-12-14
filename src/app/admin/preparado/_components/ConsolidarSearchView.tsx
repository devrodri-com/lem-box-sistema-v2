"use client";
import { db } from "@/lib/firebase";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import type { Client } from "@/types/lem";
import { useRouter } from "next/navigation";

export function ConsolidarSearchView() {
  const [clients, setClients] = useState<Client[]>([]);
  const [qClient, setQClient] = useState("");
  const router = useRouter();

  // Debounced query and keyboard index
  const [debouncedQ, setDebouncedQ] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(qClient), 150);
    return () => clearTimeout(t);
  }, [qClient]);

  useEffect(() => {
    getDocs(query(collection(db, "clients"), orderBy("createdAt", "desc"))).then((s) => {
      setClients(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Client, "id">) })));
    });
  }, []);

  const filtered = useMemo(() => {
    const q = debouncedQ.trim().toLowerCase();
    const list = q ? clients.filter((c) => `${c.code} ${c.name}`.toLowerCase().includes(q)) : clients.slice(0, 25);
    if (activeIdx >= list.length) setActiveIdx(0);
    return list;
  }, [clients, debouncedQ]);

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Elegí un cliente para consolidar</h2>
      <div className="w-full max-w-3xl mx-auto">
        <label className="text-xs text-white/60">Buscar cliente</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">🔎</span>
          <input
            className="h-10 w-full rounded-md border border-[#1f3f36] !bg-[#0f2a22] pl-9 pr-3 !text-white caret-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#005f40]"
            placeholder="Nombre o código (ej. 1234, juan)"
            value={qClient}
            onChange={(e) => setQClient(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1)); }
              if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
              if (e.key === 'Enter')     { e.preventDefault(); if (filtered[activeIdx]) router.push(`/admin/preparado/${filtered[activeIdx].id}`); }
              if (e.key === 'Escape')    { setQClient(""); }
            }}
          />
        </div>
        <div className="mt-2 max-h-80 overflow-auto rounded-md border border-[#1f3f36] bg-[#071f19] ring-1 ring-white/10">
          {filtered.map((c, i) => (
            <button
              key={c.id}
              className={`group w-full text-left h-11 px-3 flex items-center justify-between transition ${i === activeIdx ? 'bg-white/10' : 'bg-transparent hover:bg-white/5'} focus:outline-none focus:ring-2 focus:ring-[#005f40]`}
              onClick={() => router.push(`/admin/preparado/${c.id}`)}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span className="truncate text-white"><b className="font-mono font-semibold text-white">{c.code}</b>   {c.name}</span>
              <span className="opacity-0 group-hover:opacity-100 text-xs inline-flex items-center gap-1 bg-[#eb6619] text-white px-2.5 py-1 rounded-md transition">Elegir</span>
            </button>
          ))}
          {!filtered.length ? (
            <div className="px-3 py-4 text-sm text-white/60 flex items-center justify-between">
              <span>Sin resultados. Probá con el <b>código</b> o el <b>apellido</b>.</span>
              <button className="text-xs underline text-white/80 hover:text-white" onClick={() => setQClient("")}>Limpiar filtro</button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

