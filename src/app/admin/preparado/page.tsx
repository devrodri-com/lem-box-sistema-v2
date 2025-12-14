// src/app/admin/preparado/page.tsx
"use client";
import RequireAuth from "@/components/RequireAuth";
import { PreparadoPageInner } from "./_components";

export default function PreparadoPage() {
  return (
    <RequireAuth requireAdmin>
      <PreparadoPageInner />
    </RequireAuth>
  );
}
