// src/app/admin/usuarios/page.tsx
"use client";
import RequireAuth from "@/components/RequireAuth";

export default function UsuariosPage() {
  return (
    <RequireAuth>
      <main className="p-4 md:p-8 space-y-6">
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        <p className="text-sm text-neutral-600">
          Aquí se gestionarán los usuarios administradores y operadores, con roles y permisos diferenciados. (Vista en construcción)
        </p>
      </main>
    </RequireAuth>
  );
}
