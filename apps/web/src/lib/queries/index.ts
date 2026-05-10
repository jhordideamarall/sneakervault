import { createClient } from "@sneakervault/supabase/server";
import { getCurrentUser } from "@/lib/actions/auth";

async function requireOwner() {
  const profile = await getCurrentUser();
  if (!profile || !profile.roles?.includes("owner")) throw new Error("Unauthorized");
  return profile;
}

// ─── Inventory ─────────────────────────────────────────────
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
    .select("*, suppliers:default_supplier_id(name)", { count: "exact" })
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);

  if (filters?.brand) query = query.eq("brand", filters.brand);
  if (filters?.model) query = query.ilike("model", `%${filters.model}%`);
  if (filters?.search) query = query.or(`brand.ilike.%${filters.search}%,model.ilike.%${filters.search}%,sku.ilike.%${filters.search}%,barcode.ilike.%${filters.search}%`);

  const { data, count, error } = await query;
  return { data: data ?? [], total: count ?? 0, error };
}

export async function getProductByBarcode(barcode: string): Promise<unknown> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("barcode", barcode)
    .maybeSingle();
  return data;
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
  const today = new Date().toISOString().split("T")[0];

  let query = supabase
    .from("packing_sessions")
    .select("*, packing_items(count)")
    .gte("created_at", `${today}T00:00:00`)
    .order("created_at", { ascending: false });

  if (userId) query = query.eq("packed_by", userId);

  const { data } = await query;
  return data ?? [];
}

// ─── Dashboard (Owner) ─────────────────────────────────────
export async function getDashboardStats() {
  await requireOwner();
  const supabase = await createClient();

  const [stockRes, soldRes, returnsRes] = await Promise.all([
    supabase.from("products").select("quantity, hpp").eq("is_active", true),
    supabase.from("packing_items").select("sell_price, unit_hpp").gte("created_at", getMonthStart()),
    supabase.from("returns").select("id").eq("status", "pending"),
  ]);

  const products = stockRes.data ?? [];
  const totalItems = products.reduce((s, p) => s + p.quantity, 0);
  const totalValue = products.reduce((s, p) => s + p.quantity * p.hpp, 0);

  const soldItems = soldRes.data ?? [];
  const monthlyRevenue = soldItems.reduce((s, i) => s + (i.sell_price ?? 0), 0);
  const monthlyProfit = soldItems.reduce((s, i) => s + ((i.sell_price ?? 0) - (i.unit_hpp ?? 0)), 0);

  return {
    totalItems,
    totalValue,
    monthlyRevenue,
    monthlyProfit,
    pendingReturns: returnsRes.data?.length ?? 0,
  };
}

export async function getBestsellers(limit = 5) {
  await requireOwner();
  const supabase = await createClient();
  const { data } = await supabase
    .from("packing_items")
    .select("product_id, products(brand, model, size, image_url)")
    .gte("created_at", getMonthStart());

  if (!data) return [];

  // Group by brand+model (not per size)
  const counts: Record<string, { count: number; brand: string; model: string; image_url: string | null }> = {};
  for (const item of data) {
    const p = item.products as { brand: string; model: string; size: number; image_url: string | null } | null;
    if (!p) continue;
    const key = `${p.brand}::${p.model}`;
    if (!counts[key]) counts[key] = { count: 0, brand: p.brand, model: p.model, image_url: p.image_url };
    counts[key].count++;
  }

  return Object.entries(counts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([key, { count, brand, model, image_url }]) => ({ id: key, count, brand, model, image_url }));
}

// ─── Suppliers ─────────────────────────────────────────────
export async function getSuppliers() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("suppliers")
    .select("*")
    .eq("is_active", true)
    .order("name");
  return data ?? [];
}

// ─── Activity Logs ─────────────────────────────────────────
export async function getActivityLogs(filters?: {
  user_id?: string;
  action?: string;
  page?: number;
  limit?: number;
}) {
  await requireOwner();
  const supabase = await createClient();
  const page = filters?.page ?? 1;
  const limit = filters?.limit ?? 50;
  const from = (page - 1) * limit;

  let query = supabase
    .from("activity_logs")
    .select("*, profiles:user_id(full_name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);

  if (filters?.user_id) query = query.eq("user_id", filters.user_id);
  if (filters?.action) query = query.eq("action", filters.action);

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

// ─── Helpers ───────────────────────────────────────────────
function getMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export async function getMonthlySales() {
  await requireOwner();
  const supabase = await createClient();

  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();

  const { data } = await supabase
    .from("packing_items")
    .select("created_at, products(brand)")
    .gte("created_at", sixMonthsAgo);

  if (!data) return [];

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

  const getWeekLabel = (date: Date) => {
    const weekNum = Math.ceil(date.getDate() / 7);
    return `${monthNames[date.getMonth()]} W${weekNum}`;
  };

  // Group by week + brand
  const weeks: Record<string, { terjual: number; nike: number; adidas: number; nb: number }> = {};
  for (const item of data) {
    const date = new Date(item.created_at);
    const key = getWeekLabel(date);
    if (!weeks[key]) weeks[key] = { terjual: 0, nike: 0, adidas: 0, nb: 0 };
    weeks[key].terjual++;
    const brand = ((item.products as { brand: string } | null)?.brand ?? "").toLowerCase();
    if (brand.includes("nike")) weeks[key].nike++;
    else if (brand.includes("adidas")) weeks[key].adidas++;
    else if (brand.includes("new balance")) weeks[key].nb++;
  }

  // Build all weeks for last 6 months
  const result = [];
  for (let m = 5; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const totalWeeks = Math.ceil(daysInMonth / 7);
    for (let w = 1; w <= totalWeeks; w++) {
      const key = `${monthNames[d.getMonth()]} W${w}`;
      const entry = weeks[key] || { terjual: 0, nike: 0, adidas: 0, nb: 0 };
      result.push({ week: key, ...entry });
    }
  }
  return result;
}

// ─── Reports ───────────────────────────────────────────────
export async function getStockValue(): Promise<{ items: number; cost: number; retail: number }> {
  await requireOwner();
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
  await requireOwner();
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
