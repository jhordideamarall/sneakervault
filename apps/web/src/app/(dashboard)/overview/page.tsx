import { getDashboardStats, getBestsellers, getMonthlySales } from "@/lib/queries";
import { EmptyState } from "@/components/ui/page-layout";
import { AlertTriangle } from "lucide-react";
import { SearchBar } from "@/components/dashboard/search-bar";
import { SalesChart } from "@/components/dashboard/sales-chart";

export default async function OverviewPage() {
  const [stats, bestsellers, monthlySales] = await Promise.all([
    getDashboardStats(),
    getBestsellers(5),
    getMonthlySales(),
  ]);

  return (
    <div className="space-y-8">
      {/* Search bar */}
      <SearchBar />

      <p className="text-base text-white/50">Ringkasan kondisi gudang dan penjualan</p>

      {/* Best Seller Cards */}
      <div className="grid gap-5 grid-cols-3">
        {(() => {
          const top3 = (bestsellers as { id: string; count: number; brand?: string; model?: string; image_url?: string }[]).slice(0, 3);
          const fallback = "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600&q=80";
          return top3.map((item, idx) => (
            <div key={item.id} className="relative h-[calc(100vh/3)] rounded-2xl overflow-hidden border border-white/[0.06] group">
              <img src={item.image_url || fallback} alt={item.brand} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute top-4 left-4 rounded-lg bg-white/[0.15] backdrop-blur-sm px-3 py-1.5 border border-white/[0.1]">
                <span className="text-xs font-bold text-white">TOP {idx + 1}</span>
              </div>
              <div className="absolute bottom-6 left-6 right-6">
                <p className="text-xl font-bold text-white">{item.brand}</p>
                <p className="text-sm text-white/70 mt-0.5">{item.model}</p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="rounded-lg bg-white/[0.12] px-2.5 py-1 text-xs font-semibold text-white">{item.count} terjual</span>
                  <span className="text-xs text-white/40">bulan ini</span>
                </div>
              </div>
            </div>
          ));
        })()}
      </div>

      {/* Alert */}
      {stats.pendingReturns > 0 && (
        <div className="flex items-center gap-4 rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] px-6 py-4">
          <AlertTriangle size={20} className="text-amber-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-300">
              {stats.pendingReturns} retur menunggu verifikasi
            </p>
            <p className="text-xs text-amber-400/60">Buka halaman Retur untuk verifikasi fisik barang</p>
          </div>
        </div>
      )}

      {/* Sales Chart */}
      <SalesChart data={monthlySales as { week: string; terjual: number; nike: number; adidas: number; nb: number }[]} />
    </div>
  );
}
