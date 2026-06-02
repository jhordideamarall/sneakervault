import { getCurrentUser } from "@/lib/actions/auth";
import { getFiscalPeriods } from "@/lib/queries";
import { FiscalPeriodsClient } from "@/components/buku-besar/fiscal-periods-client";

export const dynamic = "force-dynamic";

export default async function FiscalPeriodsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const year = Number(sp.year ?? new Date().getFullYear());
  const [profile, periods] = await Promise.all([
    getCurrentUser(),
    getFiscalPeriods(year),
  ]);
  const roles = profile?.roles ?? [];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">
          Lock Periode / Tutup Buku
        </h1>
        <p className="mt-1 text-sm text-white/45">
          Tutup bulan akuntansi agar transaksi lama tidak berubah tanpa audit.
        </p>
      </div>
      <FiscalPeriodsClient
        periods={periods}
        year={year}
        canReopen={roles.includes("owner")}
      />
    </div>
  );
}
