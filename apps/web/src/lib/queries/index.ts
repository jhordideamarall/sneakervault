import { createClient } from "@sneakervault/supabase/server";
import { getCurrentUser } from "@/lib/actions/auth";
import { measureServer } from "@/lib/server-perf";
import type {
  ExpenseStatus,
  PaymentMethod,
  PreOrderSource,
  PreOrderStatus,
} from "@sneakervault/shared";
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

type MaybeRelation<T> = T | T[] | null;

function firstRelation<T>(value: MaybeRelation<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

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
  "id, brand, model, sku, size, size_label, color, barcode, quantity, hpp, sell_price, price_offline, price_website, price_shopee, price_tiktok, price_tokopedia, image_url, condition, defect_reason, is_active, created_at, first_inbound_at";

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

export async function getInventoryProducts(filters?: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{
  data: unknown[];
  totalSku: number;
  totalModels: number;
  page: number;
  limit: number;
  summary: {
    totalQty: number;
    normalQty: number;
    defectQty: number;
    dormantQty: number;
  };
  error: unknown;
}> {
  return measureServer("query.inventoryProducts", async () => {
    const supabase = await createClient();
    const requestedPage = Math.max(1, filters?.page ?? 1);
    const limit = Math.max(1, filters?.limit ?? 50);
    const search = filters?.search?.trim() || null;

    const summaryRes = await supabase.rpc("get_inventory_summary", {
      p_search: search,
    });

    if (summaryRes.error) return getInventoryProductsLegacy(filters);

    const summaryRow = summaryRes.data?.[0];
    const totalModels = Number(summaryRow?.total_models ?? 0);
    const totalSku = Number(summaryRow?.total_sku ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalModels / limit));
    const page = Math.min(requestedPage, totalPages);

    if (totalModels === 0) {
      return {
        data: [],
        totalSku,
        totalModels,
        page: 1,
        limit,
        summary: {
          totalQty: Number(summaryRow?.total_qty ?? 0),
          normalQty: Number(summaryRow?.normal_qty ?? 0),
          defectQty: Number(summaryRow?.defect_qty ?? 0),
          dormantQty: Number(summaryRow?.dormant_qty ?? 0),
        },
        error: null,
      };
    }

    const productsRes = await supabase.rpc("get_inventory_page", {
      p_search: search,
      p_limit: limit,
      p_offset: (page - 1) * limit,
    });

    if (productsRes.error) return getInventoryProductsLegacy(filters);

    return {
      data: productsRes.data ?? [],
      totalSku,
      totalModels,
      page,
      limit,
      summary: {
        totalQty: Number(summaryRow?.total_qty ?? 0),
        normalQty: Number(summaryRow?.normal_qty ?? 0),
        defectQty: Number(summaryRow?.defect_qty ?? 0),
        dormantQty: Number(summaryRow?.dormant_qty ?? 0),
      },
      error: productsRes.error,
    };
  });
}

async function getInventoryProductsLegacy(filters?: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{
  data: unknown[];
  totalSku: number;
  totalModels: number;
  page: number;
  limit: number;
  summary: {
    totalQty: number;
    normalQty: number;
    defectQty: number;
    dormantQty: number;
  };
  error: unknown;
}> {
  const supabase = await createClient();
  const requestedPage = Math.max(1, filters?.page ?? 1);
  const limit = Math.max(1, filters?.limit ?? 50);
  const search = filters?.search?.trim();

  const rows: unknown[] = [];
  let offset = 0;
  let totalCount: number | null = null;
  let error: unknown = null;
  const chunkSize = 1000;

  while (true) {
    // Supabase query-builder generics become self-referential across conditional chaining here.
    // Keep this typed locally and validate the returned shape below.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from("products")
      .select(
        `${PRODUCT_FIELDS}, suppliers:default_supplier_id(name)`,
        { count: totalCount === null ? "exact" : undefined },
      )
      .eq("is_active", true)
      .order("brand", { ascending: true })
      .order("model", { ascending: true })
      .order("size", { ascending: true })
      .range(offset, offset + chunkSize - 1);

    if (search) {
      query = query.or(
        `brand.ilike.%${search}%,model.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%,color.ilike.%${search}%,size_label.ilike.%${search}%`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await query;
    if (result.error) {
      error = result.error;
      break;
    }

    if (totalCount === null) totalCount = result.count ?? 0;
    const data = result.data ?? [];
    rows.push(...data);

    if (data.length < chunkSize) break;
    if (totalCount !== null && rows.length >= totalCount) break;
    offset += chunkSize;
  }

  type ProductKeyRow = { brand: string; model: string; quantity: number; condition: string };
  const groupKeys: string[] = [];
  const seen = new Set<string>();
  const summary = { totalQty: 0, normalQty: 0, defectQty: 0, dormantQty: 0 };

  for (const row of rows as ProductKeyRow[]) {
    const key = `${row.brand}\u0000${row.model}`;
    if (!seen.has(key)) {
      seen.add(key);
      groupKeys.push(key);
    }
    summary.totalQty += row.quantity;
    if (row.condition === "normal") summary.normalQty += row.quantity;
    else if (row.condition === "defect") summary.defectQty += row.quantity;
    else if (row.condition === "dormant") summary.dormantQty += row.quantity;
  }

  const totalModels = groupKeys.length;
  const totalPages = Math.max(1, Math.ceil(totalModels / limit));
  const page = Math.min(requestedPage, totalPages);
  const from = (page - 1) * limit;
  const pageKeys = new Set(groupKeys.slice(from, from + limit));
  const pageRows = (rows as ProductKeyRow[]).filter((row) =>
    pageKeys.has(`${row.brand}\u0000${row.model}`),
  );

  return {
    data: pageRows,
    totalSku: totalCount ?? rows.length,
    totalModels,
    page,
    limit,
    summary,
    error,
  };
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
  channel: "wa" | "shopee" | "tiktok" | "tokopedia" | "offline" | "website" | "mixed";
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
  coa_account_id: string | null;
  coa_account_code: string | null;
  coa_account_name: string | null;
  created_at: string;
};

export async function getBankAccounts(opts?: {
  includeInactive?: boolean;
}): Promise<BankAccountRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("bank_accounts")
    .select(
      "id, name, type, bank_name, account_number, account_holder, opening_balance, current_balance, currency, is_default, is_active, notes, coa_account_id, created_at, coa:coa_account_id(code, name)",
    )
    .order("is_default", { ascending: false })
    .order("type")
    .order("name");
  if (!opts?.includeInactive) query = query.eq("is_active", true);
  const { data } = await query;
  type RawBankAccount = Omit<
    BankAccountRow,
    "coa_account_code" | "coa_account_name"
  > & {
    coa?: { code: string; name: string } | null;
  };
  return ((data as RawBankAccount[] | null) ?? []).map((row) => ({
    ...row,
    coa_account_code: row.coa?.code ?? null,
    coa_account_name: row.coa?.name ?? null,
  }));
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

export type CoaAccountOption = Pick<
  CoaRow,
  "id" | "code" | "name" | "type" | "normal_balance"
>;

export async function getCoaAccountOptions(opts?: {
  types?: CoaRow["type"][];
}): Promise<CoaAccountOption[]> {
  const supabase = await createClient();
  let q = supabase
    .from("chart_of_accounts")
    .select("id, code, name, type, normal_balance")
    .eq("is_active", true)
    .order("code", { ascending: true });
  if (opts?.types?.length) q = q.in("type", opts.types);
  const { data } = await q;
  return (data as CoaAccountOption[] | null) ?? [];
}

// ─── Employees, Payroll, Fixed Assets ──────────────────────
export type EmployeeRow = {
  id: string;
  employee_code: string | null;
  full_name: string;
  job_title: string | null;
  department: string | null;
  base_salary: number;
  bank_account_name: string | null;
  bank_account_number: string | null;
  tax_id: string | null;
  hire_date: string | null;
  is_active: boolean;
  created_at: string;
};

export async function getEmployees(opts?: {
  includeInactive?: boolean;
}): Promise<EmployeeRow[]> {
  await requireOwnerOrFinance();
  const supabase = await createClient();
  let query = (supabase as any)
    .from("employees")
    .select("id, employee_code, full_name, job_title, department, base_salary, bank_account_name, bank_account_number, tax_id, hire_date, is_active, created_at")
    .order("full_name");
  if (!opts?.includeInactive) query = query.eq("is_active", true);
  const { data } = await query;
  return ((data as EmployeeRow[] | null) ?? []).map((row) => ({
    ...row,
    base_salary: Number(row.base_salary ?? 0),
  }));
}

export type FixedAssetRow = {
  id: string;
  asset_code: string | null;
  name: string;
  asset_account_id: string | null;
  asset_account_code: string | null;
  asset_account_name: string | null;
  acquisition_date: string;
  acquisition_cost: number;
  salvage_value: number;
  useful_life_months: number;
  method: "straight_line" | "double_declining";
  accumulated_depreciation: number;
  book_value: number;
  location: string | null;
  department: string | null;
  status: "active" | "disposed";
  notes: string | null;
  created_at: string;
};

export async function getFixedAssets(): Promise<FixedAssetRow[]> {
  await requireOwnerOrFinance();
  const supabase = await createClient();
  const { data } = await (supabase as any)
    .from("fixed_assets")
    .select("id, asset_code, name, asset_account_id, acquisition_date, acquisition_cost, salvage_value, useful_life_months, method, accumulated_depreciation, location, department, status, notes, created_at, asset_account:asset_account_id(code, name)")
    .order("acquisition_date", { ascending: false });
  return ((data as Array<Omit<FixedAssetRow, "asset_account_code" | "asset_account_name"> & {
    asset_account: { code: string; name: string } | null;
  }> | null) ?? []).map((row) => {
    const cost = Number(row.acquisition_cost ?? 0);
    const depreciation = Number(row.accumulated_depreciation ?? 0);
    return {
      ...row,
      asset_account_code: row.asset_account?.code ?? null,
      asset_account_name: row.asset_account?.name ?? null,
      acquisition_cost: cost,
      salvage_value: Number(row.salvage_value ?? 0),
      useful_life_months: Number(row.useful_life_months ?? 0),
      accumulated_depreciation: depreciation,
      book_value: Math.max(0, cost - depreciation),
    };
  });
}

export type PayrollRunRow = {
  id: string;
  period_month: string;
  payment_date: string;
  gross_amount: number;
  deductions: number;
  net_amount: number;
  status: string;
  payment_status: "paid" | "payable";
  liability_settled_at: string | null;
  notes: string | null;
  bank_account_id: string | null;
  bank_account_name: string | null;
  created_at: string;
  lines: Array<{
    id: string;
    employee_id: string;
    employee_name: string;
    base_salary: number;
    allowances: number;
    deductions: number;
    net_salary: number;
    notes: string | null;
    components: Array<{
      id: string;
      name: string;
      kind: "earning" | "deduction";
      amount: number;
      sort_order: number;
    }>;
  }>;
};

export async function getPayrollRuns(): Promise<PayrollRunRow[]> {
  await requireOwnerOrFinance();
  const supabase = await createClient();
  const { data } = await (supabase as any)
    .from("payroll_runs")
    .select("id, period_month, payment_date, bank_account_id, gross_amount, deductions, net_amount, status, payment_status, liability_settled_at, notes, created_at, bank_accounts:bank_account_id(name), payroll_lines(id, employee_id, base_salary, allowances, deductions, net_salary, notes, employees:employee_id(full_name), payroll_line_components(id, name, kind, amount, sort_order))")
    .order("period_month", { ascending: false });
  return ((data as Array<{
    id: string;
    period_month: string;
    payment_date: string;
    gross_amount: number;
    deductions: number;
    net_amount: number;
    status: string;
    payment_status: "paid" | "payable";
    liability_settled_at: string | null;
    notes: string | null;
    bank_account_id: string | null;
    created_at: string;
    bank_accounts: { name: string } | null;
    payroll_lines: Array<{
      id: string;
      employee_id: string;
      base_salary: number;
      allowances: number;
      deductions: number;
      net_salary: number;
      notes: string | null;
      employees: { full_name: string } | null;
      payroll_line_components: Array<{
        id: string;
        name: string;
        kind: "earning" | "deduction";
        amount: number;
        sort_order: number;
      }> | null;
    }> | null;
  }> | null) ?? []).map((run) => ({
    id: run.id,
    period_month: run.period_month,
    payment_date: run.payment_date,
    gross_amount: Number(run.gross_amount ?? 0),
    deductions: Number(run.deductions ?? 0),
    net_amount: Number(run.net_amount ?? 0),
    status: run.status,
    payment_status: run.payment_status,
    liability_settled_at: run.liability_settled_at,
    notes: run.notes,
    bank_account_id: run.bank_account_id,
    bank_account_name: run.bank_accounts?.name ?? null,
    created_at: run.created_at,
    lines: (run.payroll_lines ?? []).map((line) => ({
      id: line.id,
      employee_id: line.employee_id,
      employee_name: line.employees?.full_name ?? "—",
      base_salary: Number(line.base_salary ?? 0),
      allowances: Number(line.allowances ?? 0),
      deductions: Number(line.deductions ?? 0),
      net_salary: Number(line.net_salary ?? 0),
      notes: line.notes,
      components: (line.payroll_line_components ?? [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((component) => ({
          ...component,
          amount: Number(component.amount ?? 0),
        })),
    })),
  }));
}

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
  return measureServer("query.purchaseOrders", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_purchase_order_list", {
      p_limit: 1000,
      p_status: opts?.status ?? null,
      p_supplier_id: opts?.supplierId ?? null,
    });

    if (error) return getPurchaseOrdersLegacy(opts);

    return ((data as Array<{
      id: string;
      po_number: string;
      supplier_id: string;
      supplier_name: string;
      order_date: string;
      expected_date: string | null;
      status: PoListRow["status"];
      total: number;
      line_count: number;
      created_at: string;
    }> | null) ?? []).map((r) => ({
      id: r.id,
      po_number: r.po_number,
      supplier_id: r.supplier_id,
      supplier_name: r.supplier_name,
      order_date: r.order_date,
      expected_date: r.expected_date,
      status: r.status,
      total: Number(r.total),
      line_count: Number(r.line_count),
      created_at: r.created_at,
    }));
  });
}

async function getPurchaseOrdersLegacy(opts?: {
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
  // Guardrail: 1000 PO terbaru (lihat catatan di getSalesInvoices). Laporan
  // pembelian pakai agregasi terpisah, tak terpengaruh.
  query = query.limit(1000);
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
  new_size_label?: string | null;
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
      "id, po_number, supplier_id, order_date, expected_date, status, subtotal, tax, shipping, total, notes, created_at, approved_at, payment_type, dp_amount, dp_bank_account_id, suppliers:supplier_id(name), bank:dp_bank_account_id(name), purchase_order_lines(id, product_id, ordered_qty, received_qty, unit_cost, subtotal, notes, new_brand, new_model, new_size, new_size_label, new_color, new_sku, products:product_id(brand, model, sku, size, size_label, color))",
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
      new_size_label: string | null;
      new_color: string | null;
      new_sku: string | null;
      products: {
        brand: string;
        model: string;
        sku: string;
        size: number;
        size_label: string | null;
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
        ? `${l.products.brand} ${l.products.model} ${l.products.color} • Size ${l.products.size_label ?? Number(l.products.size)} • ${l.products.sku}`
        : l.new_brand
          ? `${l.new_brand} ${l.new_model} ${l.new_color ?? ""} • Size ${l.new_size_label ?? Number(l.new_size)} • ${l.new_sku} (baru)`
          : "(produk dihapus)",
      new_brand: l.new_brand,
      new_model: l.new_model,
      new_size: l.new_size != null ? Number(l.new_size) : null,
      new_size_label: l.new_size_label,
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
export type PurchaseInvoiceLineRow = {
  id: string;
  product_label: string;
  qty: number;
  unit_cost: number;
  subtotal: number;
  notes: string | null;
};

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
  lines: PurchaseInvoiceLineRow[];
};

export async function getPurchaseInvoices(opts?: {
  status?: string;
}): Promise<PurchaseInvoiceRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("purchase_invoices")
    .select(
      "id, invoice_number, supplier_id, po_id, invoice_date, due_date, subtotal, tax, total, paid_amount, status, notes, attachment_url, created_at, suppliers:supplier_id(name), purchase_invoice_lines(id, product_label, qty, unit_cost, subtotal, notes), purchase_orders:po_id(po_number, purchase_order_lines(id, ordered_qty, received_qty, unit_cost, subtotal, notes, new_brand, new_model, new_size, new_size_label, new_color, new_sku, products:product_id(brand, model, sku, size, size_label, color)))",
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
      purchase_invoice_lines:
        | Array<{
            id: string;
            product_label: string | null;
            qty: number;
            unit_cost: number;
            subtotal: number;
            notes: string | null;
          }>
        | null;
      purchase_orders: {
        po_number: string;
        purchase_order_lines:
          | Array<{
              id: string;
              ordered_qty: number;
              received_qty: number;
              unit_cost: number;
              subtotal: number;
              notes: string | null;
              new_brand: string | null;
              new_model: string | null;
              new_size: number | null;
              new_size_label: string | null;
              new_color: string | null;
              new_sku: string | null;
              products: {
                brand: string;
                model: string;
                sku: string;
                size: number | null;
                size_label: string | null;
                color: string | null;
              } | null;
            }>
          | null;
      } | null;
    }> | null) ?? []
  ).map((r) => {
    const manualLines =
      r.purchase_invoice_lines?.map((line) => ({
        id: line.id,
        product_label: line.product_label ?? "Item faktur manual",
        qty: Number(line.qty),
        unit_cost: Number(line.unit_cost),
        subtotal: Number(line.subtotal),
        notes: line.notes,
      })) ?? [];
    const poLines =
      r.purchase_orders?.purchase_order_lines?.map((line) => {
        const p = line.products;
        const productLabel = p
          ? `${p.brand} ${p.model}${p.color ? ` ${p.color}` : ""} • Size ${
              p.size_label ?? p.size ?? "-"
            } • ${p.sku}`
          : [
              line.new_brand,
              line.new_model,
              line.new_color,
              line.new_size_label ?? line.new_size,
              line.new_sku,
            ]
              .filter(Boolean)
              .join(" ");
        const qty =
          Number(line.received_qty) > 0
            ? Number(line.received_qty)
            : Number(line.ordered_qty);
        return {
          id: line.id,
          product_label: productLabel || "Item PO",
          qty,
          unit_cost: Number(line.unit_cost),
          subtotal: qty * Number(line.unit_cost),
          notes: line.notes,
        };
      }) ?? [];

    return {
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
      lines: manualLines.length > 0 ? manualLines : poLines,
    };
  });
}

// ─── Sales Invoices (Phase 3) ──────────────────────────────
export type SalesInvoiceRow = {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name: string;
  channel: "wa" | "shopee" | "tiktok" | "tokopedia" | "offline" | "website" | "mixed";
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
  return measureServer("query.salesInvoices", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_sales_invoice_list", {
      p_limit: 1000,
    });

    if (error) return getSalesInvoicesLegacy();

    return ((data as Array<{
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
      line_count: number;
    }> | null) ?? []).map((r) => ({
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
      line_count: Number(r.line_count),
    }));
  });
}

async function getSalesInvoicesLegacy(): Promise<SalesInvoiceRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sales_invoices")
    .select(
      "id, invoice_number, customer_id, customer_name, channel, invoice_date, due_date, subtotal, discount, shipping, marketplace_fee, tax, total, paid_amount, status, marketplace_order_id, notes, created_at, sales_invoice_lines(id)",
    )
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false })
    // Guardrail: ambil 1000 invoice terbaru. Mencegah fetch ribuan baris saat
    // data besar (laporan keuangan pakai query agregasi terpisah, tak terpengaruh).
    // TODO: ganti dengan server-side pagination + search saat volume tinggi.
    .limit(1000);
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
  size_label?: string | null;
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
      "id, brand, model, sku, size, size_label, color, barcode, hpp, sell_price, price_offline, quantity",
    )
    .eq("is_active", true)
    .order("brand")
    .order("model")
    .order("size");
  return (data as SalesProductPickerRow[] | null) ?? [];
}

export type PreOrderChannel =
  | "manual"
  | "wa"
  | "shopee"
  | "tiktok"
  | "tokopedia"
  | "offline"
  | "website"
  | "other";

export type PreOrderLineRow = {
  id: string;
  product_id: string | null;
  product_label: string;
  sku: string;
  product_name: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  size_label: string;
  size_value: number | null;
  requested_qty: number;
  reserved_qty: number;
  purchase_qty: number;
  ready_qty: number;
  shortage_qty: number;
  product_quantity: number;
  active_reserved_qty: number;
  other_reserved_qty: number;
  unit_price: number;
  estimated_cost: number;
  status: PreOrderStatus;
  notes: string | null;
  procurement_po_numbers: string[];
};

export type PreOrderRow = {
  id: string;
  source: PreOrderSource;
  channel: PreOrderChannel;
  marketplace_order_id: string | null;
  customer_id: string | null;
  customer_name: string;
  order_date: string;
  deadline_date: string | null;
  status: PreOrderStatus;
  computed_status: PreOrderStatus;
  marketplace_status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  total_qty: number;
  ready_qty: number;
  shortage_qty: number;
  total_amount: number;
  line_count: number;
  lines: PreOrderLineRow[];
};

type RawPreOrderLine = {
  id: string;
  product_id: string | null;
  sku: string | null;
  product_name: string | null;
  brand: string | null;
  model: string | null;
  color: string | null;
  size_label: string | null;
  size_value: number | null;
  requested_qty: number;
  reserved_qty: number | null;
  purchase_qty: number | null;
  unit_price: number | null;
  estimated_cost: number | null;
  status: PreOrderStatus;
  notes: string | null;
  products: {
    id: string;
    brand: string;
    model: string;
    sku: string;
    size: number | null;
    size_label: string | null;
    color: string;
    quantity: number;
    hpp: number;
    sell_price: number;
    price_offline: number | null;
  } | null;
  stock_reservations:
    | Array<{ id: string; quantity: number; status: string }>
    | null;
  pre_order_procurement_links:
    | Array<{
        quantity: number;
        purchase_orders: { po_number: string; status: string } | null;
        purchase_order_lines:
          | { ordered_qty: number; received_qty: number | null }
          | null;
      }>
    | null;
};

type RawPreOrder = {
  id: string;
  source: PreOrderSource;
  channel: PreOrderChannel | null;
  marketplace_order_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  order_date: string;
  deadline_date: string | null;
  status: PreOrderStatus;
  marketplace_status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  customers: { name: string } | null;
  pre_order_lines: RawPreOrderLine[] | null;
};

function computeLineStatus(
  dbStatus: PreOrderStatus,
  productId: string | null,
  requestedQty: number,
  readyQty: number,
  procurementQty: number,
): PreOrderStatus {
  if (dbStatus === "cancelled" || dbStatus === "packed") return dbStatus;
  if (!productId) return "review";
  if (requestedQty <= readyQty) return "ready_from_stock";
  if (procurementQty > 0) return "purchase_created";
  return "needs_purchase";
}

function summarizePreOrderStatus(
  dbStatus: PreOrderStatus,
  lines: PreOrderLineRow[],
): PreOrderStatus {
  if (dbStatus === "cancelled" || dbStatus === "packed") return dbStatus;
  if (lines.length === 0) return "review";
  if (lines.some((l) => l.status === "review")) return "review";
  if (lines.some((l) => l.status === "needs_purchase")) return "needs_purchase";
  if (lines.some((l) => l.status === "purchase_created")) return "purchase_created";
  if (lines.every((l) => l.status === "ready_from_stock")) return "ready_from_stock";
  return dbStatus;
}

export async function getPreOrders(): Promise<PreOrderRow[]> {
  const supabase = await createClient();
  const { data } = await (supabase as any)
    .from("pre_orders")
    .select(`
      id, source, channel, marketplace_order_id, customer_id, customer_name,
      order_date, deadline_date, status, marketplace_status, notes, created_at, updated_at,
      customers:customer_id(name),
      pre_order_lines(
        id, product_id, sku, product_name, brand, model, color, size_label, size_value,
        requested_qty, reserved_qty, purchase_qty, unit_price, estimated_cost, status, notes,
        products:product_id(id, brand, model, sku, size, size_label, color, quantity, hpp, sell_price, price_offline),
        stock_reservations(id, quantity, status),
        pre_order_procurement_links(
          quantity,
          purchase_orders:purchase_order_id(po_number, status),
          purchase_order_lines:purchase_order_line_id(ordered_qty, received_qty)
        )
      )
    `)
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);

  const rows = (data as RawPreOrder[] | null) ?? [];
  const productIds = Array.from(
    new Set(
      rows.flatMap((row) =>
        (row.pre_order_lines ?? [])
          .map((line) => line.product_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ),
  );

  const reservedByProduct = new Map<string, number>();
  if (productIds.length > 0) {
    const { data: reservations } = await (supabase as any)
      .from("stock_reservations")
      .select("product_id, quantity, status")
      .in("product_id", productIds)
      .eq("status", "active");

    for (const r of (reservations as Array<{
      product_id: string | null;
      quantity: number | null;
    }> | null) ?? []) {
      if (!r.product_id) continue;
      reservedByProduct.set(
        r.product_id,
        (reservedByProduct.get(r.product_id) ?? 0) + Number(r.quantity ?? 0),
      );
    }
  }

  return rows.map((row) => {
    const lines = (row.pre_order_lines ?? []).map((line) => {
      const product = line.products;
      const requestedQty = Number(line.requested_qty ?? 0);
      const activeReservedQty = (line.stock_reservations ?? [])
        .filter((r) => r.status === "active")
        .reduce((sum, r) => sum + Number(r.quantity ?? 0), 0);
      const productQuantity = Number(product?.quantity ?? 0);
      const allReservedForProduct =
        line.product_id ? reservedByProduct.get(line.product_id) ?? 0 : 0;
      const otherReservedQty = Math.max(0, allReservedForProduct - activeReservedQty);
      const availableForLine =
        line.product_id == null
          ? 0
          : Math.max(0, productQuantity - otherReservedQty);
      const procurementQty = (line.pre_order_procurement_links ?? []).reduce(
        (sum, link) => sum + Number(link.quantity ?? 0),
        0,
      );
      const readyQty = Math.min(requestedQty, availableForLine);
      const shortageQty = Math.max(0, requestedQty - readyQty);
      const sizeLabel =
        line.size_label ??
        product?.size_label ??
        (product?.size != null ? String(Number(product.size)) : "-");
      const productLabel = product
        ? `${product.brand} ${product.model} ${product.color} • Size ${sizeLabel} • ${product.sku}`
        : `${line.product_name ?? "Produk manual"} • Size ${sizeLabel} • ${line.sku ?? "-"}`;
      const status = computeLineStatus(
        line.status,
        line.product_id,
        requestedQty,
        readyQty,
        procurementQty,
      );

      return {
        id: line.id,
        product_id: line.product_id,
        product_label: productLabel,
        sku: line.sku ?? product?.sku ?? "-",
        product_name: line.product_name ?? productLabel,
        brand: line.brand ?? product?.brand ?? null,
        model: line.model ?? product?.model ?? null,
        color: line.color ?? product?.color ?? null,
        size_label: sizeLabel,
        size_value: line.size_value != null ? Number(line.size_value) : null,
        requested_qty: requestedQty,
        reserved_qty: Number(line.reserved_qty ?? activeReservedQty),
        purchase_qty: Number(line.purchase_qty ?? procurementQty),
        ready_qty: readyQty,
        shortage_qty: shortageQty,
        product_quantity: productQuantity,
        active_reserved_qty: activeReservedQty,
        other_reserved_qty: otherReservedQty,
        unit_price: Number(line.unit_price ?? 0),
        estimated_cost: Number(line.estimated_cost ?? product?.hpp ?? 0),
        status,
        notes: line.notes,
        procurement_po_numbers: Array.from(
          new Set(
            (line.pre_order_procurement_links ?? [])
              .map((link) => link.purchase_orders?.po_number)
              .filter((po): po is string => Boolean(po)),
          ),
        ),
      };
    });

    const totalQty = lines.reduce((sum, line) => sum + line.requested_qty, 0);
    const readyQty = lines.reduce((sum, line) => sum + line.ready_qty, 0);
    const shortageQty = lines.reduce((sum, line) => sum + line.shortage_qty, 0);
    const totalAmount = lines.reduce(
      (sum, line) => sum + line.requested_qty * line.unit_price,
      0,
    );

    return {
      id: row.id,
      source: row.source,
      channel: row.channel ?? "manual",
      marketplace_order_id: row.marketplace_order_id,
      customer_id: row.customer_id,
      customer_name: row.customer_name ?? row.customers?.name ?? "Customer",
      order_date: row.order_date,
      deadline_date: row.deadline_date,
      status: row.status,
      computed_status: summarizePreOrderStatus(row.status, lines),
      marketplace_status: row.marketplace_status,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      total_qty: totalQty,
      ready_qty: readyQty,
      shortage_qty: shortageQty,
      total_amount: totalAmount,
      line_count: lines.length,
      lines,
    };
  });
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
  counterpart_account_id: string | null;
  counterpart_account_code: string | null;
  counterpart_account_name: string | null;
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
      "id, bank_account_id, counterpart_account_id, transaction_date, type, amount, balance_after, reference_no, description, related_entity_type, related_entity_id, is_reconciled, created_at, bank_accounts:bank_account_id(name), counterpart:counterpart_account_id(code, name)",
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
      counterpart_account_id: string | null;
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
      counterpart: { code: string; name: string } | null;
    }> | null) ?? []
  ).map((r) => ({
    id: r.id,
    bank_account_id: r.bank_account_id,
    bank_account_name: r.bank_accounts?.name ?? "—",
    counterpart_account_id: r.counterpart_account_id,
    counterpart_account_code: r.counterpart?.code ?? null,
    counterpart_account_name: r.counterpart?.name ?? null,
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

export type PosSaleRow = {
  id: string;
  invoice_number: string;
  customer_name: string;
  invoice_date: string;
  total: number;
  status: "draft" | "issued" | "partial" | "paid" | "cancelled";
  line_count: number;
  payment_number: string | null;
  bank_account_name: string | null;
};

export async function getRecentPosSales(limit = 20): Promise<PosSaleRow[]> {
  const supabase = await createClient();
  const { data: txs } = await supabase
    .from("bank_transactions")
    .select("related_entity_id, bank_accounts:bank_account_id(name)")
    .eq("related_entity_type", "pos_checkout")
    .not("related_entity_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  const transactionRows =
    (txs as Array<{
      related_entity_id: string | null;
      bank_accounts: { name: string } | null;
    }> | null) ?? [];
  const ids = transactionRows
    .map((tx) => tx.related_entity_id)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];

  const bankByInvoice = new Map(
    transactionRows
      .filter(
        (
          tx,
        ): tx is {
          related_entity_id: string;
          bank_accounts: { name: string } | null;
        } => Boolean(tx.related_entity_id),
      )
      .map((tx) => [tx.related_entity_id, tx.bank_accounts?.name ?? null]),
  );
  const order = new Map(ids.map((id, index) => [id, index]));

  const { data } = await supabase
    .from("sales_invoices")
    .select(
      "id, invoice_number, customer_name, invoice_date, total, status, sales_invoice_lines(id), customer_payment_allocations(amount, customer_payments:payment_id(payment_number))",
    )
    .in("id", ids);

  return (
    (data as unknown as Array<{
      id: string;
      invoice_number: string;
      customer_name: string;
      invoice_date: string;
      total: number;
      status: PosSaleRow["status"];
      sales_invoice_lines: Array<{ id: string }> | null;
      customer_payment_allocations:
        | Array<{
            amount: number;
            customer_payments: { payment_number: string } | null;
          }>
        | null;
    }> | null) ?? []
  )
    .sort((a, b) => (order.get(a.id) ?? 9999) - (order.get(b.id) ?? 9999))
    .map((row) => ({
      id: row.id,
      invoice_number: row.invoice_number,
      customer_name: row.customer_name,
      invoice_date: row.invoice_date,
      total: Number(row.total),
      status: row.status,
      line_count: row.sales_invoice_lines?.length ?? 0,
      payment_number:
        row.customer_payment_allocations?.[0]?.customer_payments
          ?.payment_number ?? null,
      bank_account_name: bankByInvoice.get(row.id) ?? null,
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

export type PurchaseReceiptLineRow = {
  id: string;
  po_line_id: string;
  product_id: string;
  product_label: string;
  quantity: number;
  unit_cost: number;
  stock_movement_id: string;
};

export type PurchaseReceiptRow = {
  id: string;
  receipt_number: string;
  po_id: string;
  po_number: string;
  supplier_name: string;
  receipt_date: string;
  notes: string | null;
  created_by_name: string | null;
  created_at: string;
  total_quantity: number;
  total_value: number;
  lines: PurchaseReceiptLineRow[];
};

export type TransactionDeleteResult = {
  deleted: boolean;
  reference_number: string;
  blocker_stage: string | null;
  blocker_numbers: string[];
};

export async function getPurchaseReceipts(): Promise<PurchaseReceiptRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("purchase_receipts")
    .select(`
      id, receipt_number, po_id, receipt_date, notes, created_at,
      purchase_orders:po_id(
        po_number,
        suppliers:supplier_id(name)
      ),
      profiles:created_by(full_name),
      purchase_receipt_lines(
        id, po_line_id, product_id, stock_movement_id, quantity, unit_cost,
        products:product_id(brand, model, color, size_label, sku)
      )
    `)
    .order("receipt_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);

  return ((data ?? []) as unknown as Array<{
    id: string;
    receipt_number: string;
    po_id: string;
    receipt_date: string;
    notes: string | null;
    created_at: string;
    purchase_orders: {
      po_number: string;
      suppliers: { name: string } | null;
    } | null;
    profiles: { full_name: string } | null;
    purchase_receipt_lines: Array<{
      id: string;
      po_line_id: string;
      product_id: string;
      stock_movement_id: string;
      quantity: number;
      unit_cost: number;
      products: {
        brand: string;
        model: string;
        color: string | null;
        size_label: string;
        sku: string;
      } | null;
    }> | null;
  }>).map((row) => {
    const lines = (row.purchase_receipt_lines ?? []).map((line) => ({
      id: line.id,
      po_line_id: line.po_line_id,
      product_id: line.product_id,
      stock_movement_id: line.stock_movement_id,
      product_label: line.products
        ? `${line.products.brand} ${line.products.model}${line.products.color ? ` ${line.products.color}` : ""} - Size ${line.products.size_label} - ${line.products.sku}`
        : "Produk tidak ditemukan",
      quantity: Number(line.quantity),
      unit_cost: Number(line.unit_cost),
    }));
    return {
      id: row.id,
      receipt_number: row.receipt_number,
      po_id: row.po_id,
      po_number: row.purchase_orders?.po_number ?? "-",
      supplier_name: row.purchase_orders?.suppliers?.name ?? "-",
      receipt_date: row.receipt_date,
      notes: row.notes,
      created_by_name: row.profiles?.full_name ?? null,
      created_at: row.created_at,
      total_quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
      total_value: lines.reduce(
        (sum, line) => sum + line.quantity * line.unit_cost,
        0,
      ),
      lines,
    };
  });
}

export async function getPurchaseOrdersForReceiving(): Promise<
  ReceivablePoRow[]
> {
  return measureServer("query.purchaseOrdersForReceiving", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_receivable_purchase_orders");

    if (error) return getPurchaseOrdersForReceivingLegacy();

    return ((data as Array<{
      id: string;
      po_number: string;
      supplier_name: string;
      order_date: string;
      expected_date: string | null;
      status: ReceivablePoRow["status"];
      total: number;
      total_ordered: number;
      total_received: number;
      total_remaining: number;
    }> | null) ?? []).map((r) => ({
      id: r.id,
      po_number: r.po_number,
      supplier_name: r.supplier_name,
      order_date: r.order_date,
      expected_date: r.expected_date,
      status: r.status,
      total: Number(r.total),
      total_ordered: Number(r.total_ordered),
      total_received: Number(r.total_received),
      total_remaining: Number(r.total_remaining),
    }));
  });
}

async function getPurchaseOrdersForReceivingLegacy(): Promise<
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
  return measureServer("query.accountBalances", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_account_balances", {
      p_from: opts?.from ?? null,
      p_to: opts?.to ?? null,
    });

    if (error) return getAccountBalancesLegacy(opts);

    return ((data as Array<{
      account_id: string;
      code: string;
      name: string;
      type: AccountBalance["type"];
      normal_balance: AccountBalance["normal_balance"];
      parent_id: string | null;
      total_debit: number;
      total_credit: number;
      balance: number;
    }> | null) ?? []).map((row) => ({
      account_id: row.account_id,
      code: row.code,
      name: row.name,
      type: row.type,
      normal_balance: row.normal_balance,
      parent_id: row.parent_id,
      total_debit: Number(row.total_debit),
      total_credit: Number(row.total_credit),
      balance: Number(row.balance),
    }));
  });
}

async function getAccountBalancesLegacy(opts?: {
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
  return measureServer("query.accountLedger", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_account_ledger", {
      p_account_id: args.account_id,
      p_from: args.from ?? null,
      p_to: args.to ?? null,
    });

    if (error) return getAccountLedgerLegacy(args);

    type LedgerRpcRow = {
      account_id: string;
      account_code: string;
      account_name: string;
      account_type: AccountBalance["type"];
      account_normal_balance: AccountBalance["normal_balance"];
      account_parent_id: string | null;
      account_is_active: boolean;
      account_is_system: boolean;
      account_description: string | null;
      opening_balance: number;
      closing_balance: number;
      total_debit: number;
      total_credit: number;
      line_id: string | null;
      entry_id: string | null;
      entry_number: string | null;
      entry_date: string | null;
      description: string | null;
      source_type: string | null;
      source_id: string | null;
      status: AccountLedgerEntry["status"] | null;
      debit: number | null;
      credit: number | null;
      line_description: string | null;
      running_balance: number | null;
    };

    const rows = ((data as LedgerRpcRow[] | null) ?? []);
    const first = rows[0];
    if (!first) {
      return {
        account: null,
        opening_balance: 0,
        closing_balance: 0,
        total_debit: 0,
        total_credit: 0,
        entries: [],
      };
    }

    return {
      account: {
        id: first.account_id,
        code: first.account_code,
        name: first.account_name,
        type: first.account_type,
        normal_balance: first.account_normal_balance,
        parent_id: first.account_parent_id,
        is_active: first.account_is_active,
        is_system: first.account_is_system,
        description: first.account_description,
      },
      opening_balance: Number(first.opening_balance),
      closing_balance: Number(first.closing_balance),
      total_debit: Number(first.total_debit),
      total_credit: Number(first.total_credit),
      entries: rows
        .filter((r) => r.line_id && r.entry_id && r.entry_number && r.entry_date && r.status)
        .map((r) => ({
          line_id: r.line_id!,
          entry_id: r.entry_id!,
          entry_number: r.entry_number!,
          entry_date: r.entry_date!,
          description: r.description ?? "",
          source_type: r.source_type ?? "manual",
          source_id: r.source_id,
          status: r.status!,
          debit: Number(r.debit ?? 0),
          credit: Number(r.credit ?? 0),
          line_description: r.line_description,
          running_balance: Number(r.running_balance ?? 0),
        })),
    };
  });
}

async function getAccountLedgerLegacy(args: {
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
    prevQuery ?? Promise.resolve({ data: null as null | { products: { brand: string; model: string } | null }[] }),
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
export type GeneralLedgerReportRow = {
  account_code: string;
  account_name: string;
  account_type: AccountBalance["type"];
  entry_date: string;
  entry_number: string;
  entry_description: string;
  line_description: string | null;
  source_type: string;
  debit: number;
  credit: number;
  opening_balance: number;
  running_balance: number;
};

export async function getGeneralLedgerReport(
  from?: string,
  to?: string,
): Promise<GeneralLedgerReportRow[]> {
  const fromDate = from?.slice(0, 10);
  const toDate = to?.slice(0, 10);
  const openingTo = fromDate
    ? new Date(`${fromDate}T00:00:00.000Z`)
    : null;
  if (openingTo) openingTo.setUTCDate(openingTo.getUTCDate() - 1);

  const [entries, openingBalances] = await Promise.all([
    getJournalEntries({ from: fromDate, to: toDate, limit: 5000 }),
    getAccountBalances({
      to: openingTo ? openingTo.toISOString().slice(0, 10) : undefined,
    }),
  ]);
  const accountMap = new Map(
    openingBalances.map((account) => [account.account_id, account]),
  );
  const running = new Map(
    openingBalances.map((account) => [account.account_id, account.balance]),
  );

  const flattened = entries
    .filter((entry) => entry.status === "posted")
    .flatMap((entry) =>
      entry.lines.map((line) => ({ entry, line })),
    )
    .sort(
      (a, b) =>
        a.line.account_code.localeCompare(b.line.account_code) ||
        a.entry.entry_date.localeCompare(b.entry.entry_date) ||
        a.entry.entry_number.localeCompare(b.entry.entry_number),
    );

  return flattened.map(({ entry, line }) => {
    const account = accountMap.get(line.account_id);
    const opening = account?.balance ?? 0;
    const previous = running.get(line.account_id) ?? opening;
    const delta =
      account?.normal_balance === "credit"
        ? line.credit - line.debit
        : line.debit - line.credit;
    const next = previous + delta;
    running.set(line.account_id, next);
    return {
      account_code: line.account_code,
      account_name: line.account_name,
      account_type: account?.type ?? "asset",
      entry_date: entry.entry_date,
      entry_number: entry.entry_number,
      entry_description: entry.description,
      line_description: line.description,
      source_type: entry.source_type,
      debit: line.debit,
      credit: line.credit,
      opening_balance: opening,
      running_balance: next,
    };
  });
}

export type JournalReportRow = {
  entry_number: string;
  entry_date: string;
  description: string;
  source_type: string;
  total_debit: number;
  total_credit: number;
  status: string;
  line_count: number;
};

export async function getJournalReport(
  from?: string,
  to?: string,
): Promise<JournalReportRow[]> {
  await requireOwnerOrFinance();
  const supabase = await createClient();
  let query = supabase
    .from("journal_entries")
    .select("entry_number, entry_date, description, source_type, total_debit, total_credit, status, journal_lines(id)")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (from) query = query.gte("entry_date", from.slice(0, 10));
  if (to) query = query.lte("entry_date", to.slice(0, 10));
  const { data } = await query;
  return ((data as unknown as Array<{
    entry_number: string;
    entry_date: string;
    description: string;
    source_type: string;
    total_debit: number;
    total_credit: number;
    status: string;
    journal_lines: Array<{ id: string }> | null;
  }> | null) ?? []).map((row) => ({
    entry_number: row.entry_number,
    entry_date: row.entry_date,
    description: row.description,
    source_type: row.source_type,
    total_debit: Number(row.total_debit),
    total_credit: Number(row.total_credit),
    status: row.status,
    line_count: row.journal_lines?.length ?? 0,
  }));
}

export type SalesReportRow = {
  invoice_number: string;
  customer_name: string;
  channel: string;
  invoice_date: string;
  total: number;
  paid_amount: number;
  remaining: number;
  status: string;
  line_count: number;
};

export async function getSalesReport(
  from?: string,
  to?: string,
): Promise<SalesReportRow[]> {
  await requireOwnerOrFinance();
  const supabase = await createClient();
  let query = supabase
    .from("sales_invoices")
    .select("invoice_number, customer_name, channel, invoice_date, total, paid_amount, status, sales_invoice_lines(id)")
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (from) query = query.gte("invoice_date", from.slice(0, 10));
  if (to) query = query.lte("invoice_date", to.slice(0, 10));
  const { data } = await query;
  return ((data as unknown as Array<{
    invoice_number: string;
    customer_name: string;
    channel: string;
    invoice_date: string;
    total: number;
    paid_amount: number;
    status: string;
    sales_invoice_lines: Array<{ id: string }> | null;
  }> | null) ?? []).map((row) => ({
    invoice_number: row.invoice_number,
    customer_name: row.customer_name,
    channel: row.channel,
    invoice_date: row.invoice_date,
    total: Number(row.total),
    paid_amount: Number(row.paid_amount),
    remaining: Number(row.total) - Number(row.paid_amount),
    status: row.status,
    line_count: row.sales_invoice_lines?.length ?? 0,
  }));
}

export type StockMovementReportRow = {
  product_id: string;
  movement_date: string;
  product_label: string;
  sku: string;
  type: string;
  qty_in: number;
  qty_out: number;
  adjustment: number;
  unit_cost: number;
  reference_type: string | null;
  opening_balance: number;
  running_balance: number;
  closing_balance: number;
};

export async function getStockMovementReport(
  from?: string,
  to?: string,
): Promise<StockMovementReportRow[]> {
  await requireOwnerOrFinance();
  const supabase = await createClient();
  const fromIso = from ?? "0001-01-01T00:00:00.000Z";
  const toIso = to ?? new Date().toISOString();
  const [{ data: products }, { data: movements }] = await Promise.all([
    supabase
      .from("products")
      .select("id, brand, model, color, size, sku, quantity")
      .eq("is_active", true)
      .order("brand")
      .order("model")
      .limit(500),
    supabase
    .from("stock_movements")
      .select("product_id, created_at, type, quantity, unit_cost, reference_type")
      .gte("created_at", fromIso)
      .order("created_at", { ascending: true })
      .limit(5000),
  ]);

  type Product = {
    id: string;
    brand: string;
    model: string;
    color: string | null;
    size: number | null;
    sku: string;
    quantity: number;
  };
  type Movement = {
    product_id: string;
    created_at: string;
    type: string;
    quantity: number;
    unit_cost: number;
    reference_type: string | null;
  };
  const delta = (movement: Movement) => {
    const quantity = Number(movement.quantity ?? 0);
    if (["inbound", "return_in"].includes(movement.type)) return quantity;
    if (["outbound", "return_out"].includes(movement.type)) return -quantity;
    return quantity;
  };

  return ((products as Product[] | null) ?? []).flatMap((product) => {
    const allSinceFrom = ((movements as Movement[] | null) ?? []).filter(
      (movement) => movement.product_id === product.id,
    );
    const opening =
      Number(product.quantity ?? 0) -
      allSinceFrom.reduce((sum, movement) => sum + delta(movement), 0);
    const periodMovements = allSinceFrom.filter(
      (movement) => movement.created_at <= toIso,
    );
    const closing =
      opening + periodMovements.reduce((sum, movement) => sum + delta(movement), 0);
    const productLabel = `${product.brand} ${product.model}${
      product.color ? ` ${product.color}` : ""
    } • Size ${product.size ?? "-"}`;
    let running = opening;

    if (periodMovements.length === 0) {
      return [{
        product_id: product.id,
        movement_date: fromIso,
        product_label: productLabel,
        sku: product.sku,
        type: "saldo_periode",
        qty_in: 0,
        qty_out: 0,
        adjustment: 0,
        unit_cost: 0,
        reference_type: null,
        opening_balance: opening,
        running_balance: opening,
        closing_balance: closing,
      }];
    }

    return periodMovements.map((movement) => {
      const quantity = Number(movement.quantity ?? 0);
      const inbound = ["inbound", "return_in"].includes(movement.type);
      const outbound = ["outbound", "return_out"].includes(movement.type);
      running += delta(movement);
      return {
        product_id: product.id,
        movement_date: movement.created_at,
        product_label: productLabel,
        sku: product.sku,
        type: movement.type,
        qty_in: inbound ? quantity : 0,
        qty_out: outbound ? quantity : 0,
        adjustment: !inbound && !outbound ? quantity : 0,
        unit_cost: Number(movement.unit_cost ?? 0),
        reference_type: movement.reference_type,
        opening_balance: opening,
        running_balance: running,
        closing_balance: closing,
      };
    });
  }) as StockMovementReportRow[];
}

export type ArApReportRow = {
  type: "Piutang" | "Utang";
  party_name: string;
  document_number: string;
  document_date: string;
  due_date: string | null;
  total: number;
  paid_amount: number;
  remaining: number;
  status: string;
};

export async function getArApReport(
  from?: string,
  to?: string,
): Promise<ArApReportRow[]> {
  await requireOwnerOrFinance();
  const [ar, ap] = await Promise.all([
    getOutstandingSalesInvoices(),
    getOutstandingPurchaseInvoices(),
  ]);
  return [
    ...ar.map((row) => ({
      type: "Piutang" as const,
      party_name: row.customer_name,
      document_number: row.invoice_number,
      document_date: row.invoice_date,
      due_date: row.due_date,
      total: row.total,
      paid_amount: row.paid_amount,
      remaining: row.remaining,
      status: "outstanding",
    })),
    ...ap.map((row) => ({
      type: "Utang" as const,
      party_name: row.supplier_name,
      document_number: row.invoice_number,
      document_date: row.invoice_date,
      due_date: row.due_date,
      total: row.total,
      paid_amount: row.paid_amount,
      remaining: row.remaining,
      status: "outstanding",
    })),
  ]
    .filter((row) => {
      const date = row.document_date;
      return (!from || date >= from.slice(0, 10)) && (!to || date <= to.slice(0, 10));
    })
    .sort((a, b) => b.remaining - a.remaining);
}

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

export async function getMonthlyProfitTrend(monthCount = 6): Promise<
  { month: string; revenue: number; profit: number }[]
> {
  return measureServer("query.monthlyProfitTrend", async () => {
    await requireOwnerOrFinance();
    const supabase = await createClient();
    const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    const now = nowWIB();
    const monthStarts: { year: number; month: number; label: string; key: string }[] = [];

    for (let i = monthCount - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth();
      monthStarts.push({
        year,
        month,
        label: months[month]!,
        key: `${year}-${String(month + 1).padStart(2, "0")}`,
      });
    }

    const first = monthStarts[0];
    const last = monthStarts[monthStarts.length - 1];
    if (!first || !last) return [];

    const { data } = await supabase
      .from("packing_items")
      .select("sell_price, unit_hpp, packing_sessions!inner(status, completed_at)")
      .eq("packing_sessions.status", "completed")
      .not("packing_sessions.completed_at", "is", null)
      .gte("packing_sessions.completed_at", wibStartOfMonth(first.year, first.month))
      .lt("packing_sessions.completed_at", wibStartOfNextMonth(last.year, last.month));

    const byMonth = new Map<string, { revenue: number; cost: number }>();

    for (const row of (data ?? []) as {
      sell_price: number | null;
      unit_hpp: number | null;
      packing_sessions: MaybeRelation<{ completed_at: string | null }>;
    }[]) {
      const session = firstRelation(row.packing_sessions);
      if (!session?.completed_at) continue;
      const key = `${getWIBYear(session.completed_at)}-${String(getWIBMonth(session.completed_at) + 1).padStart(2, "0")}`;
      const current = byMonth.get(key) ?? { revenue: 0, cost: 0 };
      current.revenue += Number(row.sell_price ?? 0);
      current.cost += Number(row.unit_hpp ?? 0);
      byMonth.set(key, current);
    }

    return monthStarts.map(({ key, label }) => {
      const current = byMonth.get(key) ?? { revenue: 0, cost: 0 };
      return {
        month: label,
        revenue: current.revenue,
        profit: current.revenue - current.cost,
      };
    });
  });
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

  for (const item of data as unknown as { products: MaybeRelation<{ brand: string; model: string }>; sell_price: number | null; unit_hpp: number | null }[]) {
    const p = firstRelation(item.products);
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
  actual_marketplace_fee: number;
  estimated_marketplace_fee: number;
  fee_source: "settlement_actual" | "order_estimate" | "mixed" | "none";
  discount: number;
  shipping: number;
  net_sales: number;
};

function emptyMarketplaceCostRow(channel: string): MarketplaceCostReportRow {
  return {
    channel,
    orders: 0,
    gmv: 0,
    marketplace_fee: 0,
    actual_marketplace_fee: 0,
    estimated_marketplace_fee: 0,
    fee_source: "none",
    discount: 0,
    shipping: 0,
    net_sales: 0,
  };
}

export async function getMarketplaceCostReport(
  from?: string,
  to?: string,
): Promise<MarketplaceCostReportRow[]> {
  await requireOwnerOrFinance();
  const supabase = await createClient();
  let query = supabase
    .from("sales_invoices")
    .select("channel, invoice_date, subtotal, discount, shipping, marketplace_fee, settlement_fee_actual, total, status, settlement_status")
    .in("channel", ["shopee", "tiktok", "tokopedia"])
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
    settlement_fee_actual: number | null;
    total: number;
    settlement_status: string | null;
  }>) {
    const current = map.get(row.channel) ?? emptyMarketplaceCostRow(row.channel);
    current.orders += 1;
    current.gmv += Number(row.subtotal ?? 0);
    if (row.settlement_status !== "released") {
      current.estimated_marketplace_fee += Number(row.marketplace_fee ?? 0);
    } else if (row.settlement_fee_actual != null) {
      current.actual_marketplace_fee += Number(row.settlement_fee_actual ?? 0);
    } else {
      current.estimated_marketplace_fee += Number(row.marketplace_fee ?? 0);
    }
    current.discount += Number(row.discount ?? 0);
    current.shipping += Number(row.shipping ?? 0);
    current.net_sales += Number(row.total ?? 0);
    map.set(row.channel, current);
  }

  return Array.from(map.values())
    .map((row) => {
      row.marketplace_fee = row.actual_marketplace_fee + row.estimated_marketplace_fee;
      row.fee_source =
        row.actual_marketplace_fee > 0 && row.estimated_marketplace_fee > 0
          ? "mixed"
          : row.actual_marketplace_fee > 0
            ? "settlement_actual"
            : row.estimated_marketplace_fee > 0
              ? "order_estimate"
              : "none";
      return row;
    })
    .sort((a, b) => b.net_sales - a.net_sales);
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
    .select("id, channel, invoice_date, total, discount, marketplace_fee, settlement_fee_actual, status, settlement_status, sales_invoice_lines(qty, unit_cost)")
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
    settlement_fee_actual: number | null;
    settlement_status: string | null;
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
    if (row.settlement_status === "released" && row.settlement_fee_actual != null) {
      current.marketplace_fee += Number(row.settlement_fee_actual ?? 0);
    } else {
      current.marketplace_fee += Number(row.marketplace_fee ?? 0);
    }
    current.discount += Number(row.discount ?? 0);
    map.set(row.channel, current);
  }

  return Array.from(map.values())
    .map((row) => {
      row.profit = row.revenue - row.cogs - row.marketplace_fee;
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
  opening_qty: number;
  closing_qty: number;
  current_qty: number;
  last_movement_at: string | null;
};

export async function getStockCardReport(
  from?: string,
  to?: string,
): Promise<StockCardRow[]> {
  const movements = await getStockMovementReport(from, to);
  const byProduct = new Map<string, StockCardRow>();
  for (const movement of movements) {
    const current = byProduct.get(movement.product_id) ?? {
      product_id: movement.product_id,
      product_label: movement.product_label,
      sku: movement.sku,
      barcode: "",
      inbound: 0,
      outbound: 0,
      adjustment: 0,
      opening_qty: movement.opening_balance,
      closing_qty: movement.closing_balance,
      current_qty: movement.closing_balance,
      last_movement_at: null,
    };
    current.inbound += movement.qty_in;
    current.outbound += movement.qty_out;
    current.adjustment += movement.adjustment;
    current.closing_qty = movement.closing_balance;
    current.current_qty = movement.closing_balance;
    if (movement.type !== "saldo_periode") {
      current.last_movement_at = movement.movement_date;
    }
    byProduct.set(movement.product_id, current);
  }
  return [...byProduct.values()].sort((a, b) =>
    a.product_label.localeCompare(b.product_label),
  );
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
