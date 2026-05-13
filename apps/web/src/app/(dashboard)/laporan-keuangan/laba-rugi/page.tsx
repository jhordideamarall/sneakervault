import { getAccountBalances } from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { LabaRugiClient } from "@/components/laporan-keuangan/laba-rugi-client";
import { redirect } from "next/navigation";
import { canSeeFinancialDashboard } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";

export const dynamic = "force-dynamic";

export default async function LabaRugiPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const roles = (profile.roles ?? []) as Role[];
  if (!canSeeFinancialDashboard(roles)) redirect("/workspace");

  const sp = await searchParams;
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const defaultTo = now.toISOString().slice(0, 10);
  const from = sp.from ?? defaultFrom;
  const to = sp.to ?? defaultTo;

  const balances = await getAccountBalances({ from, to });

  return (
    <LabaRugiClient
      initialBalances={balances}
      initialFrom={from}
      initialTo={to}
    />
  );
}
