import { getJournalEntries, getChartOfAccounts } from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { JournalClient } from "@/components/buku-besar/journal-client";
import { redirect } from "next/navigation";
import { canSeeFinancialDashboard } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const roles = (profile.roles ?? []) as Role[];
  if (!canSeeFinancialDashboard(roles)) redirect("/workspace");

  const [entries, accounts] = await Promise.all([
    getJournalEntries({ limit: 200 }),
    getChartOfAccounts(),
  ]);

  return (
    <JournalClient
      entries={entries}
      accounts={accounts}
      roles={roles as string[]}
    />
  );
}
