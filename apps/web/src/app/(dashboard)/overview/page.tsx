import { Suspense } from "react";
import { SearchBar } from "@/components/dashboard/search-bar";
import { OnlineUsers } from "@/components/dashboard/overview/online-users";
import { getCurrentUser } from "@/lib/actions/auth";
import { 
  WarehouseConditionSection,
  ConditionSkeleton,
  BestsellerSection, 
  BestsellerSkeleton, 
  AlertSection, 
  ChartSection, 
  ChartSkeleton, 
  FinancialTableSection, 
  TableSkeleton 
} from "@/components/dashboard/overview-components";

export const dynamic = "force-dynamic";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const profile = await getCurrentUser();

  // Derive selected month from params for chart/table filtering
  const selectedMonth = sp.date
    ? sp.date.slice(0, 7) // "2026-05-11" → "2026-05"
    : sp.month ?? undefined;

  // Key to force re-render when filter changes
  const filterKey = sp.date || sp.month || "all";

  return (
    <div className="space-y-8">
      {/* Search Bar */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <SearchBar />
        </div>
        {profile && <OnlineUsers userId={profile.id} />}
      </div>

      <p className="text-base text-white/50">
        {sp.date
          ? `Data tanggal ${new Date(sp.date).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`
          : "Ringkasan kondisi gudang dan penjualan"
        }
      </p>

      {/* Warehouse Condition - Streamed */}
      <Suspense fallback={<ConditionSkeleton />}>
        <WarehouseConditionSection />
      </Suspense>

      {/* Best Seller Cards - Streamed */}
      <Suspense fallback={<BestsellerSkeleton />}>
        <BestsellerSection />
      </Suspense>

      {/* Alert - Streamed */}
      <Suspense fallback={null}>
        <AlertSection />
      </Suspense>

      {/* Sales Chart - Streamed */}
      <Suspense key={`chart-${filterKey}`} fallback={<ChartSkeleton />}>
        <ChartSection selectedMonth={selectedMonth} selectedDate={sp.date} />
      </Suspense>

      {/* Financial Summary Table - Streamed */}
      <Suspense key={`table-${filterKey}`} fallback={<TableSkeleton />}>
        <FinancialTableSection selectedMonth={selectedMonth} selectedDate={sp.date} />
      </Suspense>
    </div>
  );
}
