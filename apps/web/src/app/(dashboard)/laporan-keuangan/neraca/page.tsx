import { getAccountBalances } from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { NeracaClient } from "@/components/laporan-keuangan/neraca-client";
import { redirect } from "next/navigation";
import { canSeeFinancialDashboard } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";

export const dynamic = "force-dynamic";

export default async function NeracaPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const roles = (profile.roles ?? []) as Role[];
  if (!canSeeFinancialDashboard(roles)) redirect("/workspace");

  const sp = await searchParams;
  const to = sp.to ?? new Date().toISOString().slice(0, 10);

  const [balances, ytdBalances] = await Promise.all([
    getAccountBalances({ to }),
    getAccountBalances({ from: `${to.slice(0, 4)}-01-01`, to }),
  ]);
  const idsWithChildren = new Set(
    ytdBalances.map((account) => account.parent_id).filter(Boolean) as string[],
  );
  const sumLeaves = (type: "revenue" | "cogs" | "expense") =>
    ytdBalances
      .filter(
        (account) =>
          account.type === type && !idsWithChildren.has(account.account_id),
      )
      .reduce((sum, account) => sum + account.balance, 0);
  const ytdNetIncome =
    sumLeaves("revenue") - sumLeaves("cogs") - sumLeaves("expense");

  return (
    <NeracaClient
      initialBalances={balances}
      initialTo={to}
      initialNetIncome={ytdNetIncome}
    />
  );
}
