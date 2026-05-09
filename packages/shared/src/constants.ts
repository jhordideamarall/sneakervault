import type { Courier, Platform, Role } from "./types";

export const ROLES: Role[] = [
  "owner",
  "admin_gudang",
  "admin_online",
  "shopkeeper",
];

export const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "shopee", label: "Shopee" },
  { value: "tiktok", label: "TikTok Shop" },
  { value: "tokopedia", label: "Tokopedia" },
  { value: "offline", label: "Offline / Toko Fisik" },
  { value: "other", label: "Lainnya" },
];

export const COURIERS: { value: Courier; label: string }[] = [
  { value: "jne", label: "JNE" },
  { value: "jnt", label: "J&T" },
  { value: "sicepat", label: "SiCepat" },
  { value: "anteraja", label: "Anteraja" },
  { value: "gosend", label: "GoSend" },
  { value: "grabexpress", label: "GrabExpress" },
  { value: "offline", label: "Ambil Sendiri" },
  { value: "other", label: "Lainnya" },
];
