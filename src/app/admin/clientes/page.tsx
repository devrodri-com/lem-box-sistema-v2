// src/app/admin/clientes/page.tsx
"use client";
import RequireAuth from "@/components/RequireAuth";
import { ClientsManager } from "@/components/clients/ClientsManager";

export default function ClientesPage() {
  return (
    <RequireAuth requireAdmin>
      <main className="min-h-[100dvh] bg-[#02120f] text-white flex flex-col items-center p-4 md:p-8 pt-24 md:pt-28">
        <ClientsManager />
      </main>
    </RequireAuth>
  );
}
