"use client";

import { useState, useMemo } from "react";
import { PLATFORMS, COURIERS } from "@sneakervault/shared";
import { Card, Badge, Button } from "@sneakervault/ui";
import { ExportButtons } from "@/components/export-buttons";
import { 
  DollarSign, 
  Search, 
  Calendar, 
  Package, 
  TrendingUp, 
  ArrowUpRight
} from "lucide-react";

type SoldSession = Record<string, unknown> & {
  id: string;
  platform: string;
  courier: string;
  platform_order_id: string | null;
  completed_at: string | null;
  created_at: string;
  packing_items: {
    id: string;
    sell_price: number;
    unit_hpp: number;
    products?: { brand: string; model: string; size: number; sku: string } | null;
  }[];
  profiles?: { full_name: string } | null;
};

export function RiwayatTerjualClient({ 
  initialSessions,
  searchParams 
}: { 
  initialSessions: SoldSession[],
  searchParams: Record<string, string | undefined>
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return initialSessions.filter(s => {
      const matchSearch = search 
        ? (s.platform_order_id?.toLowerCase().includes(search.toLowerCase()) || 
           s.packing_items.some(i => i.products?.model.toLowerCase().includes(search.toLowerCase()) || i.products?.sku.toLowerCase().includes(search.toLowerCase())))
        : true;
      return matchSearch;
    });
  }, [initialSessions, search]);

  // Totals
  const totals = useMemo(() => {
    let items = 0;
    let revenue = 0;
    let profit = 0;
    for (const s of filtered) {
      for (const i of s.packing_items ?? []) {
        items += 1;
        revenue += Number(i.sell_price ?? 0);
        profit += Number(i.sell_price ?? 0) - Number(i.unit_hpp ?? 0);
      }
    }
    return { items, revenue, profit };
  }, [filtered]);

  // Flatten rows for export
  const exportRows = useMemo(() => {
    const rows: (string | number)[][] = [];
    for (const s of filtered) {
      for (const i of s.packing_items ?? []) {
        rows.push([
          s.completed_at ? new Date(s.completed_at).toLocaleDateString("id-ID") : "",
          s.platform_order_id ?? "",
          s.platform,
          s.courier,
          i.products?.brand ?? "",
          i.products?.model ?? "",
          i.products?.size ?? "",
          Number(i.sell_price),
          Number(i.unit_hpp),
          Number(i.sell_price) - Number(i.unit_hpp),
        ]);
      }
    }
    return rows;
  }, [filtered]);

  const margin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <DollarSign className="text-white/40" size={28} />
            Riwayat Terjual
          </h1>
          <ExportButtons
            title="Riwayat Terjual"
            sheetName="Sold"
            columns={["Tanggal", "Order ID", "Platform", "Kurir", "Brand", "Model", "Size", "Harga Jual", "HPP", "Profit"]}
            rows={exportRows}
            subtitle={`${totals.items} item · Rp ${totals.revenue.toLocaleString("id-ID")} · Profit Rp ${totals.profit.toLocaleString("id-ID")}`}
          />
        </div>
        <p className="text-white/50">
          Daftar pesanan yang sudah terkirim dan selesai secara operasional.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="border-white/[0.06] bg-[#262626] p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/30 flex items-center gap-2">
            <Package size={14} /> Total Item
          </div>
          <div className="mt-2 text-2xl font-bold text-white">{totals.items} <span className="text-sm font-normal text-white/40">pcs</span></div>
        </Card>
        <Card className="border-white/[0.06] bg-[#262626] p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/30 flex items-center gap-2">
            <TrendingUp size={14} /> Pendapatan
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-400">
            <span className="text-sm font-medium mr-1 text-emerald-500/60">Rp</span>
            {totals.revenue.toLocaleString("id-ID")}
          </div>
        </Card>
        <Card className="border-white/[0.06] bg-[#262626] p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/30 flex items-center gap-2">
            <DollarSign size={14} /> Profit Bersih
          </div>
          <div className="mt-2 text-2xl font-bold text-sky-400">
             <span className="text-sm font-medium mr-1 text-sky-500/60">Rp</span>
             {totals.profit.toLocaleString("id-ID")}
          </div>
        </Card>
        <Card className="border-white/[0.06] bg-[#262626] p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/30 flex items-center gap-2">
            <ArrowUpRight size={14} /> Margin
          </div>
          <div className="mt-2 text-2xl font-bold text-white/90">{margin.toFixed(1)}%</div>
        </Card>
      </div>

      <Card className="border-white/[0.06] bg-[#262626] p-4">
        <form className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
            <input
              type="text"
              placeholder="Cari Order ID, SKU, atau Model..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-white/20"
            />
          </div>
          <div className="flex gap-2">
            <select 
              name="platform" 
              defaultValue={searchParams.platform ?? ""} 
              className="rounded-xl bg-white/[0.03] border border-white/[0.08] py-2.5 px-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 appearance-none min-w-[140px]"
            >
              <option value="">Semua Platform</option>
              {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <select 
              name="courier" 
              defaultValue={searchParams.courier ?? ""} 
              className="rounded-xl bg-white/[0.03] border border-white/[0.08] py-2.5 px-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 appearance-none min-w-[140px]"
            >
              <option value="">Semua Kurir</option>
              {COURIERS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <Button type="submit" variant="secondary">
              Filter
            </Button>
          </div>
        </form>
      </Card>

      <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#262626]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02] text-[11px] uppercase tracking-wider text-white/40">
                <th className="px-4 py-3 font-medium">Tanggal</th>
                <th className="px-4 py-3 font-medium">Order ID</th>
                <th className="px-4 py-3 font-medium text-center">Platform</th>
                <th className="px-4 py-3 font-medium">Item Terjual</th>
                <th className="px-4 py-3 text-right font-medium">Total Jual</th>
                <th className="px-4 py-3 text-right font-medium">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filtered.map((s) => {
                const items = s.packing_items ?? [];
                const totalSale = items.reduce((sum, i) => sum + Number(i.sell_price ?? 0), 0);
                const totalProfit = items.reduce((sum, i) => sum + (Number(i.sell_price ?? 0) - Number(i.unit_hpp ?? 0)), 0);
                
                return (
                  <tr key={s.id} className="hover:bg-white/[0.01] transition-colors align-top">
                    <td className="px-4 py-4 text-white/50">
                      <div className="flex items-center gap-2">
                        <Calendar size={12} />
                        {s.completed_at ? new Date(s.completed_at).toLocaleDateString("id-ID", { day: '2-digit', month: 'short' }) : "—"}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-mono text-xs font-semibold text-white/90">
                        {s.platform_order_id ?? "N/A"}
                      </div>
                      <div className="text-[10px] text-white/30 uppercase mt-0.5">{s.courier}</div>
                    </td>
                    <td className="px-4 py-4 text-center">
                       <Badge tone="neutral" className="bg-white/5 border-white/5 capitalize text-[10px]">
                          {s.platform}
                       </Badge>
                    </td>
                    <td className="px-4 py-4">
                      <ul className="space-y-1.5">
                        {items.map((i) => (
                          <li key={i.id} className="flex flex-col gap-0.5">
                            <span className="text-white/80 font-medium">{i.products?.brand} {i.products?.model}</span>
                            <span className="text-[10px] text-white/40">Size {i.products?.size} • {i.products?.sku}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-4 py-4 text-right font-bold text-white">
                      Rp {totalSale.toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-emerald-400/80">
                      Rp {totalProfit.toLocaleString("id-ID")}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-20 text-center">
                    <div className="flex flex-col items-center gap-3 opacity-20">
                      <DollarSign size={64} />
                      <p className="text-lg font-medium tracking-tight">Data riwayat terjual belum tersedia.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
