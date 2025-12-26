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
  managerUid?: string | null;
}

export interface Inbound {
  id?: string;
  tracking: string; // único
  carrier: Carrier;
  clientId: string;
  weightLb: number;
  weightKg?: number;
  photoUrl?: string; // legacy, mantener para compatibilidad
  photoUrls?: string[]; // nuevo, array de URLs
  invoiceUrl?: string;
  status?: "received" | "boxed" | "void";
  receivedAt?: number;
  managerUid?: string | null;
}

export interface Box {
  id?: string;
  code: string; // human-readable code for label
  clientId: string;
  itemIds?: string[]; // inbound IDs
  weightLb?: number;
  weightOverrideLb?: number | null;
  status: "open" | "closed" | "shipped" | "delivered";
  createdAt?: number;
  closedAt?: number;
  shippedAt?: number;
  deliveredAt?: number;
  managerUid?: string | null;
}

export interface Shipment {
  id?: string;
  code: string;
  country: string;
  type: "COMERCIAL" | "FRANQUICIA";
  status: "open" | "shipped" | "arrived" | "closed";
  boxIds?: string[];
  clientIds?: string[];
  managerUids?: string[];
  openedAt?: number;
  closedAt?: number;
  arrivedAt?: number;
}

export interface TrackingAlert {
  id?: string;
  uid: string;
  clientId: string;
  tracking: string;
  note?: string;
  createdAt?: number;
  managerUid?: string | null;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPriceUsd: number;
  totalUsd: number;
}

export interface Invoice {
  id?: string;
  shipmentId: string;
  shipmentCode?: string;
  clientId: string;
  currency: "usd";
  status: "draft" | "open" | "paid" | "void";
  items: InvoiceItem[];
  totalUsd: number;
  createdAt: number;
  publishedAt?: number;
  paidAt?: number;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
}

/**
 * Normaliza el estado de una invoice, convirtiendo estados legacy a los nuevos.
 * Fallback para datos existentes en dev que puedan tener "published" o "cancelled".
 */
export function normalizeInvoiceStatus(status: string): Invoice["status"] {
  if (status === "published") return "open";
  if (status === "cancelled") return "void";
  if (status === "draft" || status === "open" || status === "paid" || status === "void") {
    return status as Invoice["status"];
  }
  // Fallback a "draft" si el estado es desconocido
  return "draft";
}
