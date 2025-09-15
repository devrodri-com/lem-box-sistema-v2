// src/app/admin/historial-envios/page.tsx
"use client";
import RequireAuth from "@/components/RequireAuth";

export default function HistorialEnviosPage() {
  return (
    <RequireAuth>
      <main className="p-4 md:p-8 space-y-6">
        <h1 className="text-2xl font-semibold">Historial de envíos</h1>
        <p className="text-sm text-neutral-600">
          Aquí se mostrarán todos los embarques pasados. (Vista en construcción)
        </p>
      </main>
    </RequireAuth>
  );
}