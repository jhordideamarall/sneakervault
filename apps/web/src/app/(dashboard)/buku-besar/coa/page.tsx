import { getChartOfAccounts } from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { CoaTree } from "@/components/buku-besar/coa-tree";
import { redirect } from "next/navigation";
import { canSeeFinancialDashboard } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";

export const dynamic = "force-dynamic";

export default async function CoaPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const roles = (profile.roles ?? []) as Role[];
  if (!canSeeFinancialDashboard(roles)) redirect("/workspace");

  const accounts = await getChartOfAccounts();
  return <CoaTree accounts={accounts} />;
}
