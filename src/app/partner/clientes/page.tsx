// src/app/partner/clientes/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePartnerContext } from "@/components/PartnerContext";

export default function PartnerClientesPage() {
  const router = useRouter();
  const { roleResolved } = usePartnerContext();

  useEffect(() => {
    if (roleResolved) {
      router.replace("/admin/clientes");
    }
  }, [roleResolved, router]);

  if (!roleResolved) {
    return (
      <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 space-y-4">
        <p className="text-sm text-white/60">Cargando permisos…</p>
      </div>
    );
  }

  return null;
}
