// src/types/lem.ts
export type Role = "admin" | "op" | "client";
export type Carrier = "UPS" | "FedEx" | "USPS" | "DHL" | "Amazon" | "Other";

export interface Client {
  id: string;
  code: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  country: "UY" | "US" | "AR";
  activo?: boolean;
  createdAt: number;
}

export interface Inbound {
  id: string;
  tracking: string; // único
  carrier: Carrier;
  clientId: string;
  weightLb: number;
  photoUrl?: string;
  status: "received" | "boxed" | "void";
  receivedAt: number;
}

export interface Box {
  id: string;
  code: string; // human-readable code for label
  clientId: string;
  itemIds: string[]; // inbound IDs
  weightLb: number;
  status: "open" | "closed" | "shipped" | "delivered";
  createdAt: number;
  closedAt?: number;
  shippedAt?: number;
  deliveredAt?: number;
}
