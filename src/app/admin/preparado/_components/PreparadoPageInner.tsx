// src/app/admin/preparado/_components/PreparadoPageInner.tsx
"use client";
import Script from "next/script";
import { useState } from "react";
import { ConsolidarSearchView, EmbarquesView } from ".";

export function PreparadoPageInner() {
  const [tab, setTab] = useState<"consolidar" | "cargas">("consolidar");
  // Botones LEM-BOX (paleta: #005f40, #eb6619, #cf6934)
  const btnPrimaryCls = "inline-flex items-center justify-center h-11 px-5 rounded-md bg-[#eb6619] text-white font-medium shadow-md hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#eb6619] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
  const btnSecondaryCls = "inline-flex items-center justify-center h-11 px-5 rounded-md border border-[#1f3f36] bg-[#0f2a22] text-white/90 font-medium shadow-sm hover:bg-white/5 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#005f40] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
  const tabBtn = (active: boolean) =>
    `px-3 h-9 text-sm font-semibold rounded-full transition ${active ? 'bg-[#005f40] text-white shadow' : 'text-white/80 hover:bg-white/10'}`;
  const linkCls = "text-white/80 underline hover:text-white focus:outline-none focus:ring-2 focus:ring-[#005f40] rounded-sm";

  return (
    <main className="min-h-[100dvh] bg-[#02120f] text-white flex flex-col items-center p-4 md:p-8 pt-24 md:pt-28">
      <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-4 md:p-6 space-y-6">
        <h1 className="text-2xl font-semibold">Preparado de carga</h1>

        <div
          role="tablist"
          aria-label="Vistas"
          className="inline-flex items-center gap-1 rounded-full bg-[#0f2a22] p-1 ring-1 ring-[#1f3f36]"
        >
          <button
            role="tab"
            aria-selected={tab === "consolidar"}
            className={tabBtn(tab === "consolidar")}
            onClick={() => setTab("consolidar")}
          >
            Consolidar
          </button>
          <button
            role="tab"
            aria-selected={tab === "cargas"}
            className={tabBtn(tab === "cargas")}
            onClick={() => setTab("cargas")}
          >
            Cargas
          </button>
        </div>

        {tab === "consolidar" ? (
          <ConsolidarSearchView />
        ) : (
          <EmbarquesView
            btnPrimaryCls={btnPrimaryCls}
            btnSecondaryCls={btnSecondaryCls}
            linkCls={linkCls}
          />
        )}
      </div>

      <Script
        src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"
        strategy="lazyOnload"
      />
    </main>
  );
}

