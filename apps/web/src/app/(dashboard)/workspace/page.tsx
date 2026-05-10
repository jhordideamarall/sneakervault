import { getCurrentUser } from "@/lib/actions/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { primaryRole } from "@/lib/auth-helpers";
import { Greeting } from "@/components/dashboard/greeting";
import { WorkspaceSubtitle } from "@/components/dashboard/workspace-subtitle";
import { getBestsellers, getMonthlySales, getStockByBrand, getProfitReport } from "@/lib/queries";
import { RevenueChart, StockPieChart, TopProductsChart, WeeklySalesChart } from "@/components/dashboard/workspace-charts";
import { PendingActionsTable } from "@/components/dashboard/pending-actions-table";
import { RecentOrdersTable } from "@/components/dashboard/recent-orders-table";
import type { Role } from "@sneakervault/shared";

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
};

export default async function WorkspacePage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const role = primaryRole(profile.roles);
  const actions = quickActions[role];

  return (
    <div className="space-y-8">
      <div>
        <Greeting name={profile.full_name} />
        <WorkspaceSubtitle role={role} userId={profile.id} />
      </div>

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
  const [stockByBrand, bestsellers, salesData] = await Promise.all([
    getStockByBrand(),
    getBestsellers(5),
    getMonthlySales(),
  ]);

  // Build monthly revenue/profit from last 6 months
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const now = new Date();
  const revenueData: { month: string; revenue: number; profit: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const from = d.toISOString();
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString();
    const report = await getProfitReport(from, to);
    revenueData.push({ month: months[d.getMonth()]!, revenue: report.revenue, profit: report.profit });
  }

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
