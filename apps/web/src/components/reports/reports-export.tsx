"use client";

import { Button } from "@sneakervault/ui";
import { exportToPDF, exportToExcel, type ReportSection } from "@/lib/export";
import { createClient } from "@sneakervault/supabase/client";
import { useToast } from "@/components/toast";

export function ReportsExport() {
  const toast = useToast();

  async function handleExport(format: "pdf" | "excel") {
    toast.push("Menyiapkan laporan...", "info");
    const supabase = createClient();

    // Fetch all data in parallel
    const [productsRes, packingItemsRes, sessionsRes, returnsRes] = await Promise.all([
      supabase.from("products").select("id, brand, model, size, quantity, hpp, sell_price, first_inbound_at").eq("is_active", true),
      supabase.from("packing_items").select("sell_price, unit_hpp, created_at, products(brand, model), packing_sessions!inner(status, platform)").in("packing_sessions.status", ["shipped", "completed", "has_return"]),
      supabase.from("packing_sessions").select("id, platform, status, created_at").in("status", ["packing", "shipped", "completed", "has_return"]),
      supabase.from("returns").select("id, status, return_type, created_at"),
    ]);

    const products = productsRes.data ?? [];
    const items = packingItemsRes.data ?? [];
    const sessions = sessionsRes.data ?? [];
    const returns = returnsRes.data ?? [];

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
      const p = (item as any).products;
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
      const platform = ((item as any).packing_sessions?.platform) ?? "Lainnya";
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
    // GENERATE REPORT
    // ═══════════════════════════════════════════
    const exportParams = {
      title: "Executive Summary Report",
      sections: [inventorySection, financialSection, operationalSection],
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
