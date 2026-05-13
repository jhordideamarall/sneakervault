import {
  getPurchaseOrders,
  getPurchaseOrderById,
  getSuppliers,
  getProductsForPicker,
  getBankAccounts,
} from "@/lib/queries";
import type { PoDetail } from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { PurchaseOrderClient } from "@/components/pembelian/po-client";
import { redirect } from "next/navigation";
import { canSeeFinancialDashboard } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";

export const dynamic = "force-dynamic";

export default async function PurchaseOrderPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const roles = (profile.roles ?? []) as Role[];
  if (!canSeeFinancialDashboard(roles) && !roles.includes("admin_gudang")) {
    redirect("/workspace");
  }

  const [orders, suppliers, products, bankAccounts] = await Promise.all([
    getPurchaseOrders(),
    getSuppliers(),
    getProductsForPicker(),
    getBankAccounts({ includeInactive: false }),
  ]);

  // Preload detail for each PO (so view/edit modal can open instantly).
  // For larger volume, switch to lazy-load via separate route or RPC.
  const detailEntries = await Promise.all(
    orders.map(async (o) => {
      const d = await getPurchaseOrderById(o.id);
      return [o.id, d] as const;
    }),
  );
  const detailById: Record<string, PoDetail> = {};
  for (const [id, d] of detailEntries) {
    if (d) detailById[id] = d;
  }

  return (
    <PurchaseOrderClient
      orders={orders}
      suppliers={suppliers as { id: string; name: string }[]}
      products={products}
      bankAccounts={bankAccounts}
      roles={roles as string[]}
      detailById={detailById}
    />
  );
}
