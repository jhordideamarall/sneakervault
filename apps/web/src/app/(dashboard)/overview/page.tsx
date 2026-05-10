import { Suspense } from "react";
import { getAvailableMonths } from "@/lib/queries";
import { SearchBar } from "@/components/dashboard/search-bar";
import { MonthFilter } from "@/components/dashboard/month-filter";
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

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: selectedMonth } = await searchParams;
  const availableMonths = await getAvailableMonths();
  const profile = await getCurrentUser();

  return (
    <div className="space-y-8">
      {/* Search & Filter Bar */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <SearchBar />
        </div>
        {profile && <OnlineUsers userId={profile.id} />}
        <MonthFilter availableMonths={availableMonths} currentValue={selectedMonth} />
      </div>

      <p className="text-base text-white/50">
        {selectedMonth 
          ? `Detail kondisi gudang dan penjualan bulan ${availableMonths.find(m => m.value === selectedMonth)?.label}`
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
      <Suspense fallback={<ChartSkeleton />}>
        <ChartSection selectedMonth={selectedMonth} />
      </Suspense>

      {/* Financial Summary Table - Streamed */}
      <Suspense fallback={<TableSkeleton />}>
        <FinancialTableSection selectedMonth={selectedMonth} />
      </Suspense>
    </div>
  );
}
