import { getBankAccounts } from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { BankAccountsClient } from "@/components/kas-bank/bank-accounts-client";
import { redirect } from "next/navigation";
import { canSeeFinancialDashboard } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";

export const dynamic = "force-dynamic";

export default async function AkunBankPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const roles = (profile.roles ?? []) as Role[];
  if (!canSeeFinancialDashboard(roles)) redirect("/workspace");

  const accounts = await getBankAccounts({ includeInactive: true });
  return <BankAccountsClient accounts={accounts} roles={roles as string[]} />;
}
