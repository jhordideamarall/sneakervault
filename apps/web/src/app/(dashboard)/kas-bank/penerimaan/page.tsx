import { getBankTransactions, getBankAccounts } from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { MutasiBankClient } from "@/components/kas-bank/mutasi-client";
import { redirect } from "next/navigation";
import { canSeeFinancialDashboard } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";

export const dynamic = "force-dynamic";

export default async function KasBankPenerimaanPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const roles = (profile.roles ?? []) as Role[];
  if (!canSeeFinancialDashboard(roles)) redirect("/workspace");

  const [transactions, bankAccounts] = await Promise.all([
    getBankTransactions({ limit: 500 }),
    getBankAccounts({ includeInactive: true }),
  ]);

  return (
    <MutasiBankClient
      transactions={transactions}
      bankAccounts={bankAccounts}
      roles={roles as string[]}
      defaultTypeFilter="credit"
      title="Penerimaan Kas & Bank"
      description="Semua uang masuk — penjualan, pembayaran customer, transfer masuk"
    />
  );
}
