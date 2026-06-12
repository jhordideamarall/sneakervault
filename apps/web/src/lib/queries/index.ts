import { createClient } from "@sneakervault/supabase/server";
import { getCurrentUser } from "@/lib/actions/auth";
import type { ExpenseStatus, PaymentMethod } from "@sneakervault/shared";
import {
  daysInWIBMonth,
  getWIBDay,
  getWIBHour,
  getWIBMonth,
  getWIBYear,
  nowWIB,
  todayWIB,
  wibStartOfDay,
  wibEndOfDay,
  wibStartOfMonth,
  wibStartOfNextMonth,
} from "@/lib/timezone";

async function requireOwner() {
  const profile = await getCurrentUser();
  if (!profile || !profile.roles?.includes("owner")) throw new Error("Unauthorized");
  return profile;
}

async function requireOwnerOrFinance() {
  const profile = await getCurrentUser();
  const roles = profile?.roles ?? [];
  if (!profile || !(roles.includes("owner") || roles.includes("finance"))) {
    throw new Error("Unauthorized");
  }
  return profile;
}

// ─── Inventory ─────────────────────────────────────────────
const PRODUCT_FIELDS =
  "id, brand, model, sku, size, color, barcode, quantity, hpp, sell_price, price_offline, image_url, condition, defect_reason, is_active, created_at, first_inbound_at";

export async function getProducts(filters?: {
  brand?: string;
  model?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: unknown[]; total: number; error: unknown }> {
  const supabase = await createClient();
  const page = filters?.page ?? 1;
  const limit = filters?.limit ?? 20;
  const from = (page - 1) * limit;

  let query = supabase
    .from("products")
    .select(
      `${PRODUCT_FIELDS}, suppliers:default_supplier_id(name)`,
      { count: "exact" },
    )
    .eq("is_active", true)
    .order("brand", { ascending: true })
    .order("model", { ascending: true })
    .order("size", { ascending: true })
    .range(from, from + limit - 1);

  if (filters?.brand) query = query.eq("brand", filters.brand);
  if (filters?.model) query = query.ilike("model", `%${filters.model}%`);
  if (filters?.search)
    query = query.or(
      `brand.ilike.%${filters.search}%,model.ilike.%${filters.search}%,sku.ilike.%${filters.search}%,barcode.ilike.%${filters.search}%,color.ilike.%${filters.search}%`,
    );

  const { data, count, error } = await query;
  return { data: data ?? [], total: count ?? 0, error };
}

export async function getProductByBarcode(barcode: string): Promise<unknown> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select(PRODUCT_FIELDS)
    .eq("barcode", barcode)
    .maybeSingle();
  return data;
}

/**
 * Ambil condition history untuk 1 produk. Dipakai di detail drawer inventory
 * supaya owner bisa audit: kapan flag defect, siapa, alasannya.
 */
export async function getProductConditionHistory(productId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("product_condition_history")
    .select("*, profiles:changed_by(full_name)")
    .eq("product_id", productId)
    .order("changed_at", { ascending: false })
    .limit(20);
  return data ?? [];
}

// ─── Packing Sessions ──────────────────────────────────────
export async function getPackingSessions(filters?: {
  status?: string;
  platform?: string;
  courier?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: unknown[]; total: number; error: unknown }> {
  const supabase = await createClient();
  const page = filters?.page ?? 1;
  const limit = filters?.limit ?? 20;
  const from = (page - 1) * limit;

  let query = supabase
    .from("packing_sessions")
    .select("*, profiles:packed_by(full_name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.platform) query = query.eq("platform", filters.platform);
  if (filters?.courier) query = query.eq("courier", filters.courier);

  const { data, count, error } = await query;
  return { data: data ?? [], total: count ?? 0, error };
}

export async function getSessionWithItems(sessionId: string): Promise<unknown> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("packing_sessions")
    .select("*, packing_items(*, products(brand, model, size, sku, barcode)), profiles:packed_by(full_name)")
    .eq("id", sessionId)
    .maybeSingle();
  return data;
}

export async function getPackingSessionsToday(userId?: string): Promise<unknown[]> {
  const supabase = await createClient();
  const today = todayWIB();

  let query = supabase
    .from("packing_sessions")
    .select("*, packing_items(count)")
    .gte("created_at", wibStartOfDay(today))
    .lte("created_at", wibEndOfDay(today))
    .order("created_at", { ascending: false });

  if (userId) query = query.eq("packed_by", userId);

  const { data } = await query;
  return data ?? [];
}

// ─── Dashboard (Owner) ─────────────────────────────────────
export async function getDashboardStats() {
  await requireOwnerOrFinance();
  const supabase = await createClient();

  const [stockRes, soldRes, returnsRes, pendingOrdersRes] = await Promise.all([
    supabase.from("products").select("quantity, hpp, condition, first_inbound_at").eq("is_active", true),
    supabase.from("packing_items").select("sell_price, unit_hpp, packing_sessions!inner(status)").in("packing_sessions.status", ["shipped", "completed", "has_return"]).gte("created_at", getMonthStart()),
    supabase.from("returns").select("id").eq("status", "pending"),
    supabase.from("sales_invoices").select("id").in("status", ["draft", "issued", "partial"]),
  ]);

  const products = stockRes.data ?? [];
  const totalItems = products.reduce((s, p) => s + p.quantity, 0);
  const totalValue = products.reduce((s, p) => s + p.quantity * p.hpp, 0);
  const lowStock = products.filter((p) => p.quantity > 0 && p.quantity < 3).length;
  const defectStock = products
    .filter((p) => p.condition === "defect")
    .reduce((s, p) => s + p.quantity, 0);
  const slowMoving = products.filter((p) => {
    if (!p.first_inbound_at || p.quantity <= 0) return false;
    return (Date.now() - new Date(p.first_inbound_at).getTime()) / 86400000 > 60;
  }).length;

  const soldItems = soldRes.data ?? [];
  const monthlyRevenue = soldItems.reduce((s, i) => s + (i.sell_price ?? 0), 0);
  const monthlyProfit = soldItems.reduce((s, i) => s + ((i.sell_price ?? 0) - (i.unit_hpp ?? 0)), 0);

  return {
    totalItems,
    totalValue,
    monthlyRevenue,
    monthlyProfit,
    pendingReturns: returnsRes.data?.length ?? 0,
    pendingOrders: pendingOrdersRes.data?.length ?? 0,
    lowStock,
    defectStock,
    slowMoving,
  };
}

export async function getBestsellers(limit?: number) {
  await requireOwnerOrFinance();
  const supabase = await createClient();
  const { data } = await supabase
    .from("packing_items")
    .select("product_id, products(brand, model, size, image_url), packing_sessions!inner(status)")
    .in("packing_sessions.status", ["shipped", "completed", "has_return"]);

  if (!data) return [];

  // Group by brand+model (not per size)
  const counts: Record<string, { count: number; brand: string; model: string; image_url: string | null }> = {};
  for (const item of data) {
    const p = item.products as unknown as { brand: string; model: string; size: number; image_url: string | null } | null;
    if (!p) continue;
    const key = `${p.brand}::${p.model}`;
    if (!counts[key]) counts[key] = { count: 0, brand: p.brand, model: p.model, image_url: p.image_url };
    counts[key].count++;
  }

  const result = Object.entries(counts)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([key, { count, brand, model, image_url }]) => ({ id: key, count, brand, model, image_url }));

  return limit ? result.slice(0, limit) : result;
}

// ─── Suppliers ─────────────────────────────────────────────
export async function getSuppliers() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("suppliers")
    .select("id, name, contact_person, phone, email")
    .eq("is_active", true)
    .order("name");
  return data ?? [];
}

// ─── Customers (Phase 2) ───────────────────────────────────
export type CustomerRow = {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  channel: "wa" | "shopee" | "tiktok" | "offline" | "website" | "mixed";
  npwp: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function getCustomers(opts?: {
  includeInactive?: boolean;
}): Promise<CustomerRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("customers")
    .select(
      "id, name, contact_person, phone, email, address, channel, npwp, notes, is_active, created_at, updated_at",
    )
    .order("name");
  if (!opts?.includeInactive) query = query.eq("is_active", true);
  const { data } = await query;
  return (data as CustomerRow[] | null) ?? [];
}

// ─── Bank Accounts (Phase 3) ───────────────────────────────
export type BankAccountRow = {
  id: string;
  name: string;
  type: "cash" | "bank" | "ewallet" | "marketplace_balance";
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  opening_balance: number;
  current_balance: number;
  currency: string;
  is_default: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
};

export async function getBankAccounts(opts?: {
  includeInactive?: boolean;
}): Promise<BankAccountRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("bank_accounts")
    .select(
      "id, name, type, bank_name, account_number, account_holder, opening_balance, current_balance, currency, is_default, is_active, notes, created_at",
    )
    .order("is_default", { ascending: false })
    .order("type")
    .order("name");
  if (!opts?.includeInactive) query = query.eq("is_active", true);
  const { data } = await query;
  return (data as BankAccountRow[] | null) ?? [];
}

// ─── Chart of Accounts (Phase 4) ───────────────────────────
export type CoaRow = {
  id: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense" | "cogs";
  normal_balance: "debit" | "credit";
  parent_id: string | null;
  is_active: boolean;
  is_system: boolean;
  description: string | null;
};

// ─── Purchase Orders (Phase 2) ─────────────────────────────
export type PoListRow = {
  id: string;
  po_number: string;
  supplier_id: string;
  supplier_name: string;
  order_date: string;
  expected_date: string | null;
  status: "draft" | "approved" | "receiving" | "completed" | "cancelled";
  total: number;
  line_count: number;
  created_at: string;
};

export async function getPurchaseOrders(opts?: {
  status?: string;
  supplierId?: string;
}): Promise<PoListRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("purchase_orders")
    .select(
      "id, po_number, supplier_id, order_date, expected_date, status, total, created_at, suppliers:supplier_id(name), purchase_order_lines(id)",
    )
    .order("created_at", { ascending: false });
  if (opts?.status) query = query.eq("status", opts.status);
  if (opts?.supplierId) query = query.eq("supplier_id", opts.supplierId);
  const { data } = await query;
  return (
    (data as unknown as Array<{
      id: string;
      po_number: string;
      supplier_id: string;
      order_date: string;
      expected_date: string | null;
      status: PoListRow["status"];
      total: number;
      created_at: string;
      suppliers: { name: string } | null;
      purchase_order_lines: { id: string }[] | null;
    }> | null) ?? []
  ).map((r) => ({
    id: r.id,
    po_number: r.po_number,
    supplier_id: r.supplier_id,
    supplier_name: r.suppliers?.name ?? "—",
    order_date: r.order_date,
    expected_date: r.expected_date,
    status: r.status,
    total: Number(r.total),
    line_count: r.purchase_order_lines?.length ?? 0,
    created_at: r.created_at,
  }));
}

export type PoLineRow = {
  id: string;
  product_id: string | null;
  product_label: string;
  new_brand?: string | null;
  new_model?: string | null;
  new_size?: number | null;
  new_color?: string | null;
  new_sku?: string | null;
  ordered_qty: number;
  received_qty: number;
  unit_cost: number;
  subtotal: number;
  notes: string | null;
};

export type PoDetail = {
  id: string;
  po_number: string;
  supplier_id: string;
  supplier_name: string;
  order_date: string;
  expected_date: string | null;
  status: PoListRow["status"];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  notes: string | null;
  created_at: string;
  approved_at: string | null;
  payment_type: "credit" | "cash" | "dp";
  dp_amount: number;
  dp_bank_account_id: string | null;
  dp_bank_name: string | null;
  lines: PoLineRow[];
};

export async function getPurchaseOrderById(
  id: string,
): Promise<PoDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_number, supplier_id, order_date, expected_date, status, subtotal, tax, shipping, total, notes, created_at, approved_at, payment_type, dp_amount, dp_bank_account_id, suppliers:supplier_id(name), bank:dp_bank_account_id(name), purchase_order_lines(id, product_id, ordered_qty, received_qty, unit_cost, subtotal, notes, new_brand, new_model, new_size, new_color, new_sku, products:product_id(brand, model, sku, size, color))",
    )
    .eq("id", id)
    .single();
  if (!data) return null;
  const d = data as unknown as {
    id: string;
    po_number: string;
    supplier_id: string;
    order_date: string;
    expected_date: string | null;
    status: PoListRow["status"];
    subtotal: number;
    tax: number;
    shipping: number;
    total: number;
    notes: string | null;
    created_at: string;
    approved_at: string | null;
    payment_type: "credit" | "cash" | "dp" | null;
    dp_amount: number | null;
    dp_bank_account_id: string | null;
    suppliers: { name: string } | null;
    bank: { name: string } | null;
    purchase_order_lines: Array<{
      id: string;
      product_id: string | null;
      ordered_qty: number;
      received_qty: number;
      unit_cost: number;
      subtotal: number;
      notes: string | null;
      new_brand: string | null;
      new_model: string | null;
      new_size: number | null;
      new_color: string | null;
      new_sku: string | null;
      products: {
        brand: string;
        model: string;
        sku: string;
        size: number;
        color: string;
      } | null;
    }>;
  };
  return {
    id: d.id,
    po_number: d.po_number,
    supplier_id: d.supplier_id,
    supplier_name: d.suppliers?.name ?? "—",
    order_date: d.order_date,
    expected_date: d.expected_date,
    status: d.status,
    subtotal: Number(d.subtotal),
    tax: Number(d.tax),
    shipping: Number(d.shipping),
    total: Number(d.total),
    notes: d.notes,
    created_at: d.created_at,
    approved_at: d.approved_at,
    payment_type: (d.payment_type ?? "credit") as "credit" | "cash" | "dp",
    dp_amount: Number(d.dp_amount ?? 0),
    dp_bank_account_id: d.dp_bank_account_id,
    dp_bank_name: d.bank?.name ?? null,
    lines: d.purchase_order_lines.map((l) => ({
      id: l.id,
      product_id: l.product_id,
      product_label: l.products
        ? `${l.products.brand} ${l.products.model} ${l.products.color} • Size ${Number(l.products.size)} • ${l.products.sku}`
        : l.new_brand
          ? `${l.new_brand} ${l.new_model} ${l.new_color ?? ""} • Size ${Number(l.new_size)} • ${l.new_sku} (baru)`
          : "(produk dihapus)",
      new_brand: l.new_brand,
      new_model: l.new_model,
      new_size: l.new_size != null ? Number(l.new_size) : null,
      new_color: l.new_color,
      new_sku: l.new_sku,
      ordered_qty: l.ordered_qty,
      received_qty: l.received_qty,
      unit_cost: Number(l.unit_cost),
      subtotal: Number(l.subtotal),
      notes: l.notes,
    })),
  };
}

// ─── Purchase Invoices (Phase 2 — Faktur Pembelian) ────────
export type PurchaseInvoiceRow = {
  id: string;
  invoice_number: string;
  supplier_id: string;
  supplier_name: string;
  po_id: string | null;
  po_number: string | null;
  invoice_date: string;
  due_date: string | null;
  subtotal: number;
  tax: number;
  total: number;
  paid_amount: number;
  status: "unpaid" | "partial" | "paid" | "cancelled";
  notes: string | null;
  attachment_url: string | null;
  created_at: string;
};

export async function getPurchaseInvoices(opts?: {
  status?: string;
}): Promise<PurchaseInvoiceRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("purchase_invoices")
    .select(
      "id, invoice_number, supplier_id, po_id, invoice_date, due_date, subtotal, tax, total, paid_amount, status, notes, attachment_url, created_at, suppliers:supplier_id(name), purchase_orders:po_id(po_number)",
    )
    .order("invoice_date", { ascending: false });
  if (opts?.status) query = query.eq("status", opts.status);
  const { data } = await query;
  return (
    (data as unknown as Array<{
      id: string;
      invoice_number: string;
      supplier_id: string;
      po_id: string | null;
      invoice_date: string;
      due_date: string | null;
      subtotal: number;
      tax: number;
      total: number;
      paid_amount: number;
      status: PurchaseInvoiceRow["status"];
      notes: string | null;
      attachment_url: string | null;
      created_at: string;
      suppliers: { name: string } | null;
      purchase_orders: { po_number: string } | null;
    }> | null) ?? []
  ).map((r) => ({
    id: r.id,
    invoice_number: r.invoice_number,
    supplier_id: r.supplier_id,
    supplier_name: r.suppliers?.name ?? "—",
    po_id: r.po_id,
    po_number: r.purchase_orders?.po_number ?? null,
    invoice_date: r.invoice_date,
    due_date: r.due_date,
    subtotal: Number(r.subtotal),
    tax: Number(r.tax),
    total: Number(r.total),
    paid_amount: Number(r.paid_amount),
    status: r.status,
    notes: r.notes,
    attachment_url: r.attachment_url,
    created_at: r.created_at,
  }));
}

// ─── Sales Invoices (Phase 3) ──────────────────────────────
export type SalesInvoiceRow = {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name: string;
  channel: "wa" | "shopee" | "tiktok" | "offline" | "website" | "mixed";
  invoice_date: string;
  due_date: string | null;
  subtotal: number;
  discount: number;
  shipping: number;
  marketplace_fee: number;
  tax: number;
  total: number;
  paid_amount: number;
  status: "draft" | "issued" | "partial" | "paid" | "cancelled";
  marketplace_order_id: string | null;
  notes: string | null;
  created_at: string;
  line_count: number;
};

export async function getSalesInvoices(): Promise<SalesInvoiceRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sales_invoices")
    .select(
      "id, invoice_number, customer_id, customer_name, channel, invoice_date, due_date, subtotal, discount, shipping, marketplace_fee, tax, total, paid_amount, status, marketplace_order_id, notes, created_at, sales_invoice_lines(id)",
    )
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false });
  return (
    (data as unknown as Array<{
      id: string;
      invoice_number: string;
      customer_id: string | null;
      customer_name: string;
      channel: SalesInvoiceRow["channel"];
      invoice_date: string;
      due_date: string | null;
      subtotal: number;
      discount: number;
      shipping: number;
      marketplace_fee: number;
      tax: number;
      total: number;
      paid_amount: number;
      status: SalesInvoiceRow["status"];
      marketplace_order_id: string | null;
      notes: string | null;
      created_at: string;
      sales_invoice_lines: { id: string }[] | null;
    }> | null) ?? []
  ).map((r) => ({
    id: r.id,
    invoice_number: r.invoice_number,
    customer_id: r.customer_id,
    customer_name: r.customer_name,
    channel: r.channel,
    invoice_date: r.invoice_date,
    due_date: r.due_date,
    subtotal: Number(r.subtotal),
    discount: Number(r.discount),
    shipping: Number(r.shipping),
    marketplace_fee: Number(r.marketplace_fee),
    tax: Number(r.tax),
    total: Number(r.total),
    paid_amount: Number(r.paid_amount),
    status: r.status,
    marketplace_order_id: r.marketplace_order_id,
    notes: r.notes,
    created_at: r.created_at,
    line_count: r.sales_invoice_lines?.length ?? 0,
  }));
}

export type SalesInvoiceLineRow = {
  id: string;
  product_id: string | null;
  product_label: string;
  qty: number;
  unit_price: number;
  unit_cost: number;
  subtotal: number;
  notes: string | null;
};

export type SalesInvoiceDetail = SalesInvoiceRow & {
  lines: SalesInvoiceLineRow[];
};

export async function getSalesInvoiceById(
  id: string,
): Promise<SalesInvoiceDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sales_invoices")
    .select(
      "id, invoice_number, customer_id, customer_name, channel, invoice_date, due_date, subtotal, discount, shipping, marketplace_fee, tax, total, paid_amount, status, marketplace_order_id, notes, created_at, sales_invoice_lines(id, product_id, product_label, qty, unit_price, unit_cost, subtotal, notes)",
    )
    .eq("id", id)
    .single();
  if (!data) return null;
  const d = data as unknown as {
    id: string;
    invoice_number: string;
    customer_id: string | null;
    customer_name: string;
    channel: SalesInvoiceRow["channel"];
    invoice_date: string;
    due_date: string | null;
    subtotal: number;
    discount: number;
    shipping: number;
    marketplace_fee: number;
    tax: number;
    total: number;
    paid_amount: number;
    status: SalesInvoiceRow["status"];
    marketplace_order_id: string | null;
    notes: string | null;
    created_at: string;
    sales_invoice_lines: Array<{
      id: string;
      product_id: string | null;
      product_label: string;
      qty: number;
      unit_price: number;
      unit_cost: number;
      subtotal: number;
      notes: string | null;
    }>;
  };
  return {
    id: d.id,
    invoice_number: d.invoice_number,
    customer_id: d.customer_id,
    customer_name: d.customer_name,
    channel: d.channel,
    invoice_date: d.invoice_date,
    due_date: d.due_date,
    subtotal: Number(d.subtotal),
    discount: Number(d.discount),
    shipping: Number(d.shipping),
    marketplace_fee: Number(d.marketplace_fee),
    tax: Number(d.tax),
    total: Number(d.total),
    paid_amount: Number(d.paid_amount),
    status: d.status,
    marketplace_order_id: d.marketplace_order_id,
    notes: d.notes,
    created_at: d.created_at,
    line_count: d.sales_invoice_lines.length,
    lines: d.sales_invoice_lines.map((l) => ({
      id: l.id,
      product_id: l.product_id,
      product_label: l.product_label,
      qty: l.qty,
      unit_price: Number(l.unit_price),
      unit_cost: Number(l.unit_cost),
      subtotal: Number(l.subtotal),
      notes: l.notes,
    })),
  };
}

export type SalesProductPickerRow = {
  id: string;
  brand: string;
  model: string;
  sku: string;
  size: number;
  color: string;
  barcode: string;
  hpp: number;
  sell_price: number;
  price_offline: number;
  quantity: number;
};

export async function getProductsForSalesPicker(): Promise<
  SalesProductPickerRow[]
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select(
      "id, brand, model, sku, size, color, barcode, hpp, sell_price, price_offline, quantity",
    )
    .eq("is_active", true)
    .order("brand")
    .order("model")
    .order("size");
  return (data as SalesProductPickerRow[] | null) ?? [];
}

export type OutstandingInvoiceRow = {
  id: string;
  invoice_number: string;
  supplier_id: string;
  supplier_name: string;
  invoice_date: string;
  due_date: string | null;
  total: number;
  paid_amount: number;
  remaining: number;
};

export async function getOutstandingPurchaseInvoices(
  supplierId?: string,
): Promise<OutstandingInvoiceRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("purchase_invoices")
    .select(
      "id, invoice_number, supplier_id, invoice_date, due_date, total, paid_amount, suppliers:supplier_id(name)",
    )
    .in("status", ["unpaid", "partial"])
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("invoice_date", { ascending: true });
  if (supplierId) q = q.eq("supplier_id", supplierId);
  const { data } = await q;
  return (
    (data as unknown as Array<{
      id: string;
      invoice_number: string;
      supplier_id: string;
      invoice_date: string;
      due_date: string | null;
      total: number;
      paid_amount: number;
      suppliers: { name: string } | null;
    }> | null) ?? []
  ).map((r) => ({
    id: r.id,
    invoice_number: r.invoice_number,
    supplier_id: r.supplier_id,
    supplier_name: r.suppliers?.name ?? "—",
    invoice_date: r.invoice_date,
    due_date: r.due_date,
    total: Number(r.total),
    paid_amount: Number(r.paid_amount),
    remaining: Number(r.total) - Number(r.paid_amount),
  }));
}

export type VendorPaymentAllocation = {
  invoice_id: string;
  invoice_number: string;
  amount: number;
};

export type VendorPaymentRow = {
  id: string;
  payment_number: string;
  supplier_id: string;
  supplier_name: string;
  payment_date: string;
  amount: number;
  payment_method: "cash" | "bank_transfer" | "marketplace" | "other";
  bank_account_id: string | null;
  bank_account_name: string | null;
  reference_no: string | null;
  notes: string | null;
  attachment_url: string | null;
  created_at: string;
  allocations: VendorPaymentAllocation[];
};

export async function getVendorPayments(): Promise<VendorPaymentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vendor_payments")
    .select(
      "id, payment_number, supplier_id, payment_date, amount, payment_method, bank_account_id, reference_no, notes, attachment_url, created_at, suppliers:supplier_id(name), bank_accounts:bank_account_id(name), vendor_payment_allocations(invoice_id, amount, purchase_invoices:invoice_id(invoice_number))",
    )
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });
  return (
    (data as unknown as Array<{
      id: string;
      payment_number: string;
      supplier_id: string;
      payment_date: string;
      amount: number;
      payment_method: VendorPaymentRow["payment_method"];
      bank_account_id: string | null;
      reference_no: string | null;
      notes: string | null;
      attachment_url: string | null;
      created_at: string;
      suppliers: { name: string } | null;
      bank_accounts: { name: string } | null;
      vendor_payment_allocations: Array<{
        invoice_id: string;
        amount: number;
        purchase_invoices: { invoice_number: string } | null;
      }>;
    }> | null) ?? []
  ).map((r) => ({
    id: r.id,
    payment_number: r.payment_number,
    supplier_id: r.supplier_id,
    supplier_name: r.suppliers?.name ?? "—",
    payment_date: r.payment_date,
    amount: Number(r.amount),
    payment_method: r.payment_method,
    bank_account_id: r.bank_account_id,
    bank_account_name: r.bank_accounts?.name ?? null,
    reference_no: r.reference_no,
    notes: r.notes,
    attachment_url: r.attachment_url,
    created_at: r.created_at,
    allocations: (r.vendor_payment_allocations ?? []).map((a) => ({
      invoice_id: a.invoice_id,
      invoice_number: a.purchase_invoices?.invoice_number ?? "—",
      amount: Number(a.amount),
    })),
  }));
}

// ─── Bank Transactions (Mutasi Bank) ───────────────────────
export type BankTransactionRow = {
  id: string;
  bank_account_id: string;
  bank_account_name: string;
  transaction_date: string;
  type: "debit" | "credit";
  amount: number;
  balance_after: number | null;
  reference_no: string | null;
  description: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  is_reconciled: boolean;
  created_at: string;
};

export async function getBankTransactions(opts?: {
  bankAccountId?: string;
  limit?: number;
}): Promise<BankTransactionRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("bank_transactions")
    .select(
      "id, bank_account_id, transaction_date, type, amount, balance_after, reference_no, description, related_entity_type, related_entity_id, is_reconciled, created_at, bank_accounts:bank_account_id(name)",
    )
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (opts?.bankAccountId) q = q.eq("bank_account_id", opts.bankAccountId);
  if (opts?.limit) q = q.limit(opts.limit);
  const { data } = await q;
  return (
    (data as unknown as Array<{
      id: string;
      bank_account_id: string;
      transaction_date: string;
      type: "debit" | "credit";
      amount: number;
      balance_after: number | null;
      reference_no: string | null;
      description: string;
      related_entity_type: string | null;
      related_entity_id: string | null;
      is_reconciled: boolean;
      created_at: string;
      bank_accounts: { name: string } | null;
    }> | null) ?? []
  ).map((r) => ({
    id: r.id,
    bank_account_id: r.bank_account_id,
    bank_account_name: r.bank_accounts?.name ?? "—",
    transaction_date: r.transaction_date,
    type: r.type,
    amount: Number(r.amount),
    balance_after: r.balance_after !== null ? Number(r.balance_after) : null,
    reference_no: r.reference_no,
    description: r.description,
    related_entity_type: r.related_entity_type,
    related_entity_id: r.related_entity_id,
    is_reconciled: r.is_reconciled,
    created_at: r.created_at,
  }));
}

// ─── Expenses (PDF Scope A1) ───────────────────────────────
export type ExpenseCategoryRow = {
  id: string;
  name: string;
  account_code: string;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ExpenseAccountOption = {
  code: string;
  name: string;
};

export async function getExpenseCategories(opts?: {
  includeInactive?: boolean;
}): Promise<ExpenseCategoryRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("expense_categories")
    .select("id, name, account_code, is_active, is_system, sort_order, created_at, updated_at")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (!opts?.includeInactive) q = q.eq("is_active", true);
  const { data } = await q;
  return (data as ExpenseCategoryRow[] | null) ?? [];
}

export async function getExpenseAccountOptions(): Promise<
  ExpenseAccountOption[]
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("chart_of_accounts")
    .select("code, name")
    .eq("type", "expense")
    .eq("is_active", true)
    .order("code", { ascending: true });
  return (data as ExpenseAccountOption[] | null) ?? [];
}

export type ExpenseRow = {
  id: string;
  expense_number: string;
  expense_date: string;
  category_id: string;
  category_name: string;
  category_account_code: string;
  description: string;
  amount: number;
  payment_method: PaymentMethod;
  bank_account_id: string;
  bank_account_name: string;
  receipt_path: string | null;
  status: ExpenseStatus;
  created_by: string | null;
  created_by_name: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  paid_by_name: string | null;
  paid_at: string | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  voided_by_name: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
};

export async function getExpenses(opts?: {
  status?: ExpenseStatus | "all";
  limit?: number;
}): Promise<ExpenseRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("expenses")
    .select(
      "id, expense_number, expense_date, category_id, description, amount, payment_method, bank_account_id, receipt_path, status, created_by, approved_at, paid_at, rejected_at, rejection_reason, voided_at, void_reason, created_at, expense_categories:category_id(name, account_code), bank_accounts:bank_account_id(name), creator:created_by(full_name), approver:approved_by(full_name), payer:paid_by(full_name), rejecter:rejected_by(full_name), voider:voided_by(full_name)",
    )
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (opts?.status && opts.status !== "all") q = q.eq("status", opts.status);
  if (opts?.limit) q = q.limit(opts.limit);
  const { data } = await q;
  return (
    (data as unknown as Array<{
      id: string;
      expense_number: string;
      expense_date: string;
      category_id: string;
      description: string;
      amount: number;
      payment_method: PaymentMethod;
      bank_account_id: string;
      receipt_path: string | null;
      status: ExpenseStatus;
      created_by: string | null;
      approved_at: string | null;
      paid_at: string | null;
      rejected_at: string | null;
      rejection_reason: string | null;
      voided_at: string | null;
      void_reason: string | null;
      created_at: string;
      expense_categories: { name: string; account_code: string } | null;
      bank_accounts: { name: string } | null;
      creator: { full_name: string } | null;
      approver: { full_name: string } | null;
      payer: { full_name: string } | null;
      rejecter: { full_name: string } | null;
      voider: { full_name: string } | null;
    }> | null) ?? []
  ).map((r) => ({
    id: r.id,
    expense_number: r.expense_number,
    expense_date: r.expense_date,
    category_id: r.category_id,
    category_name: r.expense_categories?.name ?? "—",
    category_account_code: r.expense_categories?.account_code ?? "—",
    description: r.description,
    amount: Number(r.amount),
    payment_method: r.payment_method,
    bank_account_id: r.bank_account_id,
    bank_account_name: r.bank_accounts?.name ?? "—",
    receipt_path: r.receipt_path,
    status: r.status,
    created_by: r.created_by,
    created_by_name: r.creator?.full_name ?? null,
    approved_by_name: r.approver?.full_name ?? null,
    approved_at: r.approved_at,
    paid_by_name: r.payer?.full_name ?? null,
    paid_at: r.paid_at,
    rejected_by_name: r.rejecter?.full_name ?? null,
    rejected_at: r.rejected_at,
    rejection_reason: r.rejection_reason,
    voided_by_name: r.voider?.full_name ?? null,
    voided_at: r.voided_at,
    void_reason: r.void_reason,
    created_at: r.created_at,
  }));
}

// ─── Stock Opname (PDF Scope A3) ──────────────────────────
export type StockOpnameStatus =
  | "open"
  | "counting"
  | "review"
  | "approved"
  | "cancelled";

export type StockOpnameSessionRow = {
  id: string;
  opname_number: string;
  opname_date: string;
  status: StockOpnameStatus;
  scope: string;
  notes: string | null;
  started_by_name: string | null;
  reviewed_by_name: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  created_at: string;
  total_lines: number;
  counted_lines: number;
  variance_lines: number;
};

export async function getStockOpnameSessions(): Promise<
  StockOpnameSessionRow[]
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_opname_sessions")
    .select(
      "id, opname_number, opname_date, status, scope, notes, approved_at, created_at, starter:started_by(full_name), reviewer:reviewed_by(full_name), approver:approved_by(full_name), stock_opname_lines(id, physical_qty, variance)",
    )
    .order("opname_date", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    (data as unknown as Array<{
      id: string;
      opname_number: string;
      opname_date: string;
      status: StockOpnameStatus;
      scope: string;
      notes: string | null;
      approved_at: string | null;
      created_at: string;
      starter: { full_name: string } | null;
      reviewer: { full_name: string } | null;
      approver: { full_name: string } | null;
      stock_opname_lines: Array<{
        id: string;
        physical_qty: number | null;
        variance: number;
      }> | null;
    }> | null) ?? []
  ).map((row) => {
    const lines = row.stock_opname_lines ?? [];
    return {
      id: row.id,
      opname_number: row.opname_number,
      opname_date: row.opname_date,
      status: row.status,
      scope: row.scope,
      notes: row.notes,
      started_by_name: row.starter?.full_name ?? null,
      reviewed_by_name: row.reviewer?.full_name ?? null,
      approved_by_name: row.approver?.full_name ?? null,
      approved_at: row.approved_at,
      created_at: row.created_at,
      total_lines: lines.length,
      counted_lines: lines.filter((line) => line.physical_qty !== null).length,
      variance_lines: lines.filter((line) => Number(line.variance) !== 0).length,
    };
  });
}

export type StockOpnameLineRow = {
  id: string;
  product_id: string;
  product_label: string;
  sku: string;
  barcode: string;
  system_qty: number;
  physical_qty: number | null;
  variance: number;
  unit_cost: number;
  reason: string | null;
};

export type StockOpnameDetail = StockOpnameSessionRow & {
  lines: StockOpnameLineRow[];
};

export async function getStockOpnameDetail(
  id: string,
): Promise<StockOpnameDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_opname_sessions")
    .select(
      "id, opname_number, opname_date, status, scope, notes, approved_at, created_at, starter:started_by(full_name), reviewer:reviewed_by(full_name), approver:approved_by(full_name), stock_opname_lines(id, product_id, system_qty, physical_qty, variance, unit_cost, reason, products:product_id(brand, model, color, size, sku, barcode))",
    )
    .eq("id", id)
    .single();
  if (!data) return null;

  const row = data as unknown as {
    id: string;
    opname_number: string;
    opname_date: string;
    status: StockOpnameStatus;
    scope: string;
    notes: string | null;
    approved_at: string | null;
    created_at: string;
    starter: { full_name: string } | null;
    reviewer: { full_name: string } | null;
    approver: { full_name: string } | null;
    stock_opname_lines: Array<{
      id: string;
      product_id: string;
      system_qty: number;
      physical_qty: number | null;
      variance: number;
      unit_cost: number;
      reason: string | null;
      products: {
        brand: string;
        model: string;
        color: string | null;
        size: number;
        sku: string;
        barcode: string;
      } | null;
    }> | null;
  };
  const lines = (row.stock_opname_lines ?? [])
    .map((line) => ({
      id: line.id,
      product_id: line.product_id,
      product_label: line.products
        ? `${line.products.brand} ${line.products.model} ${line.products.color ?? ""} • Size ${Number(line.products.size)}`
        : "(produk dihapus)",
      sku: line.products?.sku ?? "—",
      barcode: line.products?.barcode ?? "—",
      system_qty: Number(line.system_qty),
      physical_qty:
        line.physical_qty === null ? null : Number(line.physical_qty),
      variance: Number(line.variance),
      unit_cost: Number(line.unit_cost),
      reason: line.reason,
    }))
    .sort((a, b) => a.product_label.localeCompare(b.product_label));

  return {
    id: row.id,
    opname_number: row.opname_number,
    opname_date: row.opname_date,
    status: row.status,
    scope: row.scope,
    notes: row.notes,
    started_by_name: row.starter?.full_name ?? null,
    reviewed_by_name: row.reviewer?.full_name ?? null,
    approved_by_name: row.approver?.full_name ?? null,
    approved_at: row.approved_at,
    created_at: row.created_at,
    total_lines: lines.length,
    counted_lines: lines.filter((line) => line.physical_qty !== null).length,
    variance_lines: lines.filter((line) => line.variance !== 0).length,
    lines,
  };
}

// ─── Fiscal Periods (PDF Scope A4) ────────────────────────
export type FiscalPeriodRow = {
  id: string;
  year: number;
  month: number;
  status: "open" | "closed";
  closed_by_name: string | null;
  closed_at: string | null;
  notes: string | null;
};

export async function getFiscalPeriods(year?: number): Promise<FiscalPeriodRow[]> {
  await requireOwnerOrFinance();
  const supabase = await createClient();
  const targetYear = year ?? new Date().getFullYear();
  const { data } = await supabase
    .from("fiscal_periods")
    .select("id, year, month, status, closed_at, notes, closer:closed_by(full_name)")
    .eq("year", targetYear)
    .order("month", { ascending: true });

  const existing = new Map(
    ((data as unknown as Array<{
      id: string;
      year: number;
      month: number;
      status: "open" | "closed";
      closed_at: string | null;
      notes: string | null;
      closer: { full_name: string } | null;
    }> | null) ?? []).map((row) => [row.month, row]),
  );

  return Array.from({ length: 12 }, (_, idx) => {
    const month = idx + 1;
    const row = existing.get(month);
    return {
      id: row?.id ?? `${targetYear}-${month}`,
      year: targetYear,
      month,
      status: row?.status ?? "open",
      closed_by_name: row?.closer?.full_name ?? null,
      closed_at: row?.closed_at ?? null,
      notes: row?.notes ?? null,
    };
  });
}

// ─── Customer Payments (Phase 3 — Penerimaan Kas) ──────────
export type OutstandingSalesInvoiceRow = {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name: string;
  invoice_date: string;
  due_date: string | null;
  total: number;
  paid_amount: number;
  remaining: number;
};

export async function getOutstandingSalesInvoices(
  customerId?: string,
): Promise<OutstandingSalesInvoiceRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("sales_invoices")
    .select(
      "id, invoice_number, customer_id, customer_name, invoice_date, due_date, total, paid_amount",
    )
    .in("status", ["issued", "partial"])
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("invoice_date", { ascending: true });
  if (customerId) q = q.eq("customer_id", customerId);
  const { data } = await q;
  return (
    (data as unknown as Array<{
      id: string;
      invoice_number: string;
      customer_id: string | null;
      customer_name: string;
      invoice_date: string;
      due_date: string | null;
      total: number;
      paid_amount: number;
    }> | null) ?? []
  ).map((r) => ({
    id: r.id,
    invoice_number: r.invoice_number,
    customer_id: r.customer_id,
    customer_name: r.customer_name,
    invoice_date: r.invoice_date,
    due_date: r.due_date,
    total: Number(r.total),
    paid_amount: Number(r.paid_amount),
    remaining: Number(r.total) - Number(r.paid_amount),
  }));
}

export type CustomerPaymentAllocation = {
  invoice_id: string;
  invoice_number: string;
  amount: number;
};

export type CustomerPaymentRow = {
  id: string;
  payment_number: string;
  customer_id: string | null;
  customer_name: string;
  payment_date: string;
  amount: number;
  payment_method: "cash" | "bank_transfer" | "marketplace" | "other";
  bank_account_id: string | null;
  bank_account_name: string | null;
  reference_no: string | null;
  notes: string | null;
  attachment_url: string | null;
  created_at: string;
  allocations: CustomerPaymentAllocation[];
};

export async function getCustomerPayments(): Promise<CustomerPaymentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("customer_payments")
    .select(
      "id, payment_number, customer_id, customer_name, payment_date, amount, payment_method, bank_account_id, reference_no, notes, attachment_url, created_at, bank_accounts:bank_account_id(name), customer_payment_allocations(invoice_id, amount, sales_invoices:invoice_id(invoice_number))",
    )
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });
  return (
    (data as unknown as Array<{
      id: string;
      payment_number: string;
      customer_id: string | null;
      customer_name: string;
      payment_date: string;
      amount: number;
      payment_method: CustomerPaymentRow["payment_method"];
      bank_account_id: string | null;
      reference_no: string | null;
      notes: string | null;
      attachment_url: string | null;
      created_at: string;
      bank_accounts: { name: string } | null;
      customer_payment_allocations: Array<{
        invoice_id: string;
        amount: number;
        sales_invoices: { invoice_number: string } | null;
      }>;
    }> | null) ?? []
  ).map((r) => ({
    id: r.id,
    payment_number: r.payment_number,
    customer_id: r.customer_id,
    customer_name: r.customer_name,
    payment_date: r.payment_date,
    amount: Number(r.amount),
    payment_method: r.payment_method,
    bank_account_id: r.bank_account_id,
    bank_account_name: r.bank_accounts?.name ?? null,
    reference_no: r.reference_no,
    notes: r.notes,
    attachment_url: r.attachment_url,
    created_at: r.created_at,
    allocations: (r.customer_payment_allocations ?? []).map((a) => ({
      invoice_id: a.invoice_id,
      invoice_number: a.sales_invoices?.invoice_number ?? "—",
      amount: Number(a.amount),
    })),
  }));
}

export type InvoicablePoRow = {
  id: string;
  po_number: string;
  supplier_id: string;
  supplier_name: string;
  total: number;
  subtotal: number;
  tax: number;
  order_date: string;
  status: string;
};

export async function getInvoicablePos(): Promise<InvoicablePoRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_number, supplier_id, subtotal, tax, total, order_date, status, suppliers:supplier_id(name)",
    )
    .in("status", ["receiving", "completed"])
    .order("order_date", { ascending: false });
  return (
    (data as unknown as Array<{
      id: string;
      po_number: string;
      supplier_id: string;
      subtotal: number;
      tax: number;
      total: number;
      order_date: string;
      status: string;
      suppliers: { name: string } | null;
    }> | null) ?? []
  ).map((r) => ({
    id: r.id,
    po_number: r.po_number,
    supplier_id: r.supplier_id,
    supplier_name: r.suppliers?.name ?? "—",
    subtotal: Number(r.subtotal),
    tax: Number(r.tax),
    total: Number(r.total),
    order_date: r.order_date,
    status: r.status,
  }));
}

export type ReceivablePoRow = {
  id: string;
  po_number: string;
  supplier_name: string;
  order_date: string;
  expected_date: string | null;
  status: "approved" | "receiving";
  total: number;
  total_ordered: number;
  total_received: number;
  total_remaining: number;
};

export async function getPurchaseOrdersForReceiving(): Promise<
  ReceivablePoRow[]
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_number, order_date, expected_date, status, total, suppliers:supplier_id(name), purchase_order_lines(ordered_qty, received_qty)",
    )
    .in("status", ["approved", "receiving"])
    .order("order_date", { ascending: true });
  return (
    (data as unknown as Array<{
      id: string;
      po_number: string;
      order_date: string;
      expected_date: string | null;
      status: "approved" | "receiving";
      total: number;
      suppliers: { name: string } | null;
      purchase_order_lines: { ordered_qty: number; received_qty: number }[];
    }> | null) ?? []
  ).map((r) => {
    const total_ordered = r.purchase_order_lines.reduce(
      (a, l) => a + l.ordered_qty,
      0,
    );
    const total_received = r.purchase_order_lines.reduce(
      (a, l) => a + l.received_qty,
      0,
    );
    return {
      id: r.id,
      po_number: r.po_number,
      supplier_name: r.suppliers?.name ?? "—",
      order_date: r.order_date,
      expected_date: r.expected_date,
      status: r.status,
      total: Number(r.total),
      total_ordered,
      total_received,
      total_remaining: total_ordered - total_received,
    };
  });
}

export type ProductPickerRow = {
  id: string;
  brand: string;
  model: string;
  sku: string;
  size: number;
  color: string;
  barcode: string;
  hpp: number;
  quantity: number;
};

export async function getProductsForPicker(): Promise<ProductPickerRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("id, brand, model, sku, size, color, barcode, hpp, quantity")
    .eq("is_active", true)
    .order("brand")
    .order("model")
    .order("size");
  return (data as ProductPickerRow[] | null) ?? [];
}

// ─── Journal Entries (Phase 4) ─────────────────────────────
export type JournalLineRow = {
  id: string;
  account_id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  description: string | null;
};

export type JournalEntryRow = {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  source_type: string;
  source_id: string | null;
  total_debit: number;
  total_credit: number;
  status: "draft" | "posted" | "reversed";
  notes: string | null;
  created_at: string;
  lines: JournalLineRow[];
};

export async function getJournalEntries(opts?: {
  from?: string;
  to?: string;
  status?: string;
  limit?: number;
}): Promise<JournalEntryRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("journal_entries")
    .select(
      "id, entry_number, entry_date, description, source_type, source_id, total_debit, total_credit, status, notes, created_at, journal_lines(id, account_id, debit, credit, description, chart_of_accounts:account_id(code, name))",
    )
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (opts?.from) q = q.gte("entry_date", opts.from);
  if (opts?.to) q = q.lte("entry_date", opts.to);
  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.limit) q = q.limit(opts.limit);
  const { data } = await q;
  return (
    (data as unknown as Array<{
      id: string;
      entry_number: string;
      entry_date: string;
      description: string;
      source_type: string;
      source_id: string | null;
      total_debit: number;
      total_credit: number;
      status: JournalEntryRow["status"];
      notes: string | null;
      created_at: string;
      journal_lines: Array<{
        id: string;
        account_id: string;
        debit: number;
        credit: number;
        description: string | null;
        chart_of_accounts: { code: string; name: string } | null;
      }>;
    }> | null) ?? []
  ).map((r) => ({
    id: r.id,
    entry_number: r.entry_number,
    entry_date: r.entry_date,
    description: r.description,
    source_type: r.source_type,
    source_id: r.source_id,
    total_debit: Number(r.total_debit),
    total_credit: Number(r.total_credit),
    status: r.status,
    notes: r.notes,
    created_at: r.created_at,
    lines: r.journal_lines.map((l) => ({
      id: l.id,
      account_id: l.account_id,
      account_code: l.chart_of_accounts?.code ?? "—",
      account_name: l.chart_of_accounts?.name ?? "—",
      debit: Number(l.debit),
      credit: Number(l.credit),
      description: l.description,
    })),
  }));
}

// Aggregate balances per account for reporting
export type AccountBalance = {
  account_id: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense" | "cogs";
  normal_balance: "debit" | "credit";
  parent_id: string | null;
  total_debit: number;
  total_credit: number;
  balance: number; // signed: positive in normal-balance direction
};

export async function getAccountBalances(opts?: {
  from?: string;
  to?: string;
}): Promise<AccountBalance[]> {
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, code, name, type, normal_balance, parent_id")
    .order("code");

  let lineQuery = supabase
    .from("journal_lines")
    .select(
      "account_id, debit, credit, journal_entries!inner(entry_date, status)",
    )
    .eq("journal_entries.status", "posted");
  if (opts?.from) lineQuery = lineQuery.gte("journal_entries.entry_date", opts.from);
  if (opts?.to) lineQuery = lineQuery.lte("journal_entries.entry_date", opts.to);
  const { data: lines } = await lineQuery;

  const debit = new Map<string, number>();
  const credit = new Map<string, number>();
  for (const l of (lines ?? []) as Array<{
    account_id: string;
    debit: number;
    credit: number;
  }>) {
    debit.set(l.account_id, (debit.get(l.account_id) ?? 0) + Number(l.debit));
    credit.set(
      l.account_id,
      (credit.get(l.account_id) ?? 0) + Number(l.credit),
    );
  }

  return (
    (accounts as Array<{
      id: string;
      code: string;
      name: string;
      type: AccountBalance["type"];
      normal_balance: AccountBalance["normal_balance"];
      parent_id: string | null;
    }> | null) ?? []
  ).map((a) => {
    const d = debit.get(a.id) ?? 0;
    const c = credit.get(a.id) ?? 0;
    const balance = a.normal_balance === "debit" ? d - c : c - d;
    return {
      account_id: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      normal_balance: a.normal_balance,
      parent_id: a.parent_id,
      total_debit: d,
      total_credit: c,
      balance,
    };
  });
}

export async function getChartOfAccounts(): Promise<CoaRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("chart_of_accounts")
    .select(
      "id, code, name, type, normal_balance, parent_id, is_active, is_system, description",
    )
    .order("code");
  return (data as CoaRow[] | null) ?? [];
}

// ─── Buku Besar Pembantu — Account Ledger ──────────────────
export type AccountLedgerEntry = {
  line_id: string;
  entry_id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  source_type: string;
  source_id: string | null;
  status: "draft" | "posted" | "reversed";
  debit: number;
  credit: number;
  line_description: string | null;
  running_balance: number; // signed in normal-balance direction
};

export type AccountLedgerResult = {
  account: CoaRow | null;
  opening_balance: number;
  closing_balance: number;
  total_debit: number;
  total_credit: number;
  entries: AccountLedgerEntry[];
};

export async function getAccountLedger(args: {
  account_id: string;
  from?: string;
  to?: string;
}): Promise<AccountLedgerResult> {
  const supabase = await createClient();

  const { data: account } = await supabase
    .from("chart_of_accounts")
    .select(
      "id, code, name, type, normal_balance, parent_id, is_active, is_system, description",
    )
    .eq("id", args.account_id)
    .single();

  const acc = account as CoaRow | null;
  if (!acc) {
    return {
      account: null,
      opening_balance: 0,
      closing_balance: 0,
      total_debit: 0,
      total_credit: 0,
      entries: [],
    };
  }

  // Opening balance: sum of all postings before `from`
  let openingDebit = 0;
  let openingCredit = 0;
  if (args.from) {
    const { data: openRows } = await supabase
      .from("journal_lines")
      .select(
        "debit, credit, journal_entries!inner(entry_date, status)",
      )
      .eq("account_id", args.account_id)
      .eq("journal_entries.status", "posted")
      .lt("journal_entries.entry_date", args.from);
    for (const r of (openRows ?? []) as Array<{ debit: number; credit: number }>) {
      openingDebit += Number(r.debit);
      openingCredit += Number(r.credit);
    }
  }
  const opening_balance =
    acc.normal_balance === "debit"
      ? openingDebit - openingCredit
      : openingCredit - openingDebit;

  // Period entries
  let q = supabase
    .from("journal_lines")
    .select(
      "id, debit, credit, description, journal_entries!inner(id, entry_number, entry_date, description, source_type, source_id, status)",
    )
    .eq("account_id", args.account_id)
    .order("entry_date", { referencedTable: "journal_entries", ascending: true })
    .order("created_at", { referencedTable: "journal_entries", ascending: true });
  if (args.from) q = q.gte("journal_entries.entry_date", args.from);
  if (args.to) q = q.lte("journal_entries.entry_date", args.to);

  const { data: lineRows } = await q;

  type RawLine = {
    id: string;
    debit: number;
    credit: number;
    description: string | null;
    journal_entries: {
      id: string;
      entry_number: string;
      entry_date: string;
      description: string;
      source_type: string;
      source_id: string | null;
      status: AccountLedgerEntry["status"];
    };
  };

  const rows = (lineRows as unknown as RawLine[] | null) ?? [];

  let running = opening_balance;
  let totalDebit = 0;
  let totalCredit = 0;

  const entries: AccountLedgerEntry[] = rows.map((r) => {
    const d = Number(r.debit);
    const c = Number(r.credit);
    totalDebit += d;
    totalCredit += c;
    if (r.journal_entries.status === "posted") {
      running += acc.normal_balance === "debit" ? d - c : c - d;
    }
    return {
      line_id: r.id,
      entry_id: r.journal_entries.id,
      entry_number: r.journal_entries.entry_number,
      entry_date: r.journal_entries.entry_date,
      description: r.journal_entries.description,
      source_type: r.journal_entries.source_type,
      source_id: r.journal_entries.source_id,
      status: r.journal_entries.status,
      debit: d,
      credit: c,
      line_description: r.description,
      running_balance: running,
    };
  });

  return {
    account: acc,
    opening_balance,
    closing_balance: running,
    total_debit: totalDebit,
    total_credit: totalCredit,
    entries,
  };
}

// ─── Activity Logs ─────────────────────────────────────────
export async function getActivityLogs(filters?: {
  user_id?: string;
  action?: string;
  page?: number;
  limit?: number;
  /** WIB-aware ISO string, inclusive start. */
  from?: string;
  /** WIB-aware ISO string, inclusive end (use with .lte). */
  to?: string;
}) {
  await requireOwner();
  const supabase = await createClient();
  const page = filters?.page ?? 1;
  const limit = filters?.limit ?? 50;
  const rangeStart = (page - 1) * limit;

  let query = supabase
    .from("activity_logs")
    .select("*, profiles:user_id(full_name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(rangeStart, rangeStart + limit - 1);

  if (filters?.user_id) query = query.eq("user_id", filters.user_id);
  if (filters?.action) query = query.eq("action", filters.action);
  if (filters?.from) query = query.gte("created_at", filters.from);
  if (filters?.to) query = query.lte("created_at", filters.to);

  const { data, count } = await query;
  return { data: data ?? [], total: count ?? 0 };
}

// ─── Delete Requests ───────────────────────────────────────
export async function getDeleteRequests(status?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("delete_requests")
    .select("*, profiles:requested_by(full_name)")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data } = await query;
  return data ?? [];
}

// ─── Sold History ──────────────────────────────────────────
export async function getSoldHistory(filters?: {
  platform?: string;
  courier?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: unknown[]; total: number }> {
  const supabase = await createClient();
  const page = filters?.page ?? 1;
  const limit = filters?.limit ?? 20;
  const from = (page - 1) * limit;

  let query = supabase
    .from("packing_sessions")
    .select("*, packing_items(*, products(brand, model, size, sku)), profiles:packed_by(full_name)", { count: "exact" })
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .range(from, from + limit - 1);

  if (filters?.platform) query = query.eq("platform", filters.platform);
  if (filters?.courier) query = query.eq("courier", filters.courier);

  const { data, count } = await query;
  return { data: data ?? [], total: count ?? 0 };
}

// ─── Stock Distribution ────────────────────────────────────
export async function getStockByBrand(): Promise<{ brand: string; value: number; units: number }[]> {
  await requireOwner();
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("brand, quantity, hpp")
    .eq("is_active", true)
    .gt("quantity", 0);

  if (!data) return [];

  const map: Record<string, { value: number; units: number }> = {};
  for (const p of data) {
    const brand = p.brand || "Lainnya";
    if (!map[brand]) map[brand] = { value: 0, units: 0 };
    map[brand].value += p.quantity * Number(p.hpp || 0);
    map[brand].units += p.quantity;
  }

  return Object.entries(map)
    .map(([brand, d]) => ({ brand, ...d }))
    .sort((a, b) => b.value - a.value);
}

// ─── Helpers ───────────────────────────────────────────────
function getMonthStart() {
  const n = nowWIB();
  return wibStartOfMonth(n.getUTCFullYear(), n.getUTCMonth());
}

export async function getMonthlySales(selectedMonth?: string, selectedDate?: string) {
  await requireOwnerOrFinance();
  const supabase = await createClient();

  // Use packing_sessions.completed_at as the sale timestamp — consistent with
  // heatmap dots and financial reports. Filter in WIB.
  let query = supabase
    .from("packing_items")
    .select("products(brand, model), packing_sessions!inner(status, completed_at)")
    .in("packing_sessions.status", ["shipped", "completed", "has_return"])
    .not("packing_sessions.completed_at", "is", null);

  if (selectedDate) {
    // Single-day range — WIB midnight to end of day
    query = query
      .gte("packing_sessions.completed_at", wibStartOfDay(selectedDate))
      .lte("packing_sessions.completed_at", wibEndOfDay(selectedDate));
  } else if (selectedMonth) {
    const [year, month] = selectedMonth.split("-").map(Number);
    query = query
      .gte("packing_sessions.completed_at", wibStartOfMonth(year!, month! - 1))
      .lt("packing_sessions.completed_at", wibStartOfNextMonth(year!, month! - 1));
  }

  // ─── Previous-period query (for trend badges) ──────────────────────────
  // For single-date → previous day. For single-month → previous month.
  // For all-time → skip (no natural "previous").
  let prevFrom: string | undefined;
  let prevTo: string | undefined;
  if (selectedDate) {
    // Parse YYYY-MM-DD, subtract one day using UTC arithmetic (tz-safe).
    const [y, m, d] = selectedDate.split("-").map(Number);
    const dt = new Date(Date.UTC(y!, m! - 1, d!));
    dt.setUTCDate(dt.getUTCDate() - 1);
    const prev = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
    prevFrom = wibStartOfDay(prev);
    prevTo = wibEndOfDay(prev);
  } else if (selectedMonth) {
    const [year, month] = selectedMonth.split("-").map(Number);
    const zero = month! - 1; // 0-11 current
    const prevMonth = zero === 0 ? 11 : zero - 1;
    const prevYear = zero === 0 ? year! - 1 : year!;
    prevFrom = wibStartOfMonth(prevYear, prevMonth);
    prevTo = wibStartOfNextMonth(prevYear, prevMonth);
  }

  const prevQuery = prevFrom && prevTo
    ? supabase
        .from("packing_items")
        .select("products(brand, model), packing_sessions!inner(status, completed_at)")
        .in("packing_sessions.status", ["shipped", "completed", "has_return"])
        .not("packing_sessions.completed_at", "is", null)
        .gte("packing_sessions.completed_at", prevFrom)
        .lt("packing_sessions.completed_at", prevTo)
    : null;

  const [{ data }, prevRes] = await Promise.all([
    query,
    prevQuery ?? Promise.resolve({ data: null as null | any[] }),
  ]);

  // Aggregate previous totals per model (for trend comparison).
  const previousTotals: Record<string, number> = {};
  if (prevRes?.data) {
    for (const row of prevRes.data as unknown as { products: { brand: string; model: string } | null }[]) {
      const m = row.products?.model;
      if (m) previousTotals[m] = (previousTotals[m] || 0) + 1;
    }
  }

  if (!data || data.length === 0) {
    return { weeks: [], brands: [] as string[], models: [] as string[], previousTotals };
  }

  type Row = {
    products: { brand: string; model: string } | null;
    packing_sessions: { completed_at: string } | null;
  };

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const allBrands = new Set<string>();
  const allModels = new Set<string>();

  // ─── HOURLY VIEW (single date) ────────────────────────────────────────
  if (selectedDate) {
    const hourData: Record<number, Record<string, number>> = {};

    for (const raw of data) {
      const item = raw as unknown as Row;
      const completedAt = item.packing_sessions?.completed_at;
      if (!completedAt) continue;

      const hour = getWIBHour(completedAt);
      if (!hourData[hour]) hourData[hour] = { terjual: 0 };
      hourData[hour]!["terjual"] = (hourData[hour]!["terjual"] || 0) + 1;

      const p = item.products;
      if (p) {
        allBrands.add(p.brand);
        allModels.add(p.model);
        hourData[hour]![p.brand] = (hourData[hour]![p.brand] || 0) + 1;
        hourData[hour]![p.model] = (hourData[hour]![p.model] || 0) + 1;
      }
    }

    const brands = Array.from(allBrands).sort();
    const models = Array.from(allModels).sort();
    const result: Record<string, number | string>[] = [];

    // Stop at current hour if selectedDate is today (WIB).
    const now = nowWIB();
    const [sdY, sdM, sdD] = selectedDate.split("-").map(Number);
    const isToday =
      now.getUTCFullYear() === sdY! &&
      now.getUTCMonth() === sdM! - 1 &&
      now.getUTCDate() === sdD!;
    const lastHourToShow = isToday ? now.getUTCHours() : 23;

    for (let h = 0; h <= lastHourToShow; h++) {
      const entry = hourData[h] || {};
      const label = `${String(h).padStart(2, "0")}:00`;
      const row: Record<string, number | string> = { week: label, terjual: entry.terjual || 0 };
      brands.forEach(b => { row[b] = entry[b] || 0; });
      models.forEach(m => { row[m] = entry[m] || 0; });
      result.push(row);
    }
    return { weeks: result, brands, models, previousTotals };
  }

  // ─── DAILY VIEW (single month) ────────────────────────────────────────
  if (selectedMonth) {
    const [year, month] = selectedMonth.split("-").map(Number);
    const daysInMonth = daysInWIBMonth(year!, month! - 1);

    // Stop at today if we're looking at the current WIB month — no phantom
    // future days on the chart.
    const now = nowWIB();
    const isCurrentMonth =
      now.getUTCFullYear() === year! && now.getUTCMonth() === month! - 1;
    const lastDayToShow = isCurrentMonth ? now.getUTCDate() : daysInMonth;

    const dayData: Record<string, Record<string, number>> = {};

    for (const raw of data) {
      const item = raw as unknown as Row;
      const completedAt = item.packing_sessions?.completed_at;
      if (!completedAt) continue;

      const day = getWIBDay(completedAt);
      if (!dayData[day]) dayData[day] = { terjual: 0 };
      dayData[day]!["terjual"] = (dayData[day]!["terjual"] || 0) + 1;

      const p = item.products;
      if (p) {
        allBrands.add(p.brand);
        allModels.add(p.model);
        dayData[day]![p.brand] = (dayData[day]![p.brand] || 0) + 1;
        dayData[day]![p.model] = (dayData[day]![p.model] || 0) + 1;
      }
    }

    const brands = Array.from(allBrands).sort();
    const models = Array.from(allModels).sort();
    const result: Record<string, number | string>[] = [];

    for (let d = 1; d <= lastDayToShow; d++) {
      const entry = dayData[d] || {};
      const row: Record<string, number | string> = { week: `Tgl ${d}`, terjual: entry.terjual || 0 };
      brands.forEach(b => { row[b] = entry[b] || 0; });
      models.forEach(m => { row[m] = entry[m] || 0; });
      result.push(row);
    }
    return { weeks: result, brands, models, previousTotals };
  }

  // ─── ALL-TIME WEEKLY VIEW ─────────────────────────────────────────────
  const getWeekKey = (y: number, m: number, d: number) => `${y}-${m}-${Math.ceil(d / 7)}`;
  const getWeekLabel = (_y: number, m: number, d: number) => `${monthNames[m]} W${Math.ceil(d / 7)}`;

  const weeks: Record<string, Record<string, number>> = {};

  for (const raw of data) {
    const item = raw as unknown as Row;
    const completedAt = item.packing_sessions?.completed_at;
    if (!completedAt) continue;

    const y = getWIBYear(completedAt);
    const m = getWIBMonth(completedAt);
    const d = getWIBDay(completedAt);
    const key = getWeekKey(y, m, d);

    if (!weeks[key]) weeks[key] = { terjual: 0 };
    const w = weeks[key]!;
    w["terjual"] = ((w["terjual"] as number) || 0) + 1;

    const p = item.products;
    if (p) {
      allBrands.add(p.brand);
      allModels.add(p.model);
      w[p.brand] = (w[p.brand] || 0) + 1;
      w[p.model] = (w[p.model] || 0) + 1;
    }
  }

  const brands = Array.from(allBrands).sort();
  const models = Array.from(allModels).sort();

  // Find oldest date (in WIB) from the data
  let oldestTs = Infinity;
  for (const raw of data) {
    const item = raw as unknown as Row;
    const t = item.packing_sessions?.completed_at;
    if (!t) continue;
    const ts = new Date(t).getTime();
    if (ts < oldestTs) oldestTs = ts;
  }
  if (oldestTs === Infinity) return { weeks: [], brands, models, previousTotals };

  const oldestY = getWIBYear(new Date(oldestTs));
  const oldestM = getWIBMonth(new Date(oldestTs));
  const todayTs = Date.now();
  const todayY = getWIBYear(new Date(todayTs));
  const todayM = getWIBMonth(new Date(todayTs));

  const result: Record<string, number | string>[] = [];
  let curY = oldestY;
  let curM = oldestM;
  while (curY < todayY || (curY === todayY && curM <= todayM)) {
    const dim = daysInWIBMonth(curY, curM);
    const totalWeeks = Math.ceil(dim / 7);
    for (let w = 1; w <= totalWeeks; w++) {
      const dayOfWeek = (w - 1) * 7 + 1;
      // GUARD: Stop if this week's first day is in the future (WIB)
      if (curY === todayY && curM === todayM && dayOfWeek > getWIBDay(new Date(todayTs))) break;

      const key = getWeekKey(curY, curM, dayOfWeek);
      const entry = weeks[key] || {};
      const row: Record<string, number | string> = {
        week: getWeekLabel(curY, curM, dayOfWeek),
        terjual: entry.terjual || 0,
      };
      brands.forEach(b => { row[b] = entry[b] || 0; });
      models.forEach(m => { row[m] = entry[m] || 0; });
      result.push(row);
    }
    // advance one month
    if (curM === 11) { curM = 0; curY++; } else { curM++; }
  }

  return { weeks: result, brands, models, previousTotals };
}

export async function getAvailableMonths() {
  await requireOwner();
  const supabase = await createClient();

  const { data } = await supabase
    .from("packing_items")
    .select("created_at")
    .order("created_at", { ascending: false });

  if (!data) return [];

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const seen = new Set<string>();
  const months: { label: string; value: string }[] = [];

  for (const item of data) {
    const y = getWIBYear(item.created_at);
    const m = getWIBMonth(item.created_at);
    const value = `${y}-${String(m + 1).padStart(2, '0')}`;
    if (!seen.has(value)) {
      seen.add(value);
      months.push({
        label: `${monthNames[m]} ${y}`,
        value
      });
    }
  }

  return months;
}

// ─── Reports ───────────────────────────────────────────────
export async function getStockValue(): Promise<{ items: number; cost: number; retail: number }> {
  await requireOwnerOrFinance();
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("quantity, hpp, sell_price")
    .eq("is_active", true);
  const rows = data ?? [];
  return {
    items: rows.reduce((s, p) => s + (p.quantity ?? 0), 0),
    cost: rows.reduce((s, p) => s + (p.quantity ?? 0) * Number(p.hpp ?? 0), 0),
    retail: rows.reduce((s, p) => s + (p.quantity ?? 0) * Number(p.sell_price ?? 0), 0),
  };
}

export async function getProfitReport(
  from?: string,
  to?: string
): Promise<{ revenue: number; cost: number; profit: number; items: number }> {
  await requireOwnerOrFinance();
  const supabase = await createClient();
  let query = supabase
    .from("packing_items")
    .select("sell_price, unit_hpp, packing_sessions!inner(status, completed_at)")
    .eq("packing_sessions.status", "completed");

  if (from) query = query.gte("packing_sessions.completed_at", from);
  if (to) query = query.lte("packing_sessions.completed_at", to);

  const { data } = await query;
  const rows = (data ?? []) as { sell_price: number; unit_hpp: number }[];
  const revenue = rows.reduce((s, r) => s + Number(r.sell_price ?? 0), 0);
  const cost = rows.reduce((s, r) => s + Number(r.unit_hpp ?? 0), 0);
  return { revenue, cost, profit: revenue - cost, items: rows.length };
}

export type FinancialSummaryModel = {
  brand: string;
  model: string;
  units_sold: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
};

export async function getFinancialSummaryByModel(selectedMonth?: string, selectedDate?: string): Promise<FinancialSummaryModel[]> {
  await requireOwnerOrFinance();
  const supabase = await createClient();
  let query = supabase
    .from("packing_items")
    .select("sell_price, unit_hpp, products(brand, model), packing_sessions!inner(status, completed_at)")
    .in("packing_sessions.status", ["shipped", "completed", "has_return"]);

  if (selectedDate) {
    query = query
      .gte("packing_sessions.completed_at", wibStartOfDay(selectedDate))
      .lte("packing_sessions.completed_at", wibEndOfDay(selectedDate));
  } else if (selectedMonth) {
    const [year, month] = selectedMonth.split("-").map(Number);
    query = query
      .gte("packing_sessions.completed_at", wibStartOfMonth(year!, month! - 1))
      .lt("packing_sessions.completed_at", wibStartOfNextMonth(year!, month! - 1));
  }

  const { data } = await query;
  if (!data) return [];

  const summaryMap: Record<string, FinancialSummaryModel> = {};

  for (const item of data) {
    const p = (item as any).products;
    if (!p) continue;
    
    // Sanitize brand & model for consistent grouping
    const brandRaw = (p.brand || 'Unknown').trim();
    const modelRaw = (p.model || 'Unknown').trim();
    const key = `${brandRaw.toLowerCase()}::${modelRaw.toLowerCase()}`;
    
    if (!summaryMap[key]) {
      summaryMap[key] = {
        brand: brandRaw, // Keep original casing of first found for display
        model: modelRaw,
        units_sold: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        margin: 0,
      };
    }
    
    const revenue = Number(item.sell_price || 0);
    const cost = Number(item.unit_hpp || 0);
    const profit = revenue - cost;

    summaryMap[key].units_sold += 1;
    summaryMap[key].revenue += revenue;
    summaryMap[key].cost += cost;
    summaryMap[key].profit += profit;
  }

  // Calculate margins and convert to array
  const result = Object.values(summaryMap).map(row => {
    row.margin = row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0;
    return row;
  });

  // Sort by profit descending
  return result.sort((a, b) => b.profit - a.profit);
}

export async function getAgingReport(): Promise<unknown[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("id, brand, model, size, quantity, hpp, first_inbound_at")
    .eq("is_active", true)
    .gt("quantity", 0)
    .order("first_inbound_at", { ascending: true, nullsFirst: true })
    .limit(50);
  return data ?? [];
}

export type ExpenseReportRow = {
  category: string;
  account_code: string;
  total: number;
  count: number;
};

export async function getExpenseReport(
  from?: string,
  to?: string,
): Promise<ExpenseReportRow[]> {
  await requireOwnerOrFinance();
  const supabase = await createClient();
  let query = supabase
    .from("expenses")
    .select("amount, expense_date, status, expense_categories:category_id(name, account_code)")
    .eq("status", "paid");
  if (from) query = query.gte("expense_date", from.slice(0, 10));
  if (to) query = query.lte("expense_date", to.slice(0, 10));

  const { data } = await query;
  const map = new Map<string, ExpenseReportRow>();
  for (const row of ((data ?? []) as unknown as Array<{
    amount: number;
    expense_categories: { name: string; account_code: string } | null;
  }>)) {
    const category = row.expense_categories?.name ?? "Tanpa kategori";
    const account = row.expense_categories?.account_code ?? "—";
    const key = `${account}:${category}`;
    const current = map.get(key) ?? {
      category,
      account_code: account,
      total: 0,
      count: 0,
    };
    current.total += Number(row.amount ?? 0);
    current.count += 1;
    map.set(key, current);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export type MarketplaceCostReportRow = {
  channel: string;
  orders: number;
  gmv: number;
  marketplace_fee: number;
  discount: number;
  shipping: number;
  net_sales: number;
};

export async function getMarketplaceCostReport(
  from?: string,
  to?: string,
): Promise<MarketplaceCostReportRow[]> {
  await requireOwnerOrFinance();
  const supabase = await createClient();
  let query = supabase
    .from("sales_invoices")
    .select("channel, invoice_date, subtotal, discount, shipping, marketplace_fee, total, status")
    .in("channel", ["shopee", "tiktok"])
    .neq("status", "cancelled");
  if (from) query = query.gte("invoice_date", from.slice(0, 10));
  if (to) query = query.lte("invoice_date", to.slice(0, 10));

  const { data } = await query;
  const map = new Map<string, MarketplaceCostReportRow>();
  for (const row of (data ?? []) as Array<{
    channel: string;
    subtotal: number;
    discount: number;
    shipping: number;
    marketplace_fee: number;
    total: number;
  }>) {
    const current = map.get(row.channel) ?? {
      channel: row.channel,
      orders: 0,
      gmv: 0,
      marketplace_fee: 0,
      discount: 0,
      shipping: 0,
      net_sales: 0,
    };
    current.orders += 1;
    current.gmv += Number(row.subtotal ?? 0);
    current.marketplace_fee += Number(row.marketplace_fee ?? 0);
    current.discount += Number(row.discount ?? 0);
    current.shipping += Number(row.shipping ?? 0);
    current.net_sales += Number(row.total ?? 0);
    map.set(row.channel, current);
  }
  return Array.from(map.values()).sort((a, b) => b.net_sales - a.net_sales);
}

export type ProfitByChannelRow = {
  channel: string;
  invoices: number;
  units: number;
  revenue: number;
  cogs: number;
  marketplace_fee: number;
  discount: number;
  profit: number;
  margin: number;
};

export async function getProfitByChannelReport(
  from?: string,
  to?: string,
): Promise<ProfitByChannelRow[]> {
  await requireOwnerOrFinance();
  const supabase = await createClient();
  let query = supabase
    .from("sales_invoices")
    .select("id, channel, invoice_date, total, discount, marketplace_fee, status, sales_invoice_lines(qty, unit_cost)")
    .neq("status", "cancelled");
  if (from) query = query.gte("invoice_date", from.slice(0, 10));
  if (to) query = query.lte("invoice_date", to.slice(0, 10));

  const { data } = await query;
  const map = new Map<string, ProfitByChannelRow>();
  for (const row of (data ?? []) as Array<{
    channel: string;
    total: number;
    discount: number;
    marketplace_fee: number;
    sales_invoice_lines: Array<{ qty: number; unit_cost: number }> | null;
  }>) {
    const current = map.get(row.channel) ?? {
      channel: row.channel,
      invoices: 0,
      units: 0,
      revenue: 0,
      cogs: 0,
      marketplace_fee: 0,
      discount: 0,
      profit: 0,
      margin: 0,
    };
    const lines = row.sales_invoice_lines ?? [];
    const cogs = lines.reduce(
      (sum, line) => sum + Number(line.qty ?? 0) * Number(line.unit_cost ?? 0),
      0,
    );
    const units = lines.reduce((sum, line) => sum + Number(line.qty ?? 0), 0);
    current.invoices += 1;
    current.units += units;
    current.revenue += Number(row.total ?? 0);
    current.cogs += cogs;
    current.marketplace_fee += Number(row.marketplace_fee ?? 0);
    current.discount += Number(row.discount ?? 0);
    map.set(row.channel, current);
  }

  return Array.from(map.values())
    .map((row) => {
      row.profit = row.revenue - row.cogs;
      row.margin = row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0;
      return row;
    })
    .sort((a, b) => b.profit - a.profit);
}

export type StockCardRow = {
  product_id: string;
  product_label: string;
  sku: string;
  barcode: string;
  inbound: number;
  outbound: number;
  adjustment: number;
  current_qty: number;
  last_movement_at: string | null;
};

export async function getStockCardReport(): Promise<StockCardRow[]> {
  await requireOwnerOrFinance();
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("id, brand, model, size, sku, barcode, quantity, stock_movements(type, quantity, created_at)")
    .eq("is_active", true)
    .order("brand", { ascending: true })
    .order("model", { ascending: true })
    .limit(300);

  return ((data as unknown as Array<{
    id: string;
    brand: string;
    model: string;
    size: number;
    sku: string;
    barcode: string;
    quantity: number;
    stock_movements: Array<{
      type: string;
      quantity: number;
      created_at: string;
    }> | null;
  }> | null) ?? []).map((product) => {
    const movements = product.stock_movements ?? [];
    const inbound = movements
      .filter((movement) => ["inbound", "return_in"].includes(movement.type))
      .reduce((sum, movement) => sum + Number(movement.quantity ?? 0), 0);
    const outbound = movements
      .filter((movement) => ["outbound", "return_out"].includes(movement.type))
      .reduce((sum, movement) => sum + Number(movement.quantity ?? 0), 0);
    const adjustment = movements
      .filter((movement) => movement.type === "adjustment")
      .reduce((sum, movement) => sum + Number(movement.quantity ?? 0), 0);
    const lastMovement = movements
      .map((movement) => movement.created_at)
      .sort()
      .at(-1) ?? null;
    return {
      product_id: product.id,
      product_label: `${product.brand} ${product.model} • Size ${Number(product.size)}`,
      sku: product.sku,
      barcode: product.barcode,
      inbound,
      outbound,
      adjustment,
      current_qty: Number(product.quantity ?? 0),
      last_movement_at: lastMovement,
    };
  });
}

// ─── Returns ───────────────────────────────────────────────
export async function getReturns(status?: string): Promise<unknown[]> {
  const supabase = await createClient();
  let query = supabase
    .from("returns")
    .select(`
      *,
      packing_items(
        id, barcode_scanned,
        packing_sessions(id, platform_order_id, platform),
        products(id, brand, model, size, sku)
      ),
      original:original_product_id(brand, model, size),
      new:new_product_id(brand, model, size)
    `)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data } = await query;
  return data ?? [];
}

// Packing items from shipped/completed sessions that don't have an active return yet.
export async function getReturnableItems(): Promise<unknown[]> {
  const supabase = await createClient();

  // First get sessions with returnable statuses
  const { data: sessions } = await supabase
    .from("packing_sessions")
    .select("id")
    .in("status", ["shipped", "completed", "has_return"]);

  if (!sessions || sessions.length === 0) return [];

  const sessionIds = sessions.map((s) => s.id);

  const { data } = await supabase
    .from("packing_items")
    .select(`
      id, barcode_scanned, created_at,
      products(id, brand, model, size, sku),
      packing_sessions(id, platform, platform_order_id, status),
      returns(id, status)
    `)
    .in("packing_session_id", sessionIds)
    .order("created_at", { ascending: false })
    .limit(200);

  // Filter: exclude items that already have a non-cancelled return
  return (data ?? []).filter((item) => {
    const returns = (item as { returns?: { status: string }[] }).returns ?? [];
    return !returns.some((r) => r.status !== "cancelled");
  });
}

// Active products (for exchange_size picker)
export async function getActiveProductsByModel(brand: string, model: string): Promise<unknown[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("id, brand, model, size, sku, quantity")
    .eq("brand", brand)
    .eq("model", model)
    .eq("is_active", true)
    .order("size");
  return data ?? [];
}
