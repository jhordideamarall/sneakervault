import {
  getBankTransactions,
  getBankAccounts,
  getCoaAccountOptions,
} from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { MutasiBankClient } from "@/components/kas-bank/mutasi-client";
import { redirect } from "next/navigation";
import { canSeeFinancialDashboard } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";

export const dynamic = "force-dynamic";

export default async function MutasiBankPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const roles = (profile.roles ?? []) as Role[];
  if (!canSeeFinancialDashboard(roles)) redirect("/workspace");

  const [transactions, bankAccounts, accountOptions] = await Promise.all([
    getBankTransactions({ limit: 500 }),
    getBankAccounts({ includeInactive: true }),
    getCoaAccountOptions(),
  ]);

  return (
    <MutasiBankClient
      transactions={transactions}
      bankAccounts={bankAccounts}
      accountOptions={accountOptions}
      roles={roles as string[]}
    />
  );
}
