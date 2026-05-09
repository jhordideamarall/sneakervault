export type Role = "owner" | "admin_gudang" | "admin_online" | "shopkeeper";

export type Platform = "shopee" | "tiktok" | "tokopedia" | "offline" | "other";

export type Courier =
  | "jne"
  | "jnt"
  | "sicepat"
  | "anteraja"
  | "gosend"
  | "grabexpress"
  | "offline"
  | "other";

export type SessionStatus =
  | "packing"
  | "shipped"
  | "completed"
  | "has_return"
  | "cancelled";

export type StockMovementType =
  | "inbound"
  | "outbound"
  | "return_in"
  | "return_out"
  | "adjustment";

export type ReturnType = "exchange_size" | "refund";

export type ReturnStatus = "pending" | "verified" | "processed" | "cancelled";

export type DeleteRequestStatus = "pending" | "approved" | "rejected";
