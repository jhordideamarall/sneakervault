import {
  getPurchaseOrdersForReceiving,
  getPurchaseOrderById,
} from "@/lib/queries";
import type { PoDetail } from "@/lib/queries";
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
  const detailEntries = await Promise.all(
    receivablePos.map(async (p) => {
      const d = await getPurchaseOrderById(p.id);
      return [p.id, d] as const;
    }),
  );
  const detailById: Record<string, PoDetail> = {};
  for (const [id, d] of detailEntries) if (d) detailById[id] = d;

  return (
    <PenerimaanClient
      receivablePos={receivablePos}
      detailById={detailById}
      roles={roles as string[]}
    />
  );
}
