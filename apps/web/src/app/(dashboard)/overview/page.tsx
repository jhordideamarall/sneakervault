import { getDashboardStats, getBestsellers } from "@/lib/queries";
import { Card } from "@sneakervault/ui";
import { EmptyState } from "@/components/ui/page-layout";
import { TrendingUp, AlertTriangle, Search } from "lucide-react";

export default async function OverviewPage() {
  const [stats, bestsellers] = await Promise.all([
    getDashboardStats(),
    getBestsellers(5),
  ]);

  return (
    <div className="space-y-8">
      {/* Search bar */}
      <div className="max-w-[50%]">
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/25" />
          <input
            type="text"
            placeholder="Cari produk, order, atau barcode..."
            className="w-full rounded-2xl border border-white/[0.06] bg-white/[0.03] py-3.5 pl-12 pr-5 text-sm text-white/80 placeholder:text-white/25 focus:border-white/[0.12] focus:bg-white/[0.05] focus:outline-none focus:ring-1 focus:ring-white/[0.08] transition-all duration-300"
          />
        </div>
      </div>

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
        <div className="flex items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-4">
          <AlertTriangle size={20} className="text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {stats.pendingReturns} retur menunggu verifikasi
            </p>
            <p className="text-xs text-amber-600">Buka halaman Retur untuk verifikasi fisik barang</p>
          </div>
        </div>
      )}

      {/* Bestsellers */}
      <Card>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
            <TrendingUp size={18} className="text-emerald-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Bestsellers</h2>
            <p className="text-xs text-gray-400">Produk paling laku bulan ini</p>
          </div>
        </div>

        {bestsellers.length === 0 ? (
          <EmptyState
            title="Belum ada penjualan"
            description="Data bestseller akan muncul setelah ada barang terjual bulan ini"
          />
        ) : (
          <div className="space-y-4">
            {bestsellers.map((b, idx) => {
              const item = b as { id: string; count: number; brand?: string; model?: string; size?: number };
              return (
                <div key={item.id} className="flex items-center gap-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-100 text-sm font-bold text-gray-600">
                    {idx + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">
                      {item.brand} {item.model}
                    </p>
                    <p className="text-xs text-gray-400">Size {item.size}</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 px-3 py-1">
                    <span className="text-sm font-bold text-emerald-700">{item.count}</span>
                    <span className="ml-1 text-xs text-emerald-600">terjual</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
