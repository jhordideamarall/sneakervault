import { getStockValue, getProfitReport, getAgingReport, getBestsellers } from "@/lib/queries";
import { Card } from "@sneakervault/ui";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const from = sp.from;
  const to = sp.to;

  const [stockValue, profit, aging, bestsellers] = await Promise.all([
    getStockValue(),
    getProfitReport(from, to),
    getAgingReport(),
    getBestsellers(10),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1a1a2e]">📈 Laporan</h1>

      {/* Stock Value */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#1a1a2e]">Nilai Stok Saat Ini</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-sm text-[#6b7280]">Jumlah Item</p>
            <p className="mt-2 text-2xl font-bold text-[#1a1a2e]">{stockValue.items}</p>
          </Card>
          <Card>
            <p className="text-sm text-[#6b7280]">Nilai Modal (HPP × Qty)</p>
            <p className="mt-2 text-2xl font-bold text-[#1a1a2e]">
              Rp {Math.round(stockValue.cost).toLocaleString("id-ID")}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-[#6b7280]">Potensi Pendapatan (Retail × Qty)</p>
            <p className="mt-2 text-2xl font-bold text-blue-600">
              Rp {Math.round(stockValue.retail).toLocaleString("id-ID")}
            </p>
          </Card>
        </div>
      </section>

      {/* Profit */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#1a1a2e]">Profit</h2>
          <form className="flex items-center gap-2 text-sm">
            <label>
              Dari: <input type="date" name="from" defaultValue={from ?? ""} className="rounded-lg border border-[#e5e7eb] px-2 py-1" />
            </label>
            <label>
              Sampai: <input type="date" name="to" defaultValue={to ?? ""} className="rounded-lg border border-[#e5e7eb] px-2 py-1" />
            </label>
            <button type="submit" className="rounded-lg bg-[#1a1a2e] px-3 py-1.5 text-white hover:bg-[#16213e]">
              Filter
            </button>
          </form>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <p className="text-sm text-[#6b7280]">Item Terjual</p>
            <p className="mt-2 text-2xl font-bold text-[#1a1a2e]">{profit.items}</p>
          </Card>
          <Card>
            <p className="text-sm text-[#6b7280]">Pendapatan</p>
            <p className="mt-2 text-2xl font-bold text-blue-600">
              Rp {Math.round(profit.revenue).toLocaleString("id-ID")}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-[#6b7280]">Total Modal</p>
            <p className="mt-2 text-2xl font-bold text-[#6b7280]">
              Rp {Math.round(profit.cost).toLocaleString("id-ID")}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-[#6b7280]">Profit</p>
            <p className="mt-2 text-2xl font-bold text-green-600">
              Rp {Math.round(profit.profit).toLocaleString("id-ID")}
            </p>
          </Card>
        </div>
      </section>

      {/* Bestsellers */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#1a1a2e]">Top 10 Bestsellers (Bulan Ini)</h2>
        <Card>
          {bestsellers.length === 0 ? (
            <p className="text-sm text-[#6b7280]">Belum ada penjualan bulan ini.</p>
          ) : (
            <ol className="space-y-2">
              {bestsellers.map((b, idx) => {
                const item = b as { id: string; count: number; brand?: string; model?: string; size?: number };
                return (
                  <li key={item.id} className="flex justify-between text-sm">
                    <span>
                      <span className="mr-2 font-bold text-[#6b7280]">#{idx + 1}</span>
                      {item.brand} {item.model} · size {item.size}
                    </span>
                    <span className="font-semibold">{item.count} unit</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </section>

      {/* Aging */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#1a1a2e]">Aging — Stok Terlama</h2>
        <div className="rounded-xl border border-[#e5e7eb] bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-[#e5e7eb] bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Produk</th>
                <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Size</th>
                <th className="px-4 py-3 text-right font-medium text-[#6b7280]">Stok</th>
                <th className="px-4 py-3 text-right font-medium text-[#6b7280]">HPP</th>
                <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Masuk Pertama</th>
                <th className="px-4 py-3 text-right font-medium text-[#6b7280]">Usia (hari)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5e7eb]">
              {(aging as Record<string, unknown>[]).map((p) => {
                const firstInbound = p.first_inbound_at as string | null;
                const ageDays = firstInbound
                  ? Math.floor((Date.now() - new Date(firstInbound).getTime()) / (1000 * 60 * 60 * 24))
                  : null;
                return (
                  <tr key={p.id as string} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{p.brand as string} {p.model as string}</td>
                    <td className="px-4 py-3">{String(p.size)}</td>
                    <td className="px-4 py-3 text-right">{String(p.quantity)}</td>
                    <td className="px-4 py-3 text-right text-[#6b7280]">Rp {Number(p.hpp).toLocaleString("id-ID")}</td>
                    <td className="px-4 py-3 text-[#6b7280]">
                      {firstInbound ? new Date(firstInbound).toLocaleDateString("id-ID") : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {ageDays !== null ? `${ageDays} hari` : "—"}
                    </td>
                  </tr>
                );
              })}
              {aging.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[#6b7280]">
                    Tidak ada data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
