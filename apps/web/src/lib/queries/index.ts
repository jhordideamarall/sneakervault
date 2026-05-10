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
    .select("id, brand, model, sku, size, color, barcode, quantity, hpp, sell_price, image_url, is_active, created_at, suppliers:default_supplier_id(name)", { count: "exact" })
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
    .select("id, brand, model, sku, size, color, barcode, quantity, hpp, sell_price, image_url")
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
    supabase.from("packing_items").select("sell_price, unit_hpp, packing_sessions!inner(status)").in("packing_sessions.status", ["shipped", "completed", "has_return"]).gte("created_at", getMonthStart()),
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

export async function getBestsellers(limit?: number) {
  await requireOwner();
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

export async function getMonthlySales(selectedMonth?: string) {
  await requireOwner();
  const supabase = await createClient();

  let query = supabase
    .from("packing_items")
    .select("created_at, products(brand, model), packing_sessions!inner(status)")
    .in("packing_sessions.status", ["shipped", "completed", "has_return"]);

  if (selectedMonth) {
    const [year, month] = selectedMonth.split("-").map(Number);
    const start = new Date(year!, month! - 1, 1).toISOString();
    const end = new Date(year!, month!, 1).toISOString();
    query = query.gte("created_at", start).lt("created_at", end);
  }

  const { data } = await query;

  if (!data || data.length === 0) return { weeks: [], brands: [] as string[], models: [] as string[] };

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const allBrands = new Set<string>();
  const allModels = new Set<string>();

  if (selectedMonth) {
    // DAILY VIEW
    const [year, month] = selectedMonth.split("-").map(Number);
    const daysInMonth = new Date(year!, month!, 0).getDate();
    const dayData: Record<string, Record<string, number>> = {};

    for (const item of data) {
      const date = new Date(item.created_at);
      const day = date.getDate();
      if (!dayData[day]) dayData[day] = { terjual: 0 };
      dayData[day]!["terjual"]!++;

      const p = (item as unknown as { products: { brand: string; model: string } | null }).products;
      if (p) {
        allBrands.add(p.brand);
        allModels.add(p.model);
        dayData[day]![p.brand] = (dayData[day]![p.brand] || 0) + 1;
        dayData[day]![p.model] = (dayData[day]![p.model] || 0) + 1;
      }
    }

    const brands = Array.from(allBrands).sort();
    const models = Array.from(allModels).sort();
    const result = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const entry = dayData[d] || {};
      const row: Record<string, number | string> = { week: `Tgl ${d}`, terjual: entry.terjual || 0 };
      brands.forEach(b => { row[b] = entry[b] || 0; });
      models.forEach(m => { row[m] = entry[m] || 0; });
      result.push(row);
    }
    return { weeks: result, brands, models };
  } else {
    // ALL-TIME WEEKLY VIEW (Existing Logic)
    const getWeekKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${Math.ceil(date.getDate() / 7)}`;
    const getWeekLabel = (date: Date) => `${monthNames[date.getMonth()]} W${Math.ceil(date.getDate() / 7)}`;

    const weeks: Record<string, Record<string, number>> = {};

    for (const item of data) {
      const date = new Date(item.created_at);
      const key = getWeekKey(date);
      if (!weeks[key]) weeks[key] = { terjual: 0 };
      const w = weeks[key]!;
      w["terjual"] = ((w["terjual"] as number) || 0) + 1;
      
      const p = (item as unknown as { products: { brand: string; model: string } | null }).products;
      if (p) {
        allBrands.add(p.brand);
        allModels.add(p.model);
        w[p.brand] = (w[p.brand] || 0) + 1;
        w[p.model] = (w[p.model] || 0) + 1;
      }
    }

    const brands = Array.from(allBrands).sort();
    const models = Array.from(allModels).sort();

    const oldestDate = new Date(Math.min(...data.map(d => new Date(d.created_at).getTime())));
    const now = new Date();
    
    const result = [];
    let current = new Date(oldestDate.getFullYear(), oldestDate.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);

    while (current <= end) {
      const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
      const totalWeeks = Math.ceil(daysInMonth / 7);
      for (let w = 1; w <= totalWeeks; w++) {
        const d = new Date(current.getFullYear(), current.getMonth(), (w - 1) * 7 + 1);
        
        // GUARD: Stop if the generated week is in the future
        if (d > now) break;

        const key = getWeekKey(d);
        const entry = weeks[key] || {};
        const row: Record<string, number | string> = { 
          week: getWeekLabel(d), 
          terjual: entry.terjual || 0 
        };
        brands.forEach(b => { row[b] = entry[b] || 0; });
        models.forEach(m => { row[m] = entry[m] || 0; });
        result.push(row);
      }
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }

    return { weeks: result, brands, models };
  }
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
    const d = new Date(item.created_at);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!seen.has(value)) {
      seen.add(value);
      months.push({
        label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
        value
      });
    }
  }

  return months;
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

export type FinancialSummaryModel = {
  brand: string;
  model: string;
  units_sold: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
};

export async function getFinancialSummaryByModel(selectedMonth?: string): Promise<FinancialSummaryModel[]> {
  await requireOwner();
  const supabase = await createClient();
  let query = supabase
    .from("packing_items")
    .select("sell_price, unit_hpp, products(brand, model), packing_sessions!inner(status, completed_at)")
    .in("packing_sessions.status", ["shipped", "completed", "has_return"]);

  if (selectedMonth) {
    const [year, month] = selectedMonth.split("-").map(Number);
    const start = new Date(year!, month! - 1, 1).toISOString();
    const end = new Date(year!, month!, 1).toISOString();
    query = query.gte("packing_sessions.completed_at", start).lt("packing_sessions.completed_at", end);
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
