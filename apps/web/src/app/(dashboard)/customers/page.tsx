import { getCustomers } from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { CustomersClient } from "@/components/customers/customers-client";
import { redirect } from "next/navigation";
import { canSeeFinancialDashboard } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const roles = (profile.roles ?? []) as Role[];
  const canAccess =
    canSeeFinancialDashboard(roles) || roles.includes("admin_online");
  if (!canAccess) redirect("/workspace");

  const customers = await getCustomers({ includeInactive: true });

  return <CustomersClient customers={customers} roles={roles as string[]} />;
}
