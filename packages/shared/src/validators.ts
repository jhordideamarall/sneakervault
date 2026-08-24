import { z } from "zod";

// ─── Product ───────────────────────────────────────────────
export const productInputSchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  sku: z.string().min(1),
  // Free-text size (mis. Adidas "42 2/3", "37,5", "40"). Numerik `size` di DB
  // diturunkan otomatis oleh trigger products_sync_size untuk sorting.
  size_label: z.string().trim().min(1),
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

export const sharedProductSchema = z.object({
  brand: z.string().trim().min(1, "Brand wajib diisi"),
  model: z.string().trim().min(1, "Model wajib diisi"),
  sku: z.string().trim().min(1, "SKU wajib diisi"),
  color: z.string().trim().min(1, "Warna wajib diisi"),
  image_url: z.string().url("URL foto tidak valid").nullable().optional(),
  hpp: z.coerce.number().nonnegative("HPP tidak boleh negatif").default(0),
});

export const productVariantInputSchema = z.object({
  size_label: z.string().trim().min(1, "Size wajib diisi"),
  barcode: z.string().trim().min(1, "Barcode wajib diisi"),
  sell_price: z.coerce.number().nonnegative("Harga online tidak boleh negatif"),
  price_offline: z.coerce.number().nonnegative("Harga offline tidak boleh negatif"),
  price_website: z.coerce.number().nonnegative("Harga website tidak boleh negatif"),
  price_shopee: z.coerce.number().nonnegative("Harga Shopee tidak boleh negatif"),
  price_tiktok: z.coerce.number().nonnegative("Harga TikTok tidak boleh negatif"),
  price_tokopedia: z.coerce.number().nonnegative("Harga Tokopedia tidak boleh negatif"),
});

export const createProductVariantsBatchSchema = z
  .object({
    sharedProduct: sharedProductSchema,
    variants: z
      .array(productVariantInputSchema)
      .min(1, "Minimal satu variant size")
      .max(100, "Maksimal 100 variant dalam satu penyimpanan"),
  })
  .superRefine((value, ctx) => {
    const sizes = new Set<string>();
    const barcodes = new Set<string>();
    value.variants.forEach((variant, index) => {
      const sizeKey = variant.size_label.replace(/,/g, ".").toLowerCase();
      if (sizes.has(sizeKey)) {
        ctx.addIssue({
          code: "custom",
          message: "Size duplikat dalam daftar variant",
          path: ["variants", index, "size_label"],
        });
      }
      sizes.add(sizeKey);

      const barcodeKey = variant.barcode.toLowerCase();
      if (barcodes.has(barcodeKey)) {
        ctx.addIssue({
          code: "custom",
          message: "Barcode duplikat dalam daftar variant",
          path: ["variants", index, "barcode"],
        });
      }
      barcodes.add(barcodeKey);
    });
  });

export type SharedProductInput = z.infer<typeof sharedProductSchema>;
export type ProductVariantInput = z.infer<typeof productVariantInputSchema>;
export type CreateProductVariantsBatchInput = z.infer<
  typeof createProductVariantsBatchSchema
>;

export const addProductVariantToSkuSchema = z.object({
  source_product_id: z.string().uuid(),
  variant: productVariantInputSchema,
});

export type AddProductVariantToSkuInput = z.infer<
  typeof addProductVariantToSkuSchema
>;

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
  brand: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  sku: z.string().trim().min(1).optional(),
  size_label: z.string().trim().min(1).optional(),
  hpp: z.coerce.number().nonnegative().optional(),
  sell_price: z.coerce.number().nonnegative().optional(),
  price_offline: z.coerce.number().nonnegative().optional(),
  price_website: z.coerce.number().nonnegative().nullable().optional(),
  price_shopee: z.coerce.number().nonnegative().nullable().optional(),
  price_tiktok: z.coerce.number().nonnegative().nullable().optional(),
  price_tokopedia: z.coerce.number().nonnegative().nullable().optional(),
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
    platform: z.enum([
      "shopee",
      "tiktok",
      "tokopedia",
      "wa",
      "website",
      "offline",
      "other",
    ]),
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
  .refine(
    (d) => d.platform === "offline" || !!d.platform_order_id?.trim(),
    {
      message: "Nomor order atau referensi wajib diisi untuk pesanan online",
      path: ["platform_order_id"],
    },
  )
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
  refund_bank_account_id: z.string().uuid().optional(),
  refund_amount: z.coerce.number().positive("Nominal refund harus lebih dari 0").optional(),
  refund_date: z.string().min(1, "Tanggal refund wajib diisi").optional(),
  refund_reference_no: z.string().trim().max(100).optional(),
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

export const coaTypeEnum = z.enum([
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
  "cogs",
]);

export const coaNormalBalanceEnum = z.enum(["debit", "credit"]);

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

// ─── Chart of Accounts ───────────────────────────────────
export const coaInputSchema = z.object({
  code: z.string().trim().min(1, "Kode akun wajib diisi"),
  name: z.string().trim().min(1, "Nama akun wajib diisi"),
  type: coaTypeEnum,
  normal_balance: coaNormalBalanceEnum,
  parent_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().default(true),
  description: z.string().trim().optional().nullable(),
});

export type CoaInput = z.infer<typeof coaInputSchema>;

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
    new_size_label: z.string().trim().optional(),
    new_color: z.string().trim().optional(),
    new_sku: z.string().trim().optional(),
  })
  .refine(
    (l) =>
      !!l.product_id ||
      (!!l.new_brand &&
        !!l.new_model &&
        (l.new_size != null || !!l.new_size_label) &&
        !!l.new_sku),
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
export const purchaseInvoiceLineInputSchema = z
  .object({
    product_id: z.string().uuid().optional().nullable(),
    product_label: z.string().trim().optional(),
    qty: z.coerce.number().int().positive(),
    unit_cost: z.coerce.number().nonnegative(),
    notes: z.string().optional(),
    new_brand: z.string().trim().optional(),
    new_model: z.string().trim().optional(),
    new_size: z.coerce.number().optional(),
    new_size_label: z.string().trim().optional(),
    new_color: z.string().trim().optional(),
    new_sku: z.string().trim().optional(),
  })
  .refine(
    (line) =>
      !!line.product_id ||
      (!!line.new_brand &&
        !!line.new_model &&
        (line.new_size != null || !!line.new_size_label) &&
        !!line.new_sku),
    { message: "Item manual wajib isi brand, model, size, dan SKU" },
  );

export const purchaseInvoiceInputSchema = z
  .object({
    supplier_id: z.string().uuid("Vendor wajib dipilih"),
    po_id: z.string().uuid().optional().nullable(),
    invoice_date: z.string().min(1),
    due_date: z.string().optional().nullable(),
    subtotal: z.coerce.number().nonnegative(),
    tax: z.coerce.number().nonnegative().default(0),
    total: z.coerce.number().nonnegative(),
    notes: z.string().optional(),
    attachment_url: z.string().url().optional().or(z.literal("")).nullable(),
    lines: z.array(purchaseInvoiceLineInputSchema).optional(),
  })
  .refine((data) => !!data.po_id || (data.lines?.length ?? 0) > 0, {
    message: "Faktur manual wajib punya minimal 1 item",
    path: ["lines"],
  });

export type PurchaseInvoiceInput = z.infer<typeof purchaseInvoiceInputSchema>;
export type PurchaseInvoiceLineInput = z.infer<
  typeof purchaseInvoiceLineInputSchema
>;
export type PurchaseInvoiceStatus =
  | "unpaid"
  | "partial"
  | "paid"
  | "cancelled";

// ─── Pre Order ────────────────────────────────────────────
export const preOrderSourceSchema = z.enum(["manual", "marketplace"]);

export const preOrderChannelSchema = z.enum([
  "manual",
  "wa",
  "shopee",
  "tiktok",
  "tokopedia",
  "offline",
  "website",
  "other",
]);

export const preOrderStatusSchema = z.enum([
  "review",
  "ready_from_stock",
  "needs_purchase",
  "purchase_created",
  "waiting_stock",
  "ready_to_pack",
  "packed",
  "cancelled",
]);

export const preOrderLineInputSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  sku: z.string().trim().min(1, "SKU wajib diisi"),
  product_name: z.string().trim().min(1, "Nama produk wajib diisi"),
  brand: z.string().trim().optional(),
  model: z.string().trim().optional(),
  color: z.string().trim().optional(),
  size_label: z.string().trim().min(1, "Size wajib dipilih atau diisi custom"),
  size_value: z.coerce.number().positive().optional().nullable(),
  requested_qty: z.coerce.number().int().positive("Qty harus lebih dari 0"),
  unit_price: z.coerce.number().nonnegative().default(0),
  estimated_cost: z.coerce.number().nonnegative().default(0),
  notes: z.string().trim().optional(),
});

export const preOrderInputSchema = z
  .object({
    source: preOrderSourceSchema.default("manual"),
    channel: preOrderChannelSchema.default("manual"),
    marketplace_order_id: z.string().trim().optional(),
    customer_id: z.string().uuid().optional().nullable(),
    customer_name: z.string().trim().min(1, "Nama customer wajib diisi"),
    order_date: z.string().min(1, "Tanggal order wajib diisi"),
    deadline_date: z.string().optional().nullable(),
    marketplace_status: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    lines: z.array(preOrderLineInputSchema).min(1, "Minimal 1 item"),
  })
  .refine(
    (d) => d.source !== "marketplace" || !!d.marketplace_order_id?.trim(),
    {
      message: "Nomor order marketplace wajib diisi untuk Pre Order Marketplace",
      path: ["marketplace_order_id"],
    },
  )
  .refine(
    (d) =>
      ["offline", "manual"].includes(d.channel) ||
      !!d.marketplace_order_id?.trim(),
    {
      message:
        "Nomor order atau referensi wajib diisi agar preorder bisa dicocokkan saat packing",
      path: ["marketplace_order_id"],
    },
  )
  .refine((d) => d.source !== "marketplace" || d.channel !== "manual", {
    message: "Channel marketplace wajib Shopee, TikTok, Tokopedia, atau platform lain",
    path: ["channel"],
  });

export type PreOrderInput = z.infer<typeof preOrderInputSchema>;
export type PreOrderLineInput = z.infer<typeof preOrderLineInputSchema>;
export type PreOrderStatusInput = z.infer<typeof preOrderStatusSchema>;

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
  counterpart_account_id: z.string().uuid("Pilih akun lawan transaksi"),
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

export const incrementStockOpnameSchema = z.object({
  session_id: z.string().uuid(),
  barcode: z.string().trim().min(1, "Barcode wajib diisi"),
});

export type StartStockOpnameInput = z.infer<typeof startStockOpnameSchema>;
export type StockOpnameCountInput = z.infer<typeof stockOpnameCountSchema>;
export type IncrementStockOpnameInput = z.infer<typeof incrementStockOpnameSchema>;

// ─── Fiscal Period Lock (PDF Scope A4) ────────────────────
export const fiscalPeriodSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  reason: z.string().min(1, "Alasan wajib diisi"),
});

export type FiscalPeriodInput = z.infer<typeof fiscalPeriodSchema>;

// ─── Employees & Payroll ──────────────────────────────────
export const employeeInputSchema = z.object({
  employee_code: z.string().trim().optional(),
  full_name: z.string().trim().min(1, "Nama karyawan wajib diisi"),
  job_title: z.string().trim().optional(),
  department: z.string().trim().optional(),
  base_salary: z.coerce.number().nonnegative().default(0),
  bank_account_name: z.string().trim().optional(),
  bank_account_number: z.string().trim().optional(),
  tax_id: z.string().trim().optional(),
  hire_date: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
});

export type EmployeeInput = z.infer<typeof employeeInputSchema>;

export const payrollComponentInputSchema = z.object({
  name: z.string().trim().min(1, "Nama komponen wajib diisi").max(80),
  kind: z.enum(["earning", "deduction"]),
  amount: z.coerce.number().nonnegative(),
});

export const payrollLineInputSchema = z.object({
  employee_id: z.string().uuid(),
  base_salary: z.coerce.number().nonnegative(),
  allowances: z.coerce.number().nonnegative().default(0),
  deductions: z.coerce.number().nonnegative().default(0),
  components: z.array(payrollComponentInputSchema).optional().default([]),
  notes: z.string().trim().optional(),
});

export const payrollRunInputSchema = z.object({
  period_month: z.string().regex(/^\d{4}-\d{2}$/, "Periode harus YYYY-MM"),
  payment_date: z.string().min(1, "Tanggal bayar wajib diisi"),
  bank_account_id: z.string().uuid().nullable().optional(),
  notes: z.string().trim().optional(),
  lines: z.array(payrollLineInputSchema).min(1, "Minimal 1 karyawan"),
});

export type PayrollRunInput = z.infer<typeof payrollRunInputSchema>;
export type PayrollLineInput = z.infer<typeof payrollLineInputSchema>;
export type PayrollComponentInput = z.infer<typeof payrollComponentInputSchema>;

// ─── Fixed Assets ─────────────────────────────────────────
export const fixedAssetMethodEnum = z.enum(["straight_line", "double_declining"]);

export const fixedAssetInputSchema = z.object({
  asset_code: z.string().trim().optional(),
  name: z.string().trim().min(1, "Nama aset wajib diisi"),
  acquisition_date: z.string().min(1, "Tanggal perolehan wajib diisi"),
  acquisition_cost: z.coerce.number().positive("Nilai perolehan wajib > 0"),
  salvage_value: z.coerce.number().nonnegative().default(0),
  useful_life_months: z.coerce.number().int().positive().default(48),
  method: fixedAssetMethodEnum.default("straight_line"),
  asset_account_id: z.string().uuid().nullable().optional(),
  location: z.string().trim().optional(),
  department: z.string().trim().optional(),
  bank_account_id: z.string().uuid().nullable().optional(),
  notes: z.string().trim().optional(),
  status: z.enum(["active", "disposed"]).default("active"),
});

export type FixedAssetInput = z.infer<typeof fixedAssetInputSchema>;

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

// ─── Feedback UAT ──────────────────────────────────────────
export const feedbackInputSchema = z.object({
  title: z.string().trim().min(3, "Judul minimal 3 karakter").max(160),
  description: z.string().trim().min(5, "Deskripsi minimal 5 karakter").max(4000),
  severity: z.enum(["blocker", "mengganggu", "minor"]),
  page_path: z.string().trim().max(300).optional(),
  // client-captured context (untrusted; role/version added server-side):
  user_agent: z.string().max(500).optional(),
  viewport: z.string().max(40).optional(),
});

export const feedbackCommentSchema = z.object({
  report_id: z.string().uuid(),
  body: z.string().trim().min(1, "Komentar kosong").max(4000),
});

export const feedbackStatusSchema = z.object({
  report_id: z.string().uuid(),
  status: z.enum(["baru", "diproses", "selesai", "ditolak"]),
});

export type FeedbackInput = z.infer<typeof feedbackInputSchema>;
export type FeedbackCommentInput = z.infer<typeof feedbackCommentSchema>;
export type FeedbackStatusInput = z.infer<typeof feedbackStatusSchema>;
