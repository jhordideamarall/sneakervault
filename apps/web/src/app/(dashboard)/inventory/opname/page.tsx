import {
  getCurrentUser,
} from "@/lib/actions/auth";
import {
  getStockOpnameDetail,
  getStockOpnameSessions,
} from "@/lib/queries";
import { StockOpnameClient } from "@/components/inventory/stock-opname-client";

export const dynamic = "force-dynamic";

export default async function StockOpnamePage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const sp = await searchParams;
  const [profile, sessions, detail] = await Promise.all([
    getCurrentUser(),
    getStockOpnameSessions(),
    sp.session ? getStockOpnameDetail(sp.session) : Promise.resolve(null),
  ]);

  const roles = profile?.roles ?? [];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Stock Opname</h1>
        <p className="mt-1 text-sm text-white/45">
          Cycle count stok fisik, hitung selisih, lalu approve untuk adjustment stok dan jurnal.
        </p>
      </div>
      <StockOpnameClient
        sessions={sessions}
        detail={detail}
        canApprove={roles.includes("owner")}
      />
    </div>
  );
}
