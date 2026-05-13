export type Role =
  | "owner"
  | "admin_gudang"
  | "admin_online"
  | "shopkeeper"
  | "finance";

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

/**
 * Physical condition of a product (orthogonal to is_active soft-delete).
 *
 * - normal: barang siap dijual penuh
 * - defect: cacat, masih di gudang, biasanya dijual diskon
 * - dormant: aging — tidak laku dalam waktu lama, flag buat review owner
 *
 * Source: meeting 2 — client minta "stok aktif vs non-aktif" + defect bisa di-update kapan saja.
 */
export type ProductCondition = "normal" | "defect" | "dormant";

/**
 * Customer channel — channel transaksi utama customer (Phase 2 addition).
 * Bukan eksklusif: customer dengan channel "wa" tetap bisa beli di Shopee.
 */
export type CustomerChannel =
  | "wa"
  | "shopee"
  | "tiktok"
  | "offline"
  | "website"
  | "mixed";

export type BankAccountType =
  | "cash"
  | "bank"
  | "ewallet"
  | "marketplace_balance";

export type PaymentMethod =
  | "cash"
  | "bank_transfer"
  | "marketplace"
  | "other";

export type CoaType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense"
  | "cogs";

export type CoaNormalBalance = "debit" | "credit";

/**
 * Price channel: which price applies based on sale channel.
 *
 * Online (Shopee/TikTok/Tokopedia/marketplace) use `price_online` (mapped ke
 * existing sell_price). Offline (WA, transfer langsung, website toko sendiri)
 * use `price_offline` (lebih murah per kebijakan client).
 */
export type PriceChannel = "online" | "offline";
