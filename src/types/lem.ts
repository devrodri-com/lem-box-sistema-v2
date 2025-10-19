// src/types/lem.ts
export type Role = "admin" | "op" | "client";
export type Carrier = "UPS" | "FedEx" | "USPS" | "DHL" | "Amazon" | "Other";

export interface Client {
  id?: string;
  readonly code: string; // código único no editable
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  country: string; // libre, no union restringido
  state?: string;
  city?: string;
  contact?: string; // referente (Danny, IFS, etc.)
  docType?: string;     // Tipo de documento (Cédula/DNI/Pasaporte/RUT/Otro)
  docNumber?: string;   // Número del documento
  postalCode?: string;  // Código postal
  emailAlt?: string;    // Email adicional
  activo?: boolean;
  createdAt?: number;
}

export interface Inbound {
  id?: string;
  tracking: string; // único
  carrier: Carrier;
  clientId: string;
  weightLb: number;
  weightKg?: number;
  photoUrl?: string;
  invoiceUrl?: string;
  status?: "received" | "boxed" | "void";
  receivedAt?: number;
}

export interface Box {
  id?: string;
  code: string; // human-readable code for label
  clientId: string;
  itemIds?: string[]; // inbound IDs
  weightLb?: number;
  status: "open" | "closed" | "shipped" | "delivered";
  createdAt?: number;
  closedAt?: number;
  shippedAt?: number;
  deliveredAt?: number;
}
