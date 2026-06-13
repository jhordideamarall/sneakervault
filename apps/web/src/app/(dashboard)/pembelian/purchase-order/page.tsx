import {
  getPurchaseOrders,
  getSuppliers,
  getProductsForPicker,
  getBankAccounts,
} from "@/lib/queries";
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

  return (
    <PurchaseOrderClient
      orders={orders}
      suppliers={suppliers as { id: string; name: string }[]}
      products={products}
      bankAccounts={bankAccounts}
      roles={roles as string[]}
      detailById={{}}
    />
  );
}
