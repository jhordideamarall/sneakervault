import type {
  Courier,
  Platform,
  Role,
  ProductCondition,
  PriceChannel,
} from "./types";

export const ROLES: Role[] = [
  "owner",
  "admin_gudang",
  "admin_online",
  "shopkeeper",
  "finance",
];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin_gudang: "Admin Gudang",
  admin_online: "Admin Online",
  shopkeeper: "Shopkeeper",
  finance: "Finance",
};

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

export const PRODUCT_CONDITIONS: {
  value: ProductCondition;
  label: string;
  description: string;
  tone: "neutral" | "warning" | "danger";
}[] = [
  {
    value: "normal",
    label: "Normal",
    description: "Siap dijual penuh",
    tone: "neutral",
  },
  {
    value: "defect",
    label: "Defect",
    description: "Cacat, perlu dijual diskon",
    tone: "danger",
  },
  {
    value: "dormant",
    label: "Lama Tidak Laku",
    description: "Aging — review harga",
    tone: "warning",
  },
];

import type { CustomerChannel } from "./types";

export const CUSTOMER_CHANNELS: { value: CustomerChannel; label: string }[] = [
  { value: "wa", label: "WhatsApp" },
  { value: "shopee", label: "Shopee" },
  { value: "tiktok", label: "TikTok Shop" },
  { value: "tokopedia", label: "Tokopedia" },
  { value: "offline", label: "Offline / Toko" },
  { value: "website", label: "Website" },
  { value: "mixed", label: "Campuran" },
];

import type { BankAccountType, PaymentMethod, CoaType } from "./types";

export const BANK_ACCOUNT_TYPES: {
  value: BankAccountType;
  label: string;
  description: string;
}[] = [
  { value: "cash", label: "Kas Tunai", description: "Uang fisik di kasir" },
  { value: "bank", label: "Rekening Bank", description: "BCA, BRI, Mandiri, dll" },
  { value: "ewallet", label: "E-Wallet", description: "OVO, GoPay, Dana, ShopeePay" },
  {
    value: "marketplace_balance",
    label: "Saldo Marketplace",
    description: "Saldo penjualan Shopee/TikTok belum cair",
  },
];

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Tunai" },
  { value: "bank_transfer", label: "Transfer Bank" },
  { value: "marketplace", label: "Marketplace" },
  { value: "other", label: "Lainnya" },
];

export const COA_TYPE_LABELS: Record<CoaType, string> = {
  asset: "Aset",
  liability: "Liabilitas",
  equity: "Ekuitas",
  revenue: "Pendapatan",
  cogs: "Harga Pokok Penjualan",
  expense: "Beban",
};

import type {
  PoStatus,
  PurchaseInvoiceStatus,
  SalesInvoiceStatus,
} from "./validators";

export const SALES_INVOICE_STATUS_LABELS: Record<SalesInvoiceStatus, string> = {
  draft: "Draft",
  issued: "Terbit",
  partial: "Sebagian Bayar",
  paid: "Lunas",
  cancelled: "Dibatalkan",
};

export const SALES_INVOICE_STATUS_TONES: Record<SalesInvoiceStatus, string> = {
  draft: "bg-white/10 text-white/70 border-white/15",
  issued: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  partial: "bg-sky-500/15 text-sky-300 border-sky-500/20",
  paid: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  cancelled: "bg-red-500/15 text-red-300 border-red-500/20",
};

export const PURCHASE_INVOICE_STATUS_LABELS: Record<
  PurchaseInvoiceStatus,
  string
> = {
  unpaid: "Belum Dibayar",
  partial: "Sebagian Dibayar",
  paid: "Lunas",
  cancelled: "Dibatalkan",
};

export const PURCHASE_INVOICE_STATUS_TONES: Record<
  PurchaseInvoiceStatus,
  string
> = {
  unpaid: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  partial: "bg-sky-500/15 text-sky-300 border-sky-500/20",
  paid: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  cancelled: "bg-red-500/15 text-red-300 border-red-500/20",
};

export const PO_STATUS_LABELS: Record<PoStatus, string> = {
  draft: "Draft",
  approved: "Disetujui",
  receiving: "Sedang Diterima",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

export const PO_STATUS_TONES: Record<PoStatus, string> = {
  draft: "bg-white/10 text-white/70 border-white/15",
  approved: "bg-sky-500/15 text-sky-300 border-sky-500/20",
  receiving: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  completed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  cancelled: "bg-red-500/15 text-red-300 border-red-500/20",
};

export const COA_TYPE_TONES: Record<CoaType, string> = {
  asset: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
  liability: "text-amber-300 bg-amber-500/10 border-amber-500/20",
  equity: "text-violet-300 bg-violet-500/10 border-violet-500/20",
  revenue: "text-sky-300 bg-sky-500/10 border-sky-500/20",
  cogs: "text-orange-300 bg-orange-500/10 border-orange-500/20",
  expense: "text-pink-300 bg-pink-500/10 border-pink-500/20",
};

export const PRICE_CHANNELS: { value: PriceChannel; label: string }[] = [
  { value: "online", label: "Online (Shopee / TikTok / Marketplace)" },
  { value: "offline", label: "Offline (WA / Transfer / Website Toko)" },
];

/**
 * Platform → price channel mapping. Used saat packing untuk menentukan harga
 * yang dipakai dari produk. Offline platform → price_offline, else → sell_price.
 */
export const PLATFORM_PRICE_CHANNEL: Record<Platform, PriceChannel> = {
  shopee: "online",
  tiktok: "online",
  tokopedia: "online",
  offline: "offline",
  other: "online", // default ke online untuk platform lain-lain
};

/**
 * Status display maps — single source of truth for badge label + tone across
 * modules (packing/order, return, delete request, expense, stock opname). Tone
 * names map to the `Badge` `tone` prop. Use with `<Badge tone={MAP[status]}>`.
 */
export type BadgeTone =
  | "default"
  | "warning"
  | "info"
  | "success"
  | "danger"
  | "neutral";

// Packing session / order status (packing_sessions.status)
export const ORDER_STATUS_LABELS: Record<string, string> = {
  packing: "Packing",
  shipped: "Dikirim",
  completed: "Selesai",
  has_return: "Retur",
  cancelled: "Batal",
};
export const ORDER_STATUS_TONES: Record<string, BadgeTone> = {
  packing: "warning",
  shipped: "info",
  completed: "success",
  has_return: "danger",
  cancelled: "neutral",
};

// Return status (returns.status)
export const RETURN_STATUS_LABELS: Record<string, string> = {
  pending: "Menunggu Verifikasi",
  verified: "Siap Diproses",
  processed: "Selesai Diproses",
  cancelled: "Dibatalkan",
};
export const RETURN_STATUS_TONES: Record<string, BadgeTone> = {
  pending: "warning",
  verified: "info",
  processed: "success",
  cancelled: "neutral",
};

// Delete request status (delete_requests.status)
export const DELETE_REQUEST_STATUS_LABELS: Record<string, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
};
export const DELETE_REQUEST_STATUS_TONES: Record<string, BadgeTone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

// Expense status (expenses.status)
export const EXPENSE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  approved: "Disetujui",
  paid: "Dibayar",
  rejected: "Ditolak",
  voided: "Void",
};
export const EXPENSE_STATUS_TONES: Record<string, BadgeTone> = {
  draft: "neutral",
  approved: "info",
  paid: "success",
  rejected: "danger",
  voided: "warning",
};

// Stock opname session status (stock_opname_sessions.status)
export const STOCK_OPNAME_STATUS_LABELS: Record<string, string> = {
  open: "Dibuka",
  counting: "Menghitung",
  review: "Review",
  approved: "Disetujui",
  cancelled: "Dibatalkan",
};
export const STOCK_OPNAME_STATUS_TONES: Record<string, BadgeTone> = {
  open: "info",
  counting: "info",
  review: "warning",
  approved: "success",
  cancelled: "danger",
};
