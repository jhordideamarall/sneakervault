"use client";

import { Button } from "@sneakervault/ui";
import { exportToPDF, exportToExcel, type ReportSection } from "@/lib/export";
import { createClient } from "@sneakervault/supabase/client";
import { useToast } from "@/components/toast";

type MaybeRelation<T> = T | T[] | null;
type PackingItemExport = {
  sell_price: number | null;
  unit_hpp: number | null;
  products: MaybeRelation<{ brand: string; model: string }>;
  packing_sessions: MaybeRelation<{ platform: string | null }>;
};

type InvoiceExport = {
  channel: string | null;
  discount: number | null;
  marketplace_fee: number | null;
  total: number | null;
  sales_invoice_lines: { qty: number | null; unit_cost: number | null }[] | null;
};

type ExpenseExport = {
  amount: number | null;
  expense_categories: MaybeRelation<{ name: string | null; account_code: string | null }>;
};

function firstRelation<T>(value: MaybeRelation<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function ReportsExport() {
  const toast = useToast();

  async function handleExport(format: "pdf" | "excel") {
    toast.push("Menyiapkan laporan...", "info");
    const supabase = createClient();

    // Fetch all data in parallel
    const [productsRes, packingItemsRes, sessionsRes, returnsRes, invoicesRes, expensesRes] = await Promise.all([
      supabase.from("products").select("id, brand, model, size, quantity, hpp, sell_price, first_inbound_at").eq("is_active", true),
      supabase.from("packing_items").select("sell_price, unit_hpp, created_at, products(brand, model), packing_sessions!inner(status, platform)").in("packing_sessions.status", ["shipped", "completed", "has_return"]),
      supabase.from("packing_sessions").select("id, platform, status, created_at").in("status", ["packing", "shipped", "completed", "has_return"]),
      supabase.from("returns").select("id, status, return_type, created_at"),
      supabase.from("sales_invoices").select("channel, subtotal, discount, shipping, marketplace_fee, total, status, sales_invoice_lines(qty, unit_cost)").neq("status", "cancelled"),
      supabase.from("expenses").select("amount, status, expense_categories:category_id(name, account_code)").eq("status", "paid"),
    ]);

    const products = productsRes.data ?? [];
    const items = (packingItemsRes.data ?? []) as unknown as PackingItemExport[];
    const sessions = sessionsRes.data ?? [];
    const returns = returnsRes.data ?? [];
    const invoices = (invoicesRes.data ?? []) as InvoiceExport[];
    const expenses = (expensesRes.data ?? []) as unknown as ExpenseExport[];

    // ═══════════════════════════════════════════
    // SECTION 1: INVENTORY REPORTING
    // ═══════════════════════════════════════════
    const totalUnits = products.reduce((s, p) => s + p.quantity, 0);
    const totalModal = products.reduce((s, p) => s + p.quantity * Number(p.hpp), 0);
    const totalRetail = products.reduce((s, p) => s + p.quantity * Number(p.sell_price ?? 0), 0);
    const lowStock = products.filter(p => p.quantity > 0 && p.quantity < 3);

    // Group by brand
    const brandMap: Record<string, { units: number; modal: number }> = {};
    for (const p of products) {
      if (p.quantity <= 0) continue;
      if (!brandMap[p.brand]) brandMap[p.brand] = { units: 0, modal: 0 };
      brandMap[p.brand]!.units += p.quantity;
      brandMap[p.brand]!.modal += p.quantity * Number(p.hpp);
    }
    const brandRows = Object.entries(brandMap)
      .sort((a, b) => b[1].modal - a[1].modal)
      .map(([brand, d], i) => [i + 1, brand, d.units, Math.round(d.modal), totalModal > 0 ? `${((d.modal / totalModal) * 100).toFixed(1)}%` : "0%"]);

    const inventorySection: ReportSection = {
      title: "INVENTORY REPORTING",
      columns: ["No", "Brand", "Unit", "Nilai Modal (Rp)", "Proporsi (%)"],
      rows: brandRows,
      summary: [
        { label: "Total SKU Aktif", value: String(products.filter(p => p.quantity > 0).length) },
        { label: "Total Unit", value: `${totalUnits} pcs` },
        { label: "Total Nilai Modal", value: `Rp ${totalModal.toLocaleString("id-ID")}` },
        { label: "Potensi Revenue", value: `Rp ${totalRetail.toLocaleString("id-ID")}` },
        { label: "Stok Rendah", value: `${lowStock.length} produk` },
      ],
    };

    // ═══════════════════════════════════════════
    // SECTION 2: FINANCIAL REPORTING
    // ═══════════════════════════════════════════
    let totalRevenue = 0, totalHPP = 0;
    const modelMap: Record<string, { brand: string; model: string; units: number; revenue: number; hpp: number }> = {};

    for (const item of items) {
      const p = firstRelation(item.products);
      if (!p) continue;
      const key = `${p.brand}::${p.model}`;
      if (!modelMap[key]) modelMap[key] = { brand: p.brand, model: p.model, units: 0, revenue: 0, hpp: 0 };
      const rev = Number(item.sell_price ?? 0);
      const cost = Number(item.unit_hpp ?? 0);
      modelMap[key].units++;
      modelMap[key].revenue += rev;
      modelMap[key].hpp += cost;
      totalRevenue += rev;
      totalHPP += cost;
    }

    const totalProfit = totalRevenue - totalHPP;
    const totalMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : "0";

    const financialRows = Object.values(modelMap)
      .sort((a, b) => (b.revenue - b.hpp) - (a.revenue - a.hpp))
      .map((r, i) => [i + 1, r.brand, r.model, r.units, Math.round(r.revenue), Math.round(r.hpp), Math.round(r.revenue - r.hpp), r.revenue > 0 ? `${(((r.revenue - r.hpp) / r.revenue) * 100).toFixed(1)}%` : "0%"]);

    // Total row
    financialRows.push(["", "", "TOTAL", items.length, Math.round(totalRevenue), Math.round(totalHPP), Math.round(totalProfit), `${totalMargin}%`]);

    const financialSection: ReportSection = {
      title: "FINANCIAL REPORTING",
      columns: ["No", "Brand", "Model", "Unit Terjual", "Revenue (Rp)", "HPP (Rp)", "Gross Profit (Rp)", "Margin (%)"],
      rows: financialRows,
      summary: [
        { label: "Total Revenue", value: `Rp ${totalRevenue.toLocaleString("id-ID")}` },
        { label: "Total HPP", value: `Rp ${totalHPP.toLocaleString("id-ID")}` },
        { label: "Gross Profit", value: `Rp ${totalProfit.toLocaleString("id-ID")}` },
        { label: "Margin", value: `${totalMargin}%` },
      ],
    };

    // ═══════════════════════════════════════════
    // SECTION 3: OPERATIONAL REPORTING
    // ═══════════════════════════════════════════
    const totalSessions = sessions.length;
    const totalReturns = returns.length;
    const returnRate = items.length > 0 ? ((totalReturns / items.length) * 100).toFixed(1) : "0";

    // Volume per platform
    const platformMap: Record<string, { sessions: number; items: number }> = {};
    for (const s of sessions) {
      const platform = s.platform ?? "Lainnya";
      if (!platformMap[platform]) platformMap[platform] = { sessions: 0, items: 0 };
      platformMap[platform].sessions++;
    }
    for (const item of items) {
      const platform = firstRelation(item.packing_sessions)?.platform ?? "Lainnya";
      if (!platformMap[platform]) platformMap[platform] = { sessions: 0, items: 0 };
      platformMap[platform].items++;
    }

    const platformRows = Object.entries(platformMap)
      .sort((a, b) => b[1].items - a[1].items)
      .map(([platform, d], i) => [i + 1, platform, d.sessions, d.items, items.length > 0 ? `${((d.items / items.length) * 100).toFixed(1)}%` : "0%"]);

    const operationalSection: ReportSection = {
      title: "OPERATIONAL REPORTING",
      columns: ["No", "Platform", "Total Sesi", "Unit Terjual", "Kontribusi (%)"],
      rows: platformRows,
      summary: [
        { label: "Total Sesi Packing", value: String(totalSessions) },
        { label: "Total Unit Keluar", value: `${items.length} pcs` },
        { label: "Total Retur", value: String(totalReturns) },
        { label: "Return Rate", value: `${returnRate}%` },
      ],
    };

    // ═══════════════════════════════════════════
    // SECTION 4: CHANNEL PROFIT + MARKETPLACE COST
    // ═══════════════════════════════════════════
    const channelMap: Record<string, { invoices: number; units: number; revenue: number; cogs: number; fee: number; discount: number }> = {};
    for (const invoice of invoices) {
      const channel = invoice.channel ?? "other";
      if (!channelMap[channel]) channelMap[channel] = { invoices: 0, units: 0, revenue: 0, cogs: 0, fee: 0, discount: 0 };
      const lines = invoice.sales_invoice_lines ?? [];
      channelMap[channel].invoices++;
      channelMap[channel].revenue += Number(invoice.total ?? 0);
      channelMap[channel].fee += Number(invoice.marketplace_fee ?? 0);
      channelMap[channel].discount += Number(invoice.discount ?? 0);
      for (const line of lines) {
        channelMap[channel].units += Number(line.qty ?? 0);
        channelMap[channel].cogs += Number(line.qty ?? 0) * Number(line.unit_cost ?? 0);
      }
    }

    const channelRows = Object.entries(channelMap)
      .sort((a, b) => (b[1].revenue - b[1].cogs) - (a[1].revenue - a[1].cogs))
      .map(([channel, d], i) => {
        const profit = d.revenue - d.cogs;
        return [i + 1, channel, d.invoices, d.units, Math.round(d.revenue), Math.round(d.cogs), Math.round(d.fee), Math.round(profit), d.revenue > 0 ? `${((profit / d.revenue) * 100).toFixed(1)}%` : "0%"];
      });

    const channelSection: ReportSection = {
      title: "CHANNEL PROFIT & MARKETPLACE COST",
      columns: ["No", "Channel", "Invoice", "Unit", "Revenue (Rp)", "HPP (Rp)", "Fee (Rp)", "Profit (Rp)", "Margin (%)"],
      rows: channelRows,
    };

    // ═══════════════════════════════════════════
    // SECTION 5: EXPENSE REPORTING
    // ═══════════════════════════════════════════
    const expenseMap: Record<string, { category: string; account: string; count: number; total: number }> = {};
    for (const expense of expenses) {
      const expenseCategory = firstRelation(expense.expense_categories);
      const category = expenseCategory?.name ?? "Tanpa kategori";
      const account = expenseCategory?.account_code ?? "—";
      const key = `${account}:${category}`;
      if (!expenseMap[key]) expenseMap[key] = { category, account, count: 0, total: 0 };
      expenseMap[key].count++;
      expenseMap[key].total += Number(expense.amount ?? 0);
    }
    const expenseRows = Object.values(expenseMap)
      .sort((a, b) => b.total - a.total)
      .map((row, i) => [i + 1, row.account, row.category, row.count, Math.round(row.total)]);

    const expenseSection: ReportSection = {
      title: "EXPENSE REPORTING",
      columns: ["No", "Akun", "Kategori", "Transaksi", "Total (Rp)"],
      rows: expenseRows,
      summary: [
        { label: "Total Pengeluaran", value: `Rp ${Object.values(expenseMap).reduce((s, r) => s + r.total, 0).toLocaleString("id-ID")}` },
        { label: "Kategori Aktif", value: String(Object.keys(expenseMap).length) },
      ],
    };

    // ═══════════════════════════════════════════
    // GENERATE REPORT
    // ═══════════════════════════════════════════
    const exportParams = {
      title: "Executive Summary Report",
      sections: [inventorySection, financialSection, operationalSection, channelSection, expenseSection],
      period: new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" }),
    };

    if (format === "pdf") {
      await exportToPDF(exportParams);
    } else {
      await exportToExcel(exportParams);
    }
    toast.push("Export berhasil", "success");
  }

  return (
    <div className="flex gap-2">
      <Button variant="secondary" size="sm" onClick={() => handleExport("pdf")}>Export PDF</Button>
      <Button variant="secondary" size="sm" onClick={() => handleExport("excel")}>Export Excel</Button>
    </div>
  );
}
