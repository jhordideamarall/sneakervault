import { Suspense } from "react";
import { getStockValue, getProfitReport, getAgingReport, getFinancialSummaryByModel } from "@/lib/queries";
import { ReportsExport } from "@/components/reports/reports-export";

export default async function ReportsPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white/90">Laporan</h1>
          <p className="text-sm text-white/40 mt-1">Ringkasan performa bisnis</p>
        </div>
        <ReportsExport />
      </div>

      <Suspense fallback={<CardsSkeleton />}>
        <SummaryCards />
      </Suspense>

      <Suspense fallback={<TableSkeleton />}>
        <ProfitByModelTable />
      </Suspense>

      <Suspense fallback={<TableSkeleton />}>
        <AgingTable />
      </Suspense>
    </div>
  );
}

async function SummaryCards() {
  const [stock, profit, prevProfit] = await Promise.all([
    getStockValue(),
    getProfitReport(getMonthStart(0), undefined),
    getProfitReport(getMonthStart(-1), getMonthEnd(-1)),
  ]);

  const revenueChange = prevProfit.revenue > 0
    ? ((profit.revenue - prevProfit.revenue) / prevProfit.revenue * 100).toFixed(0)
    : null;

  const margin = profit.revenue > 0 ? (profit.profit / profit.revenue * 100).toFixed(1) : "0";

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      <SummaryCard
        label="Revenue Bulan Ini"
        value={`Rp ${formatNum(profit.revenue)}`}
        sub={revenueChange ? `${Number(revenueChange) >= 0 ? "▲" : "▼"} ${Math.abs(Number(revenueChange))}% vs bulan lalu` : undefined}
        subColor={Number(revenueChange ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}
      />
      <SummaryCard
        label="Profit Bulan Ini"
        value={`Rp ${formatNum(profit.profit)}`}
        sub={`Margin: ${margin}%`}
        subColor="text-white/40"
      />
      <SummaryCard
        label="Unit Terjual"
        value={`${profit.items} pcs`}
        sub="Bulan ini"
      />
      <SummaryCard
        label="Nilai Stok Tersisa"
        value={`Rp ${formatNum(stock.cost)}`}
        sub={`${stock.items} unit`}
      />
    </div>
  );
}

function SummaryCard({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <p className="text-[11px] text-white/40 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold text-white/90 mt-2">{value}</p>
      {sub && <p className={`text-[11px] mt-1 ${subColor ?? "text-white/30"}`}>{sub}</p>}
    </div>
  );
}

async function ProfitByModelTable() {
  const data = await getFinancialSummaryByModel();

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
        <p className="text-sm text-white/30">Belum ada data penjualan</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <div className="px-6 py-4 border-b border-white/[0.04]">
        <p className="text-sm font-medium text-white/80">Profit per Model</p>
        <p className="text-[11px] text-white/30">Produk mana yang paling menguntungkan</p>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/[0.04] text-[11px] uppercase tracking-wider text-white/30">
            <th className="px-6 py-3 text-left font-medium">Produk</th>
            <th className="px-6 py-3 text-right font-medium">Terjual</th>
            <th className="px-6 py-3 text-right font-medium">Revenue</th>
            <th className="px-6 py-3 text-right font-medium">Profit</th>
            <th className="px-6 py-3 text-right font-medium">Margin</th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 15).map((row) => (
            <tr key={`${row.brand}-${row.model}`} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
              <td className="px-6 py-3">
                <span className="text-[13px] font-medium text-white/80">{row.brand}</span>
                <span className="text-[12px] text-white/40 ml-2">{row.model}</span>
              </td>
              <td className="px-6 py-3 text-right text-[12px] text-white/60">{row.units_sold}</td>
              <td className="px-6 py-3 text-right text-[12px] text-white/60">Rp {formatNum(row.revenue)}</td>
              <td className="px-6 py-3 text-right text-[12px] font-medium text-emerald-400">Rp {formatNum(row.profit)}</td>
              <td className="px-6 py-3 text-right">
                <span className={`text-[11px] font-bold ${row.margin >= 25 ? "text-emerald-400" : row.margin >= 15 ? "text-amber-400" : "text-red-400"}`}>
                  {row.margin.toFixed(0)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function AgingTable() {
  const aging = await getAgingReport() as { id: string; brand: string; model: string; size: number; quantity: number; hpp: number; first_inbound_at: string | null }[];

  if (aging.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
        <p className="text-sm text-white/30">Tidak ada data aging</p>
      </div>
    );
  }

  const totalTied = aging.reduce((s, p) => s + p.quantity * p.hpp, 0);
  const oldItems = aging.filter(p => {
    if (!p.first_inbound_at) return false;
    return (Date.now() - new Date(p.first_inbound_at).getTime()) / 86400000 > 30;
  });

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <div className="px-6 py-4 border-b border-white/[0.04] flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white/80">Stok Aging</p>
          <p className="text-[11px] text-white/30">Barang lama belum terjual — pertimbangkan diskon atau retur</p>
        </div>
      </div>

      {oldItems.length > 0 && (
        <div className="px-6 py-3 border-b border-white/[0.04] bg-amber-500/[0.03]">
          <p className="text-[12px] text-amber-400">
            {oldItems.length} produk sudah &gt;30 hari belum terjual — modal terikat Rp {formatNum(totalTied)}
          </p>
        </div>
      )}

      <table className="w-full">
        <thead>
          <tr className="border-b border-white/[0.04] text-[11px] uppercase tracking-wider text-white/30">
            <th className="px-6 py-3 text-left font-medium">Produk</th>
            <th className="px-6 py-3 text-right font-medium">Stok</th>
            <th className="px-6 py-3 text-right font-medium">Modal</th>
            <th className="px-6 py-3 text-right font-medium">Umur</th>
            <th className="px-6 py-3 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {aging.slice(0, 20).map((p) => {
            const ageDays = p.first_inbound_at
              ? Math.floor((Date.now() - new Date(p.first_inbound_at).getTime()) / 86400000)
              : null;
            const status = ageDays === null ? "—" : ageDays > 60 ? "Kritis" : ageDays > 30 ? "Perhatian" : "Aman";
            const statusStyle = status === "Kritis" ? "bg-red-500/10 text-red-400 border-red-500/20" : status === "Perhatian" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";

            return (
              <tr key={p.id} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                <td className="px-6 py-3">
                  <span className="text-[13px] text-white/80">{p.brand} {p.model}</span>
                  <span className="text-[11px] text-white/30 ml-2">({p.size})</span>
                </td>
                <td className="px-6 py-3 text-right text-[12px] text-white/60">{p.quantity}</td>
                <td className="px-6 py-3 text-right text-[12px] text-white/40">Rp {formatNum(p.quantity * p.hpp)}</td>
                <td className="px-6 py-3 text-right text-[12px] text-white/60">{ageDays !== null ? `${ageDays} hari` : "—"}</td>
                <td className="px-6 py-3 text-right">
                  <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase border ${statusStyle}`}>
                    {status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Helpers
function formatNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".0", "")} jt`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} rb`;
  return n.toLocaleString("id-ID");
}

function getMonthStart(offset: number) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function getMonthEnd(offset: number) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function CardsSkeleton() {
  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-white/[0.03]" />)}
    </div>
  );
}

function TableSkeleton() {
  return <div className="h-64 rounded-2xl bg-white/[0.03] animate-pulse" />;
}
