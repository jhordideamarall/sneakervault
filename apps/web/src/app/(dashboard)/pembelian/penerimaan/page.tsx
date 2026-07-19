import {
  getPurchaseOrdersForReceiving,
  getPurchaseReceipts,
} from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { PenerimaanClient } from "@/components/pembelian/penerimaan-client";
import { redirect } from "next/navigation";
import { canSeeFinancialDashboard } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";

export const dynamic = "force-dynamic";

export default async function PenerimaanPage({
  searchParams,
}: {
  searchParams: Promise<{ po?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const roles = (profile.roles ?? []) as Role[];
  const canAccess =
    canSeeFinancialDashboard(roles) || roles.includes("admin_gudang");
  if (!canAccess) redirect("/workspace");

  const [receivablePos, receipts] = await Promise.all([
    getPurchaseOrdersForReceiving(),
    getPurchaseReceipts(),
  ]);

  return (
    <PenerimaanClient
      receivablePos={receivablePos}
      receipts={receipts}
      detailById={{}}
      initialPoId={sp.po}
      initialTab={sp.tab === "history" ? "history" : "queue"}
      roles={roles as string[]}
    />
  );
}
