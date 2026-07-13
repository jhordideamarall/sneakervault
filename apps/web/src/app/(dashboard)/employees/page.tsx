import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth";
import { canSeeFinancialDashboard } from "@/config/permissions";
import { getEmployees } from "@/lib/queries";
import { EmployeesClient } from "@/components/employees/employees-client";
import type { Role } from "@sneakervault/shared";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");
  const roles = (profile.roles ?? []) as Role[];
  if (!canSeeFinancialDashboard(roles)) redirect("/workspace");
  const employees = await getEmployees({ includeInactive: true });
  return (
    <div className="p-6">
      <EmployeesClient employees={employees} />
    </div>
  );
}
