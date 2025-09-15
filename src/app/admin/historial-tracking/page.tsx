// src/app/admin/historial-tracking/page.tsx
"use client";
import RequireAuth from "@/components/RequireAuth";

export default function HistorialTrackingPage() {
  return (
    <RequireAuth>
      <main className="p-4 md:p-8 space-y-6">
        <h1 className="text-2xl font-semibold">Historial de tracking</h1>
        <p className="text-sm text-neutral-600">
          Aquí se mostrarán todos los trackings: empacados (ya en caja) y sin empacar (sueltos en warehouse). (Vista en construcción)
        </p>
      </main>
    </RequireAuth>
  );
}