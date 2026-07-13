import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth";
import { canSeeFinancialDashboard } from "@/config/permissions";
import { getBankAccounts, getFixedAssets } from "@/lib/queries";
import { FixedAssetsClient } from "@/components/fixed-assets/fixed-assets-client";
import type { Role } from "@sneakervault/shared";

export const dynamic = "force-dynamic";

export default async function AsetPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");
  const roles = (profile.roles ?? []) as Role[];
  if (!canSeeFinancialDashboard(roles)) redirect("/workspace");
  const [assets, bankAccounts] = await Promise.all([
    getFixedAssets(),
    getBankAccounts({ includeInactive: false }),
  ]);
  return (
    <div className="p-6">
      <FixedAssetsClient assets={assets} bankAccounts={bankAccounts} />
    </div>
  );
}
