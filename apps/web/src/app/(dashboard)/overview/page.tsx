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

export default async function OverviewPage() {
  const profile = await getCurrentUser();

  return (
    <div className="space-y-8">
      {/* Search Bar */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <SearchBar />
        </div>
        {profile && <OnlineUsers userId={profile.id} />}
      </div>

      <p className="text-base text-white/50">Ringkasan kondisi gudang dan penjualan</p>

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
        <ChartSection />
      </Suspense>

      {/* Financial Summary Table - Streamed */}
      <Suspense fallback={<TableSkeleton />}>
        <FinancialTableSection />
      </Suspense>
    </div>
  );
}
