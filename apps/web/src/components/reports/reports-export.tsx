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
    const map: Record<string, { brand: string; model: string; units: number; revenue: number; profit: number }> = {};
    for (const item of data) {
      const p = (item as any).products;
      if (!p) continue;
      const key = `${p.brand}::${p.model}`;
      if (!map[key]) map[key] = { brand: p.brand, model: p.model, units: 0, revenue: 0, profit: 0 };
      map[key].units++;
      map[key].revenue += Number(item.sell_price ?? 0);
      map[key].profit += Number(item.sell_price ?? 0) - Number(item.unit_hpp ?? 0);
    }

    const rows = Object.values(map).sort((a, b) => b.profit - a.profit);
    const columns = ["Brand", "Model", "Terjual", "Revenue", "Profit", "Margin %"];
    const tableRows = rows.map(r => [
      r.brand, r.model, r.units,
      Math.round(r.revenue), Math.round(r.profit),
      r.revenue > 0 ? `${((r.profit / r.revenue) * 100).toFixed(0)}%` : "0%"
    ]);

    if (format === "pdf") {
      await exportToPDF({ title: "Laporan Profit per Model", columns, rows: tableRows, subtitle: `Digenerate: ${new Date().toLocaleDateString("id-ID")}` });
    } else {
      await exportToExcel({ sheetName: "Profit per Model", columns, rows: tableRows });
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
