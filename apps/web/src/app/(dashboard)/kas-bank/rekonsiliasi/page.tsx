import { getBankAccounts } from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { RekonsiliasiClient } from "@/components/kas-bank/rekonsiliasi-client";
import { redirect } from "next/navigation";
import { canSeeFinancialDashboard } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";

export const dynamic = "force-dynamic";

export default async function RekonsiliasiBankPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const roles = (profile.roles ?? []) as Role[];
  if (!canSeeFinancialDashboard(roles)) redirect("/workspace");

  const bankAccounts = await getBankAccounts();

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Rekonsiliasi Bank
        </h1>
        <p className="text-white/50">
          Cocokkan mutasi rekening koran real dengan catatan internal sistem.
        </p>
      </div>

      <RekonsiliasiClient bankAccounts={bankAccounts} />
    </div>
  );
}
