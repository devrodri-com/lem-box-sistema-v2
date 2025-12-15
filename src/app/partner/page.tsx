// src/app/partner/page.tsx
"use client";

import { usePartnerContext } from "@/components/PartnerContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function PartnerPage() {
  const { scopedClientIds, effectiveRole } = usePartnerContext();
  const router = useRouter();

  useEffect(() => {
    // Redirect to clientes by default
    router.replace("/partner/clientes");
  }, [router]);

  return (
    <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 space-y-4">
      <p className="text-sm text-white/60">Redirigiendo…</p>
    </div>
  );
}

