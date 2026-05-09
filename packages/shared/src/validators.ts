import { z } from "zod";

// ─── Product ───────────────────────────────────────────────
export const productInputSchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  sku: z.string().min(1),
  size: z.coerce.number().positive(),
  color: z.string().min(1),
  barcode: z.string().min(1),
  quantity: z.coerce.number().int().nonnegative().default(0),
  hpp: z.coerce.number().nonnegative().default(0),
  sell_price: z.coerce.number().nonnegative(),
  default_supplier_id: z.string().uuid().nullable().optional(),
  image_url: z.string().url().nullable().optional(),
});

export type ProductInput = z.infer<typeof productInputSchema>;

// ─── Purchase Batch ────────────────────────────────────────
export const purchaseBatchInputSchema = z.object({
  supplier_id: z.string().uuid(),
  brand: z.string().min(1),
  model: z.string().min(1),
  product_id: z.string().uuid().nullable().optional(),
  quantity: z.coerce.number().int().positive(),
  defect_quantity: z.coerce.number().int().nonnegative().default(0),
  returned_to_supplier: z.coerce.number().int().nonnegative().default(0),
  unit_cost: z.coerce.number().nonnegative(),
  authenticity_confirmed: z.boolean().default(false),
  notes: z.string().optional(),
  ordered_at: z.string().datetime(),
  received_at: z.string().datetime().optional(),
});

export type PurchaseBatchInput = z.infer<typeof purchaseBatchInputSchema>;

// ─── Packing Session ───────────────────────────────────────
export const packingSessionInputSchema = z.object({
  packed_by: z.string().uuid().optional(),
  platform: z.enum(["shopee", "tiktok", "tokopedia", "offline", "other"]),
  platform_order_id: z.string().optional(),
  courier: z.enum(["jne", "jnt", "sicepat", "anteraja", "gosend", "grabexpress", "offline", "other"]),
  courier_custom: z.string().optional(),
}).refine(
  (d) => d.platform === "offline" || d.courier !== "offline",
  { message: "Kurir wajib dipilih jika platform bukan offline", path: ["courier"] }
);

export type PackingSessionInput = z.infer<typeof packingSessionInputSchema>;

// ─── Return ────────────────────────────────────────────────
export const initiateReturnSchema = z.object({
  packing_item_id: z.string().uuid(),
  type: z.enum(["exchange_size", "refund"]),
  reason: z.string().min(1, "Alasan pengembalian wajib diisi"),
});

export const processReturnSchema = z.object({
  return_id: z.string().uuid(),
  new_size: z.coerce.number().positive().optional(),
  new_product_id: z.string().uuid().optional(),
});

export type InitiateReturnInput = z.infer<typeof initiateReturnSchema>;
export type ProcessReturnInput = z.infer<typeof processReturnSchema>;

// ─── Delete Request ────────────────────────────────────────
export const deleteRequestInputSchema = z.object({
  entity_type: z.enum(["product", "packing_session", "stock_movement", "purchase_batch"]),
  entity_id: z.string().uuid(),
  reason: z.string().min(1, "Alasan wajib diisi"),
});

export type DeleteRequestInput = z.infer<typeof deleteRequestInputSchema>;

// ─── Supplier ──────────────────────────────────────────────
export const supplierInputSchema = z.object({
  name: z.string().min(1),
  contact_person: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  notes: z.string().optional(),
});

export type SupplierInput = z.infer<typeof supplierInputSchema>;

// ─── Auth ──────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().email("Email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
});

export const registerSchema = loginSchema.extend({
  full_name: z.string().min(1, "Nama wajib diisi"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

// ─── Confirm Inbound ───────────────────────────────────────
export const confirmInboundSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.coerce.number().int().positive(),
  batch_data: purchaseBatchInputSchema,
});

export type ConfirmInboundInput = z.infer<typeof confirmInboundSchema>;

// ─── Status Update ─────────────────────────────────────────
export const updateSessionStatusSchema = z.object({
  session_id: z.string().uuid(),
  status: z.enum(["shipped", "completed", "has_return"]),
});

export type UpdateSessionStatusInput = z.infer<typeof updateSessionStatusSchema>;
