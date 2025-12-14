// src/app/admin/preparado/_components/shared.tsx
import React from "react";

// Types
export type ShipmentType = "COMERCIAL" | "FRANQUICIA";

export type Box = {
  id: string;
  code: string; // número de caja
  clientId: string;
  type: ShipmentType; // COMERCIAL | FRANQUICIA
  country: string;
  itemIds: string[]; // inbound ids
  weightLb: number;
  createdAt?: number;
  shipmentId?: string | null; // embarque asignado
  status?: "open" | "closed"; // estado caja
  managerUid?: string | null;
};

export const COUNTRY_OPTIONS: { value: string; label: string }[] = [
  { value: "UY", label: "Uruguay" },
  { value: "AR", label: "Argentina" },
  { value: "US", label: "United States" },
];

export function countryLabel(code?: string) {
  const f = COUNTRY_OPTIONS.find(c => c.value === code);
  return f ? f.label : (code || " ");
}

// Compatibilidad: cajas viejas pueden tener country como etiqueta larga, otras como código.
export function countryMatches(docCountry: string | undefined, filterCode: string) {
  const label = countryLabel(filterCode);
  return docCountry === filterCode || docCountry === label;
}

// Minimal inline icons (no extra deps)
export const IconPlus = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 5v14M5 12h14"/></svg>
);

export const IconDownload = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
);

