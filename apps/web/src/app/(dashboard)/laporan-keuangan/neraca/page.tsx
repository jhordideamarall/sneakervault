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

  const balances = await getAccountBalances({ to });

  return <NeracaClient initialBalances={balances} initialTo={to} />;
}
