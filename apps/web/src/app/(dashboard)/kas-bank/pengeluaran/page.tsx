import {
  getBankTransactions,
  getBankAccounts,
  getCoaAccountOptions,
  getExpenseAccountOptions,
  getExpenseCategories,
  getExpenses,
} from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { ExpensesClient } from "@/components/kas-bank/expenses-client";
import { redirect } from "next/navigation";
import type { Role } from "@sneakervault/shared";

export const dynamic = "force-dynamic";

export default async function KasBankPengeluaranPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const roles = (profile.roles ?? []) as Role[];
  const allowed = roles.some((role) =>
    ["owner", "finance", "admin_gudang", "admin_online"].includes(role),
  );
  if (!allowed) redirect("/workspace");

  const [
    expenses,
    categories,
    accountOptions,
    coaAccountOptions,
    bankAccounts,
    transactions,
  ] = await Promise.all([
    getExpenses({ limit: 500 }),
    getExpenseCategories({ includeInactive: true }),
    getExpenseAccountOptions(),
    getCoaAccountOptions(),
    getBankAccounts({ includeInactive: true }),
    getBankTransactions({ limit: 500 }),
  ]);

  return (
    <ExpensesClient
      expenses={expenses}
      categories={categories}
      accountOptions={accountOptions}
      coaAccountOptions={coaAccountOptions}
      bankAccounts={bankAccounts}
      bankTransactions={transactions}
      roles={roles as string[]}
      userId={profile.id}
    />
  );
}
