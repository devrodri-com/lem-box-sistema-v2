// src/components/ConditionalNav.tsx
"use client";

import { usePathname } from "next/navigation";
import AdminNav from "@/components/AdminNav";
import PartnerNav from "@/components/PartnerNav";

export function ConditionalNav() {
  const pathname = usePathname() ?? "";

  // Si la ruta empieza con /partner, usar PartnerNav
  if (pathname.startsWith("/partner")) {
    return <PartnerNav />;
  }

  // Para todas las demás rutas (admin, mi, etc.), usar AdminNav
  return <AdminNav />;
}

