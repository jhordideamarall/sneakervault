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

  // Preload detail only for top N most-recent POs (orders already sorted by created_at DESC).
  // Older POs lazy-load via server action `loadPoDetailAction` when user clicks view/edit.
  // This caps N+1 cost — page load stays fast as PO history grows.
  const PRELOAD_LIMIT = 30;
  const ordersToPreload = orders.slice(0, PRELOAD_LIMIT);
  const detailEntries = await Promise.all(
    ordersToPreload.map(async (o) => {
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
