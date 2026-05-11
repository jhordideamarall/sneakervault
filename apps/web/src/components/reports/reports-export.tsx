"use client";

import { Button } from "@sneakervault/ui";
import { exportToPDF, exportToExcel } from "@/lib/export";
import { createClient } from "@sneakervault/supabase/client";
import { useToast } from "@/components/toast";

export function ReportsExport() {
  const toast = useToast();

  async function handleExport(format: "pdf" | "excel") {
    const supabase = createClient();
    const { data } = await supabase
      .from("packing_items")
      .select("sell_price, unit_hpp, products(brand, model, size), packing_sessions!inner(status)")
      .in("packing_sessions.status", ["shipped", "completed", "has_return"]);

    if (!data || data.length === 0) {
      toast.push("Tidak ada data untuk diexport", "info");
      return;
    }

    // Group by brand+model
    const map: Record<string, { brand: string; model: string; units: number; revenue: number; cost: number; profit: number }> = {};
    let totalRevenue = 0, totalCost = 0, totalUnits = 0;

    for (const item of data) {
      const p = (item as any).products;
      if (!p) continue;
      const key = `${p.brand}::${p.model}`;
      if (!map[key]) map[key] = { brand: p.brand, model: p.model, units: 0, revenue: 0, cost: 0, profit: 0 };
      const rev = Number(item.sell_price ?? 0);
      const cost = Number(item.unit_hpp ?? 0);
      map[key].units++;
      map[key].revenue += rev;
      map[key].cost += cost;
      map[key].profit += rev - cost;
      totalRevenue += rev;
      totalCost += cost;
      totalUnits++;
    }

    const rows = Object.values(map).sort((a, b) => b.profit - a.profit);
    const totalProfit = totalRevenue - totalCost;
    const margin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : "0";

    const columns = ["No", "Brand", "Model", "Unit Terjual", "Revenue (Rp)", "HPP (Rp)", "Profit (Rp)", "Margin (%)"];
    const tableRows = rows.map((r, i) => [
      i + 1,
      r.brand,
      r.model,
      r.units,
      Math.round(r.revenue),
      Math.round(r.cost),
      Math.round(r.profit),
      r.revenue > 0 ? `${((r.profit / r.revenue) * 100).toFixed(1)}%` : "0%",
    ]);

    // Add total row
    tableRows.push([
      "", "", "TOTAL", totalUnits,
      Math.round(totalRevenue), Math.round(totalCost), Math.round(totalProfit), `${margin}%`,
    ]);

    const summary = [
      { label: "Total Revenue", value: `Rp ${totalRevenue.toLocaleString("id-ID")}` },
      { label: "Total Profit", value: `Rp ${totalProfit.toLocaleString("id-ID")}` },
      { label: "Margin", value: `${margin}%` },
      { label: "Unit Terjual", value: `${totalUnits} pcs` },
    ];

    const exportParams = {
      title: "Laporan Profit per Model",
      columns,
      rows: tableRows,
      summary,
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
