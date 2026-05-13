import { getAccountLedger } from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { AccountLedgerClient } from "@/components/buku-besar/account-ledger-client";
import { redirect, notFound } from "next/navigation";
import { canSeeFinancialDashboard } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";

export const dynamic = "force-dynamic";

export default async function AccountLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const roles = (profile.roles ?? []) as Role[];
  if (!canSeeFinancialDashboard(roles)) redirect("/workspace");

  const { id } = await params;
  const sp = await searchParams;

  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
  const defaultTo = now.toISOString().slice(0, 10);
  const from = sp.from ?? defaultFrom;
  const to = sp.to ?? defaultTo;

  const result = await getAccountLedger({ account_id: id, from, to });
  if (!result.account) notFound();

  return (
    <AccountLedgerClient
      result={result}
      initialFrom={from}
      initialTo={to}
    />
  );
}
