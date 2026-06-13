import { getPurchaseOrdersForReceiving } from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { PenerimaanClient } from "@/components/pembelian/penerimaan-client";
import { redirect } from "next/navigation";
import { canSeeFinancialDashboard } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";

export const dynamic = "force-dynamic";

export default async function PenerimaanPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const roles = (profile.roles ?? []) as Role[];
  const canAccess =
    canSeeFinancialDashboard(roles) || roles.includes("admin_gudang");
  if (!canAccess) redirect("/workspace");

  const receivablePos = await getPurchaseOrdersForReceiving();

  return (
    <PenerimaanClient
      receivablePos={receivablePos}
      detailById={{}}
      roles={roles as string[]}
    />
  );
}
