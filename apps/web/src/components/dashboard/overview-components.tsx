import { getBestsellers, getFinancialSummaryByModel, getMonthlySales, getDashboardStats } from "@/lib/queries";
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import Image from "next/image";
import { SalesChart } from "./sales-chart";

export async function WarehouseConditionSection() {
  const stats = await getDashboardStats();
  
  return (
    <div className="grid gap-5 grid-cols-2">
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white/70">Total Stok Fisik</h3>
          <p className="text-[10px] text-white/30 uppercase tracking-widest mt-0.5">Real-time Gudang</p>
        </div>
        <p className="text-3xl font-black text-white tabular-nums">{stats.totalItems.toLocaleString('id-ID')} <span className="text-sm font-semibold text-white/40">unit</span></p>
      </div>
      
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white/70">Nilai Stok Operasional (HPP)</h3>
          <p className="text-[10px] text-white/30 uppercase tracking-widest mt-0.5">Stok Fisik × HPP Rata-Rata</p>
        </div>
        <p className="text-3xl font-black text-white tabular-nums"><span className="text-xl font-semibold text-white/40 mr-1">Rp</span>{stats.totalValue.toLocaleString('id-ID')}</p>
      </div>
    </div>
  );
}

export async function BestsellerSection() {
  const bestsellers = await getBestsellers(3); // Revert to only 3
  const top3 = bestsellers as { id: string; count: number; brand?: string; model?: string; image_url?: string }[];
  const fallback = "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600&q=80";

  if (top3.length === 0) return <div className="col-span-3 py-10 text-center text-white/20">Belum ada data penjualan</div>;

  return (
    <div className="grid gap-5 grid-cols-3">
      {top3.map((item, idx) => (
        <div key={item.id} className="relative h-[calc(100vh/3)] rounded-2xl overflow-hidden border border-white/[0.06] group">
          <Image src={item.image_url ?? fallback} alt={item.brand ?? ""} fill className="object-cover transition-transform duration-500 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute top-4 left-4 rounded-lg bg-white/[0.15] backdrop-blur-sm px-3 py-1.5 border border-white/[0.1]">
            <span className="text-xs font-bold text-white">TOP {idx + 1}</span>
          </div>
          <div className="absolute bottom-6 left-6 right-6">
            <p className="text-xl font-bold text-white">{item.brand}</p>
            <p className="text-sm text-white/70 mt-0.5">{item.model}</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="rounded-lg bg-white/[0.12] px-2.5 py-1 text-xs font-semibold text-white">{item.count} terjual</span>
              <span className="text-xs text-white/40">total</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export async function AlertSection() {
  const stats = await getDashboardStats();
  if (stats.pendingReturns === 0) return null;

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] px-6 py-4">
      <AlertTriangle size={20} className="text-amber-400 flex-shrink-0" />
      <div>
        <p className="text-sm font-semibold text-amber-300">
          {stats.pendingReturns} retur menunggu verifikasi
        </p>
        <p className="text-xs text-amber-400/60">Buka halaman Retur untuk verifikasi fisik barang</p>
      </div>
    </div>
  );
}

export async function ChartSection({ selectedMonth, selectedDate }: { selectedMonth?: string; selectedDate?: string }) {
  const monthlySales = await getMonthlySales(selectedMonth, selectedDate);
  const granularity: "hour" | "day" | "week" = selectedDate ? "hour" : selectedMonth ? "day" : "week";
  // Trend comparison only meaningful when a specific period is selected.
  const hasPreviousPeriod = Boolean(selectedDate || selectedMonth);
  return (
    <SalesChart 
      data={monthlySales.weeks as Record<string, number | string>[]} 
      brands={monthlySales.brands} 
      models={monthlySales.models}
      granularity={granularity}
      previousTotals={hasPreviousPeriod ? monthlySales.previousTotals : undefined}
    />
  );
}

export async function FinancialTableSection({ selectedMonth, selectedDate }: { selectedMonth?: string; selectedDate?: string }) {
  // If specific date selected, use that date's range as month filter
  const filterMonth = selectedDate ? selectedDate.slice(0, 7) : selectedMonth;
  const financialSummary = await getFinancialSummaryByModel(filterMonth, selectedDate);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <div className="px-6 py-4 border-b border-white/[0.04] flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white/70">Ringkasan Laba Rugi per Model</h2>
          <p className="text-xs text-white/30 mt-0.5">Analisis keuntungan bersih berdasarkan unit yang terjual</p>
        </div>
        <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Live Audit</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-white/60">
          <thead>
            <tr className="bg-white/[0.01] text-white/25 uppercase tracking-tighter font-bold">
              <th className="px-6 py-3 border-r border-white/[0.02]">Brand / Model</th>
              <th className="px-6 py-3 text-center border-r border-white/[0.02]">Terjual</th>
              <th className="px-6 py-3 text-right border-r border-white/[0.02]">Omset</th>
              <th className="px-6 py-3 text-right border-r border-white/[0.02]">Modal</th>
              <th className="px-6 py-3 text-right border-r border-white/[0.02]">Profit</th>
              <th className="px-6 py-3 text-center">Margin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {financialSummary.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-white/20 font-medium">
                  Belum ada data penjualan tercatat untuk periode ini.
                </td>
              </tr>
            ) : (
              financialSummary.map((row, i) => (
                <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-6 py-4 border-r border-white/[0.01]">
                    <div className="font-bold text-white/90 group-hover:text-white transition-colors">{row.brand}</div>
                    <div className="text-[11px] text-white/30">{row.model}</div>
                  </td>
                  <td className="px-6 py-4 text-center font-bold text-white/70 border-r border-white/[0.01]">
                    {row.units_sold} <span className="text-[10px] font-normal opacity-40">unit</span>
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums border-r border-white/[0.01]">
                    Rp {row.revenue.toLocaleString('id-ID')}
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums border-r border-white/[0.01]">
                    Rp {row.cost.toLocaleString('id-ID')}
                  </td>
                  <td className="px-6 py-4 text-right font-black text-emerald-400 tabular-nums border-r border-white/[0.01]">
                    Rp {row.profit.toLocaleString('id-ID')}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-black text-[11px] ${row.margin > 20 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                      {row.margin > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {row.margin.toFixed(1)}%
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// SKELETONS
export function ConditionSkeleton() {
  return (
    <div className="grid gap-5 grid-cols-2">
      <div className="h-32 rounded-2xl bg-white/[0.02] animate-pulse border border-white/[0.04]" />
      <div className="h-32 rounded-2xl bg-white/[0.02] animate-pulse border border-white/[0.04]" />
    </div>
  );
}

export function BestsellerSkeleton() {
  return (
    <div className="grid gap-5 grid-cols-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-[calc(100vh/3)] rounded-2xl bg-white/[0.02] animate-pulse border border-white/[0.04]" />
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return <div className="h-[400px] w-full rounded-2xl bg-white/[0.02] animate-pulse border border-white/[0.04]" />;
}

export function TableSkeleton() {
  return <div className="h-[300px] w-full rounded-2xl bg-white/[0.02] animate-pulse border border-white/[0.04]" />;
}
