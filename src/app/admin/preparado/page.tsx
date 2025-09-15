// src/app/admin/preparado/page.tsx
"use client";
import RequireAuth from "@/components/RequireAuth";

export default function PreparadoPage() {
  return (
    <RequireAuth>
      <main className="p-4 md:p-8 space-y-6">
        <h1 className="text-2xl font-semibold">Preparado de carga</h1>
        <p className="text-sm text-neutral-600">
          Aquí irá la lógica para crear cajas y embarques. (Vista en construcción)
        </p>
      </main>
    </RequireAuth>
  );
}