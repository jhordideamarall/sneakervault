import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth";
import { canSeeFinancialDashboard } from "@/config/permissions";
import { getBankAccounts, getEmployees, getPayrollRuns } from "@/lib/queries";
import { PayrollClient } from "@/components/payroll/payroll-client";
import type { Role } from "@sneakervault/shared";

export const dynamic = "force-dynamic";

export default async function PayrollPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");
  const roles = (profile.roles ?? []) as Role[];
  if (!canSeeFinancialDashboard(roles)) redirect("/workspace");
  const [employees, bankAccounts, runs] = await Promise.all([
    getEmployees(),
    getBankAccounts({ includeInactive: true }),
    getPayrollRuns(),
  ]);
  return (
    <div className="p-6">
      <PayrollClient employees={employees} bankAccounts={bankAccounts} runs={runs} />
    </div>
  );
}
