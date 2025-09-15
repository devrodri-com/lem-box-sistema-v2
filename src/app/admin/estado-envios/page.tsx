// /src/app/admin/estado-envios/page.tsx
"use client";
import RequireAuth from "@/components/RequireAuth";

export default function EstadoEnviosPage() {
  return (
    <RequireAuth>
      <main className="p-4 md:p-8 space-y-6">
        <h1 className="text-2xl font-semibold">Estado de envíos</h1>
        <p className="text-sm text-neutral-600">
          Aquí se verán los embarques en curso con su estado (En Proceso, En Tránsito, En Destino). (Vista en construcción)
        </p>
      </main>
    </RequireAuth>
  );
}