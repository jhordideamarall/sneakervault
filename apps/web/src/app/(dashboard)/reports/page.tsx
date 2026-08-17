import { Suspense } from "react";
import {
  getAgingReport,
  getExpenseReport,
  getFinancialSummaryByModel,
  getArApReport,
  getGeneralLedgerReport,
  getJournalReport,
  getMarketplaceCostReport,
  getProfitByChannelReport,
  getProfitReport,
  getReturnReport,
  getSalesReport,
  getStockCardReport,
  getStockMovementReport,
  getStockValue,
} from "@/lib/queries";
import { ReportsExport } from "@/components/reports/reports-export";
import { MandatoryReportsClient } from "@/components/reports/mandatory-reports-client";
import {
  nowWIB,
  wibStartOfDay,
  wibEndOfDay,
  wibStartOfMonth,
  wibEndOfMonth,
} from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; month?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;

  // Compute WIB-aware date range from calendar filter.
  // `to` is INCLUSIVE here because getProfitReport uses `.lte`.
  let from: string;
  let to: string;
  let periodLabel: string;

  if (sp.from && sp.to) {
    from = wibStartOfDay(sp.from);
    to = wibEndOfDay(sp.to);
    periodLabel = `${new Date(`${sp.from}T00:00:00Z`).toLocaleDateString("id-ID", {
      day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    })} — ${new Date(`${sp.to}T00:00:00Z`).toLocaleDateString("id-ID", {
      day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    })}`;
  } else if (sp.date) {
    from = wibStartOfDay(sp.date);
    to = wibEndOfDay(sp.date);
    const [y, m, d] = sp.date.split("-").map(Number);
    periodLabel = new Date(Date.UTC(y!, m! - 1, d!))
      .toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  } else if (sp.month) {
    const [y, m] = sp.month.split("-").map(Number);
    from = wibStartOfMonth(y!, m! - 1);
    to = wibEndOfMonth(y!, m! - 1);
    periodLabel = new Date(Date.UTC(y!, m! - 1, 1))
      .toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });
  } else {
    const n = nowWIB();
    from = wibStartOfMonth(n.getUTCFullYear(), n.getUTCMonth());
    to = wibEndOfMonth(n.getUTCFullYear(), n.getUTCMonth());
    periodLabel = "Bulan ini";
  }

  const filterKey = `${sp.from ?? ""}-${sp.to ?? ""}-${sp.date ?? ""}-${sp.month ?? ""}`;

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <h1 className="text-2xl font-bold text-white/90">Ringkasan Operasional</h1>
          <p className="text-sm text-white/60 mt-1">{periodLabel}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <form className="flex flex-wrap items-end gap-2" method="get">
            <label className="text-xs text-white/65">
              <span className="mb-1 block">Dari tanggal</span>
              <input className="h-9 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white" type="date" name="from" defaultValue={from.slice(0, 10)} />
            </label>
            <label className="text-xs text-white/65">
              <span className="mb-1 block">Sampai tanggal</span>
              <input className="h-9 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white" type="date" name="to" defaultValue={to.slice(0, 10)} />
            </label>
            <button type="submit" className="h-9 rounded-md bg-white px-4 text-sm font-medium text-black hover:bg-white/90">
              Terapkan Periode
            </button>
          </form>
          <ReportsExport from={from} to={to} periodLabel={periodLabel} />
        </div>
      </div>

      <Suspense key={`cards-${filterKey}`} fallback={<CardsSkeleton />}>
        <SummaryCards from={from} to={to} />
      </Suspense>

      <Suspense key={`mandatory-${filterKey}`} fallback={<TableSkeleton />}>
        <MandatoryReportsSection from={from} to={to} periodLabel={periodLabel} />
      </Suspense>

      <Suspense key={`profit-${filterKey}`} fallback={<TableSkeleton />}>
        <ProfitByModelTable from={from} to={to} selectedDate={sp.date} selectedMonth={sp.month} />
      </Suspense>

      <Suspense fallback={<TableSkeleton />}>
        <AgingTable />
      </Suspense>

      <Suspense key={`channel-${filterKey}`} fallback={<TableSkeleton />}>
        <ChannelAndExpenseTables from={from} to={to} />
      </Suspense>

      <Suspense key={`stock-card-${filterKey}`} fallback={<TableSkeleton />}>
        <StockCardTable from={from} to={to} />
      </Suspense>
    </div>
  );
}

async function MandatoryReportsSection({
  from,
  to,
  periodLabel,
}: {
  from: string;
  to: string;
  periodLabel: string;
}) {
  const [generalLedger, journals, sales, returns, stockMovements, arAp] =
    await Promise.all([
      getGeneralLedgerReport(from, to),
      getJournalReport(from, to),
      getSalesReport(from, to),
      getReturnReport(from, to),
      getStockMovementReport(from, to),
      getArApReport(from, to),
    ]);

  return (
    <MandatoryReportsClient
      periodLabel={periodLabel}
      data={{ generalLedger, journals, sales, returns, stockMovements, arAp }}
    />
  );
}

async function SummaryCards({ from, to }: { from: string; to: string }) {
  const [stock, profit] = await Promise.all([
    getStockValue(),
    getProfitReport(from, to),
  ]);

  const margin = profit.revenue > 0 ? (profit.profit / profit.revenue * 100).toFixed(1) : "0";

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      <SummaryCard
        label="Omzet"
        value={`Rp ${formatNum(profit.revenue)}`}
      />
      <SummaryCard
        label="Laba"
        value={`Rp ${formatNum(profit.profit)}`}
        sub={`Margin: ${margin}%`}
        subColor="text-white/60"
      />
      <SummaryCard
        label="Unit Terjual"
        value={`${profit.items} pcs`}
      />
      <SummaryCard
        label="Nilai Stok Operasional"
        value={`Rp ${formatNum(stock.cost)}`}
        sub={`${stock.items} unit · dari inventori`}
      />
    </div>
  );
}

function SummaryCard({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <p className="text-[11px] text-white/60 uppercase tracking-wider">{label}</p>
      <p className="mt-2 whitespace-nowrap text-[clamp(1rem,1.1vw,1.25rem)] font-bold text-white/90">{value}</p>
      {sub && <p className={`text-[11px] mt-1 ${subColor ?? "text-white/60"}`}>{sub}</p>}
    </div>
  );
}

async function ProfitByModelTable({
  from,
  to,
  selectedDate,
  selectedMonth,
}: {
  from: string;
  to: string;
  selectedDate?: string;
  selectedMonth?: string;
}) {
  void from; void to; // kept for symmetry; inner query rebuilds range itself.
  // If a specific date is selected, filter by that day. Otherwise filter by month.
  // When neither is set, fallback to current WIB month.
  let monthForQuery = selectedMonth;
  if (!selectedDate && !selectedMonth) {
    const n = nowWIB();
    monthForQuery = `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const data = await getFinancialSummaryByModel(monthForQuery, selectedDate);

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
        <p className="text-sm text-white/60">Belum ada data penjualan</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <div className="px-6 py-4 border-b border-white/[0.04]">
        <p className="text-sm font-medium text-white/80">Financial Reporting</p>
        <p className="text-[11px] text-white/60">Laba per model — produk mana yang paling menguntungkan</p>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/[0.04] text-[11px] uppercase tracking-wider text-white/60">
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
                <span className="text-[12px] text-white/60 ml-2">{row.model}</span>
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
  const aging = await getAgingReport() as { id: string; brand: string; model: string; size: number; size_label: string | null; quantity: number; hpp: number; first_inbound_at: string | null }[];
  const nowMs = nowWIB().getTime();

  if (aging.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
        <p className="text-sm text-white/60">Tidak ada data umur stok</p>
      </div>
    );
  }

  const totalTied = aging.reduce((s, p) => s + p.quantity * p.hpp, 0);
  const oldItems = aging.filter(p => {
    if (!p.first_inbound_at) return false;
    return (nowMs - new Date(p.first_inbound_at).getTime()) / 86400000 > 30;
  });

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <div className="px-6 py-4 border-b border-white/[0.04] flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white/80">Inventory Reporting — Aging</p>
          <p className="text-[11px] text-white/60">Barang lama belum terjual — pertimbangkan diskon atau retur ke supplier</p>
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
          <tr className="border-b border-white/[0.04] text-[11px] uppercase tracking-wider text-white/60">
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
              ? Math.floor((nowMs - new Date(p.first_inbound_at).getTime()) / 86400000)
              : null;
            const status = ageDays === null ? "—" : ageDays > 60 ? "Kritis" : ageDays > 30 ? "Perhatian" : "Aman";
            const statusStyle = status === "Kritis" ? "bg-red-500/10 text-red-400 border-red-500/20" : status === "Perhatian" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";

            return (
              <tr key={p.id} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                <td className="px-6 py-3">
                  <span className="text-[13px] text-white/80">{p.brand} {p.model}</span>
                  <span className="text-[11px] text-white/60 ml-2">({p.size_label ?? p.size})</span>
                </td>
                <td className="px-6 py-3 text-right text-[12px] text-white/60">{p.quantity}</td>
                <td className="px-6 py-3 text-right text-[12px] text-white/60">Rp {formatNum(p.quantity * p.hpp)}</td>
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

async function ChannelAndExpenseTables({ from, to }: { from: string; to: string }) {
  const [channelProfit, marketplaceCosts, expenses] = await Promise.all([
    getProfitByChannelReport(from, to),
    getMarketplaceCostReport(from, to),
    getExpenseReport(from, to),
  ]);

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
        <div className="border-b border-white/[0.04] px-6 py-4">
          <p className="text-sm font-medium text-white/80">Profit per Channel</p>
          <p className="text-[11px] text-white/60">Omzet, HPP, biaya, dan margin per sumber penjualan</p>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.04] text-[11px] uppercase tracking-wider text-white/60">
              <th className="px-6 py-3 text-left font-medium">Channel</th>
              <th className="px-6 py-3 text-right font-medium">Invoice</th>
              <th className="px-6 py-3 text-right font-medium">Revenue</th>
              <th className="px-6 py-3 text-right font-medium">Fee</th>
              <th className="px-6 py-3 text-right font-medium">Profit</th>
              <th className="px-6 py-3 text-right font-medium">Margin</th>
            </tr>
          </thead>
          <tbody>
            {channelProfit.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-sm text-white/60">Belum ada data channel</td></tr>
            ) : channelProfit.map((row) => (
              <tr key={row.channel} className="border-b border-white/[0.02]">
                <td className="px-6 py-3 text-sm font-medium capitalize text-white/75">{row.channel}</td>
                <td className="px-6 py-3 text-right text-xs text-white/50">{row.invoices}</td>
                <td className="px-6 py-3 text-right text-xs text-white/50">Rp {formatNum(row.revenue)}</td>
                <td className="px-6 py-3 text-right text-xs text-white/50">Rp {formatNum(row.marketplace_fee)}</td>
                <td className="px-6 py-3 text-right text-xs font-semibold text-emerald-300">Rp {formatNum(row.profit)}</td>
                <td className="px-6 py-3 text-right text-xs text-white/60">{row.margin.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
        <div className="border-b border-white/[0.04] px-6 py-4">
          <p className="text-sm font-medium text-white/80">Biaya Marketplace & Pengeluaran</p>
          <p className="text-[11px] text-white/60">Biaya marketplace dan beban operasional per kategori</p>
        </div>
        <div className="divide-y divide-white/[0.04]">
          <div className="p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/60">Marketplace</p>
            {marketplaceCosts.length === 0 ? (
              <p className="text-sm text-white/60">Belum ada biaya marketplace.</p>
            ) : marketplaceCosts.map((row) => (
              <div key={row.channel} className="flex items-center justify-between py-2 text-sm">
                <span className="capitalize text-white/70">{row.channel}</span>
                <span className="text-right text-white/50">
                  Fee Rp {formatNum(row.marketplace_fee)}
                  <span className="ml-2 text-[10px] uppercase text-white/60">
                    {row.fee_source === "settlement_actual" ? "Settlement" : row.fee_source === "mixed" ? "Settlement+Estimasi" : row.fee_source === "order_estimate" ? "Estimasi" : "-"}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <div className="p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/60">Pengeluaran</p>
            {expenses.length === 0 ? (
              <p className="text-sm text-white/60">Belum ada pengeluaran terbayar.</p>
            ) : expenses.slice(0, 8).map((row) => (
              <div key={`${row.account_code}-${row.category}`} className="flex items-center justify-between py-2 text-sm">
                <span className="text-white/70">{row.category}</span>
                <span className="text-white/50">Rp {formatNum(row.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

async function StockCardTable({ from, to }: { from: string; to: string }) {
  const rows = await getStockCardReport(from, to);
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
      <div className="border-b border-white/[0.04] px-6 py-4">
        <p className="text-sm font-medium text-white/80">Kartu Stok</p>
        <p className="text-[11px] text-white/60">Saldo awal, mutasi periode terpilih, dan saldo akhir per produk</p>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/[0.04] text-[11px] uppercase tracking-wider text-white/60">
            <th className="px-6 py-3 text-left font-medium">Produk</th>
            <th className="px-6 py-3 text-right font-medium">Awal</th>
            <th className="px-6 py-3 text-right font-medium">Masuk</th>
            <th className="px-6 py-3 text-right font-medium">Keluar</th>
            <th className="px-6 py-3 text-right font-medium">Adjust</th>
            <th className="px-6 py-3 text-right font-medium">Akhir</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={6} className="px-6 py-8 text-center text-sm text-white/60">Belum ada kartu stok.</td></tr>
          ) : rows.slice(0, 25).map((row) => (
            <tr key={row.product_id} className="border-b border-white/[0.02]">
              <td className="px-6 py-3">
                <p className="text-sm text-white/75">{row.product_label}</p>
                <p className="font-mono text-[11px] text-white/60">{row.sku}</p>
              </td>
              <td className="px-6 py-3 text-right text-xs font-semibold text-white/80">{row.opening_qty}</td>
              <td className="px-6 py-3 text-right text-xs text-white/50">{row.inbound}</td>
              <td className="px-6 py-3 text-right text-xs text-white/50">{row.outbound}</td>
              <td className="px-6 py-3 text-right text-xs text-white/50">{row.adjustment}</td>
              <td className="px-6 py-3 text-right text-xs font-semibold text-white/80">{row.current_qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Helpers
function formatNum(n: number) {
  return n.toLocaleString("id-ID");
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
