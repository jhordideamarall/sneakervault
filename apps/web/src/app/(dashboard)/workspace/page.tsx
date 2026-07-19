import { getCurrentUser } from "@/lib/actions/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { primaryRole } from "@/lib/auth-helpers";
import { Greeting } from "@/components/dashboard/greeting";
import { WorkspaceSubtitle } from "@/components/dashboard/workspace-subtitle";
import { getBestsellers, getMonthlyProfitTrend, getMonthlySales, getStockByBrand } from "@/lib/queries";
import { RevenueChart, StockPieChart, TopProductsChart, WeeklySalesChart } from "@/components/dashboard/workspace-charts";
import { PendingActionsTable } from "@/components/dashboard/pending-actions-table";
import { RecentOrdersTable } from "@/components/dashboard/recent-orders-table";
import { canSeeFinancialDashboard } from "@/config/permissions";
import { ClientReviewWelcomeCard } from "@/components/dashboard/client-review-welcome-card";
import type { Role } from "@sneakervault/shared";
import { ArrowRight, Wallet } from "lucide-react";

const quickActions: Record<Role, { href: string; label: string }[]> = {
  owner: [
    { href: "/overview", label: "Dashboard" },
    { href: "/inventory", label: "Cek Stok" },
    { href: "/reports", label: "Laporan" },
    { href: "/settings", label: "Kelola User" },
  ],
  admin_gudang: [
    { href: "/inbound", label: "Scan Barang Masuk" },
    { href: "/inventory", label: "Cek Stok" },
    { href: "/suppliers", label: "Supplier" },
    { href: "/returns", label: "Verifikasi Retur" },
  ],
  admin_online: [
    { href: "/orders", label: "Update Status Order" },
    { href: "/returns", label: "Proses Retur" },
    { href: "/sold", label: "Riwayat Terjual" },
    { href: "/inventory", label: "Cek Stok" },
  ],
  shopkeeper: [
    { href: "/outbound", label: "Buat Sesi Packing" },
    { href: "/orders", label: "Lihat Orders" },
    { href: "/inventory", label: "Cek Stok" },
  ],
  finance: [
    { href: "/overview", label: "Dashboard Finansial" },
    { href: "/reports", label: "Laporan Keuangan" },
    { href: "/sold", label: "Riwayat Penjualan" },
    { href: "/inventory", label: "Cek Stok" },
  ],
};

export default async function WorkspacePage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const role = primaryRole(profile.roles);
  const actions = quickActions[role];
  const roles = (profile.roles ?? []) as Role[];
  const hasFinanceAccess = canSeeFinancialDashboard(roles);

  return (
    <div className="space-y-8">
      <div>
        <Greeting name={profile.full_name} />
        <WorkspaceSubtitle role={role} userId={profile.id} />
      </div>

      <ClientReviewWelcomeCard roles={roles} userId={profile.id} />

      {/* Finance Command Center — prominent CTA for owner & finance */}
      {hasFinanceAccess && (
        <Link
          href="/finance"
          className="group relative block overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-emerald-500/[0.08] via-white/[0.02] to-sky-500/[0.06] p-6 transition-all hover:border-white/[0.14] hover:from-emerald-500/[0.12] hover:to-sky-500/[0.1]"
        >
          {/* Decorative glow */}
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl transition-opacity group-hover:opacity-80" />

          <div className="relative flex items-center gap-5">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.08] text-emerald-300 shadow-lg">
              <Wallet size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/60">
                  Financial Command Center
                </span>
              </div>
              <h2 className="text-lg font-semibold text-white">
                Keuangan &amp; Akuntansi
              </h2>
              <p className="mt-0.5 text-sm text-white/60">
                Revenue bulan ini, profit MTD, nilai stok, dan roadmap akuntansi
                lengkap. Halaman khusus — fokus tanpa gangguan.
              </p>
            </div>
            <div className="flex-shrink-0 text-white/40 transition-all group-hover:translate-x-1 group-hover:text-white/80">
              <ArrowRight size={20} />
            </div>
          </div>
        </Link>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-5 py-4 text-sm font-medium text-white/70 shadow-[0_2px_8px_rgba(0,0,0,0.3)] transition-all hover:bg-white/[0.06] hover:border-white/[0.14] hover:text-white/90 hover:shadow-[0_4px_12px_rgba(0,0,0,0.4)] active:scale-[0.98]"
          >
            {action.label}
          </Link>
        ))}
      </div>

      {role === "owner" && (
        <Suspense fallback={<ChartsSkeleton />}>
          <OwnerCharts />
        </Suspense>
      )}

      {role === "owner" && (
        <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-white/[0.03]" />}>
          <PendingActionsTable />
        </Suspense>
      )}

      {role === "owner" && (
        <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-white/[0.03]" />}>
          <RecentOrdersTable />
        </Suspense>
      )}
    </div>
  );
}

async function OwnerCharts() {
  const [stockByBrand, bestsellers, salesData, revenueData] = await Promise.all([
    getStockByBrand(),
    getBestsellers(5),
    getMonthlySales(),
    getMonthlyProfitTrend(6),
  ]);

  const topProducts = bestsellers.map((b) => ({ name: `${b.brand} ${b.model}`, count: b.count }));
  const weeklySales = (salesData.weeks as { week: string; terjual: number }[]).slice(-12);

  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
      <RevenueChart data={revenueData} />
      <StockPieChart data={stockByBrand} />
      <WeeklySalesChart data={weeklySales} />
      <TopProductsChart data={topProducts} />
    </div>
  );
}

function ChartsSkeleton() {
  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 animate-pulse">
      <div className="h-[300px] rounded-2xl bg-white/[0.03]" />
      <div className="h-[300px] rounded-2xl bg-white/[0.03]" />
      <div className="h-[300px] rounded-2xl bg-white/[0.03]" />
      <div className="h-[300px] rounded-2xl bg-white/[0.03]" />
    </div>
  );
}
