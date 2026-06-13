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
  price_offline: z.coerce.number().nonnegative().optional(),
  default_supplier_id: z.string().uuid().nullable().optional(),
  image_url: z.string().url().nullable().optional(),
});

export type ProductInput = z.infer<typeof productInputSchema>;

// ─── Product Condition Update ──────────────────────────────
export const productConditionInputSchema = z
  .object({
    product_id: z.string().uuid(),
    new_condition: z.enum(["normal", "defect", "dormant"]),
    reason: z.string().optional(),
  })
  .refine(
    (data) =>
      data.new_condition === "normal" ||
      (data.reason !== undefined && data.reason.trim().length > 0),
    {
      message: "Alasan wajib diisi jika status bukan normal",
      path: ["reason"],
    }
  );

export type ProductConditionInput = z.infer<typeof productConditionInputSchema>;

// ─── Product Update (now includes price_offline, condition, image) ──────────
export const productUpdateSchema = z.object({
  id: z.string().uuid(),
  hpp: z.coerce.number().nonnegative().optional(),
  sell_price: z.coerce.number().nonnegative().optional(),
  price_offline: z.coerce.number().nonnegative().optional(),
  color: z.string().optional(),
  image_url: z.string().url().nullable().optional().or(z.literal("")),
  default_supplier_id: z.string().uuid().nullable().optional(),
});

export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

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
export const packingSessionInputSchema = z
  .object({
    packed_by: z.string().uuid().optional(),
    platform: z.enum(["shopee", "tiktok", "tokopedia", "offline", "other"]),
    platform_order_id: z.string().optional(),
    courier: z.enum([
      "jne",
      "jnt",
      "sicepat",
      "anteraja",
      "gosend",
      "grabexpress",
      "offline",
      "other",
    ]),
    courier_custom: z.string().optional(),
  })
  .refine((d) => d.platform === "offline" || d.courier !== "offline", {
    message: "Kurir wajib dipilih jika platform bukan offline",
    path: ["courier"],
  });

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
  entity_type: z.enum([
    "product",
    "packing_session",
    "stock_movement",
    "purchase_batch",
  ]),
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

// ─── Customer (Phase 2) ────────────────────────────────────
export const customerChannelEnum = z.enum([
  "wa",
  "shopee",
  "tiktok",
  "tokopedia",
  "offline",
  "website",
  "mixed",
]);

export const customerInputSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi"),
  contact_person: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Email tidak valid").optional().or(z.literal("")),
  address: z.string().optional(),
  channel: customerChannelEnum.default("wa"),
  npwp: z.string().optional(),
  notes: z.string().optional(),
});

export type CustomerInput = z.infer<typeof customerInputSchema>;

// ─── Bank Account (Phase 3) ────────────────────────────────
export const bankAccountTypeEnum = z.enum([
  "cash",
  "bank",
  "ewallet",
  "marketplace_balance",
]);

export const bankAccountInputSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi"),
  type: bankAccountTypeEnum,
  bank_name: z.string().optional(),
  account_number: z.string().optional(),
  account_holder: z.string().optional(),
  opening_balance: z.coerce.number().default(0),
  currency: z.string().default("IDR"),
  is_default: z.boolean().default(false),
  notes: z.string().optional(),
});

export type BankAccountInput = z.infer<typeof bankAccountInputSchema>;

// ─── Purchase Order (Phase 2) ──────────────────────────────
export const poLineInputSchema = z
  .object({
    // Existing product line OR a manual new-product line (created on receive).
    product_id: z.string().uuid().optional(),
    ordered_qty: z.coerce.number().int().positive(),
    unit_cost: z.coerce.number().nonnegative(),
    notes: z.string().optional(),
    // New product spec (used when product_id is absent):
    new_brand: z.string().trim().optional(),
    new_model: z.string().trim().optional(),
    new_size: z.coerce.number().optional(),
    new_color: z.string().trim().optional(),
    new_sku: z.string().trim().optional(),
  })
  .refine(
    (l) =>
      !!l.product_id ||
      (!!l.new_brand && !!l.new_model && l.new_size != null && !!l.new_sku),
    { message: "Item baru wajib isi brand, model, size, dan SKU" },
  );

export const poPaymentTypeSchema = z.enum(["credit", "cash", "dp"]);
export type PoPaymentType = z.infer<typeof poPaymentTypeSchema>;

export const purchaseOrderInputSchema = z
  .object({
    supplier_id: z.string().uuid("Vendor wajib dipilih"),
    order_date: z.string().min(1),
    expected_date: z.string().optional().nullable(),
    tax: z.coerce.number().nonnegative().default(0),
    shipping: z.coerce.number().nonnegative().default(0),
    notes: z.string().optional(),
    lines: z.array(poLineInputSchema).min(1, "Minimal 1 item"),
    payment_type: poPaymentTypeSchema.default("credit"),
    dp_amount: z.coerce.number().nonnegative().default(0),
    dp_bank_account_id: z.string().uuid().nullable().optional(),
  })
  .refine(
    (d) => d.payment_type === "credit" || !!d.dp_bank_account_id,
    {
      message: "Pilih akun bank sumber dana untuk Bayar Lunas / DP",
      path: ["dp_bank_account_id"],
    },
  )
  .refine(
    (d) => d.payment_type !== "dp" || d.dp_amount > 0,
    {
      message: "Nominal DP harus lebih dari 0",
      path: ["dp_amount"],
    },
  );

export type PurchaseOrderInput = z.infer<typeof purchaseOrderInputSchema>;
export type PoLineInput = z.infer<typeof poLineInputSchema>;

export type PoStatus =
  | "draft"
  | "approved"
  | "receiving"
  | "completed"
  | "cancelled";

// ─── Receive PO (Phase 2 — Penerimaan) ─────────────────────
export const receivePoLineSchema = z.object({
  line_id: z.string().uuid(),
  receive_qty: z.coerce.number().int().nonnegative(),
});

export const receivePurchaseOrderSchema = z.object({
  po_id: z.string().uuid(),
  notes: z.string().optional(),
  lines: z.array(receivePoLineSchema).min(1),
});

export type ReceivePurchaseOrderInput = z.infer<
  typeof receivePurchaseOrderSchema
>;

// ─── Purchase Invoice (Phase 2 — Faktur Pembelian) ─────────
export const purchaseInvoiceInputSchema = z.object({
  supplier_id: z.string().uuid("Vendor wajib dipilih"),
  po_id: z.string().uuid().optional().nullable(),
  invoice_date: z.string().min(1),
  due_date: z.string().optional().nullable(),
  subtotal: z.coerce.number().nonnegative(),
  tax: z.coerce.number().nonnegative().default(0),
  total: z.coerce.number().nonnegative(),
  notes: z.string().optional(),
  attachment_url: z.string().url().optional().or(z.literal("")).nullable(),
});

export type PurchaseInvoiceInput = z.infer<typeof purchaseInvoiceInputSchema>;
export type PurchaseInvoiceStatus =
  | "unpaid"
  | "partial"
  | "paid"
  | "cancelled";

// ─── Vendor Payment (Phase 2 — Pembayaran Vendor) ──────────
export const paymentMethodEnum = z.enum([
  "cash",
  "bank_transfer",
  "marketplace",
  "other",
]);

export const paymentAllocationSchema = z.object({
  invoice_id: z.string().uuid(),
  amount: z.coerce.number().positive(),
});

export const vendorPaymentInputSchema = z.object({
  supplier_id: z.string().uuid("Vendor wajib dipilih"),
  payment_date: z.string().min(1),
  payment_method: paymentMethodEnum,
  bank_account_id: z.string().uuid().optional().nullable(),
  reference_no: z.string().optional(),
  notes: z.string().optional(),
  attachment_url: z.string().url().optional().or(z.literal("")).nullable(),
  allocations: z.array(paymentAllocationSchema).min(1, "Minimal 1 faktur"),
});

export type VendorPaymentInput = z.infer<typeof vendorPaymentInputSchema>;

// ─── Sales Invoice (Phase 3) ───────────────────────────────
export const salesInvoiceLineInputSchema = z.object({
  product_id: z.string().uuid(),
  qty: z.coerce.number().int().positive(),
  unit_price: z.coerce.number().nonnegative(),
  notes: z.string().optional(),
});

export const salesInvoiceInputSchema = z.object({
  customer_id: z.string().uuid().optional().nullable(),
  customer_name: z.string().min(1, "Nama customer wajib diisi"),
  channel: customerChannelEnum,
  invoice_date: z.string().min(1),
  due_date: z.string().optional().nullable(),
  discount: z.coerce.number().nonnegative().default(0),
  shipping: z.coerce.number().nonnegative().default(0),
  marketplace_fee: z.coerce.number().nonnegative().default(0),
  tax: z.coerce.number().nonnegative().default(0),
  marketplace_order_id: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(salesInvoiceLineInputSchema).min(1, "Minimal 1 item"),
});

export type SalesInvoiceInput = z.infer<typeof salesInvoiceInputSchema>;
export type SalesInvoiceLineInput = z.infer<typeof salesInvoiceLineInputSchema>;
export type SalesInvoiceStatus =
  | "draft"
  | "issued"
  | "partial"
  | "paid"
  | "cancelled";

// ─── Customer Payment (Phase 3 — Penerimaan Kas) ───────────
export const customerPaymentAllocationSchema = z.object({
  invoice_id: z.string().uuid(),
  amount: z.coerce.number().positive(),
});

export const customerPaymentInputSchema = z.object({
  customer_id: z.string().uuid().optional().nullable(),
  customer_name: z.string().min(1, "Nama customer wajib"),
  payment_date: z.string().min(1),
  payment_method: paymentMethodEnum,
  bank_account_id: z.string().uuid().optional().nullable(),
  reference_no: z.string().optional(),
  notes: z.string().optional(),
  attachment_url: z.string().url().optional().or(z.literal("")).nullable(),
  allocations: z
    .array(customerPaymentAllocationSchema)
    .min(1, "Minimal 1 invoice"),
});

export type CustomerPaymentInput = z.infer<typeof customerPaymentInputSchema>;

// ─── Bank Transaction (manual entry) ───────────────────────
export const bankTransactionTypeEnum = z.enum(["debit", "credit"]);

export const bankTransactionInputSchema = z.object({
  bank_account_id: z.string().uuid("Pilih akun"),
  transaction_date: z.string().min(1),
  type: bankTransactionTypeEnum,
  amount: z.coerce.number().positive("Jumlah harus > 0"),
  reference_no: z.string().optional(),
  description: z.string().min(1, "Deskripsi wajib"),
});

export type BankTransactionInput = z.infer<typeof bankTransactionInputSchema>;

// ─── Expenses (PDF Scope A1) ───────────────────────────────
export const expenseStatusEnum = z.enum([
  "draft",
  "approved",
  "paid",
  "rejected",
  "voided",
]);

export const expenseCategoryInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Nama kategori wajib diisi"),
  account_code: z.string().min(1, "Akun beban wajib dipilih"),
  sort_order: z.coerce.number().int().nonnegative().default(100),
  is_active: z.boolean().default(true),
});

export type ExpenseCategoryInput = z.infer<
  typeof expenseCategoryInputSchema
>;

export const expenseInputSchema = z.object({
  expense_date: z.string().min(1, "Tanggal wajib diisi"),
  category_id: z.string().uuid("Kategori wajib dipilih"),
  description: z.string().min(1, "Deskripsi wajib diisi"),
  amount: z.coerce.number().positive("Nominal harus lebih dari 0"),
  payment_method: paymentMethodEnum,
  bank_account_id: z.string().uuid("Akun kas/bank wajib dipilih"),
  receipt_path: z.string().optional().nullable(),
});

export type ExpenseInput = z.infer<typeof expenseInputSchema>;

// ─── POS Kasir Offline (PDF Scope A2) ─────────────────────
export const posCheckoutLineSchema = z.object({
  product_id: z.string().uuid(),
  qty: z.coerce.number().int().positive("Qty harus lebih dari 0"),
  unit_price: z.coerce.number().nonnegative("Harga tidak boleh negatif"),
});

export const posCheckoutSchema = z.object({
  customer_name: z.string().optional(),
  customer_id: z.string().uuid().optional(),
  invoice_date: z.string().min(1, "Tanggal wajib diisi"),
  payment_method: paymentMethodEnum,
  bank_account_id: z.string().uuid("Akun kas/bank wajib dipilih"),
  reference_no: z.string().optional(),
  discount: z.coerce.number().nonnegative().default(0),
  tax: z.coerce.number().nonnegative().default(0),
  notes: z.string().optional(),
  lines: z.array(posCheckoutLineSchema).min(1, "Minimal 1 item"),
});

export type PosCheckoutInput = z.infer<typeof posCheckoutSchema>;
export type PosCheckoutLineInput = z.infer<typeof posCheckoutLineSchema>;

// ─── Stock Opname (PDF Scope A3) ──────────────────────────
export const startStockOpnameSchema = z.object({
  opname_date: z.string().min(1, "Tanggal wajib diisi"),
  scope: z.string().min(1).default("all"),
  notes: z.string().optional(),
  product_ids: z.array(z.string().uuid()).optional(),
});

export const stockOpnameCountLineSchema = z.object({
  line_id: z.string().uuid(),
  physical_qty: z.coerce.number().int().nonnegative(),
  reason: z.string().optional(),
});

export const stockOpnameCountSchema = z.object({
  session_id: z.string().uuid(),
  lines: z.array(stockOpnameCountLineSchema).min(1, "Minimal 1 baris"),
});

export type StartStockOpnameInput = z.infer<typeof startStockOpnameSchema>;
export type StockOpnameCountInput = z.infer<typeof stockOpnameCountSchema>;

// ─── Fiscal Period Lock (PDF Scope A4) ────────────────────
export const fiscalPeriodSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  reason: z.string().min(1, "Alasan wajib diisi"),
});

export type FiscalPeriodInput = z.infer<typeof fiscalPeriodSchema>;

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
