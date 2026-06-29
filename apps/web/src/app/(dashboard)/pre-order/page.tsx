import { redirect } from "next/navigation";
import { PreOrderClient } from "@/components/pre-order/pre-order-client";
import { getCurrentUser } from "@/lib/actions/auth";
import { getPreOrders, getProductsForSalesPicker, getSuppliers } from "@/lib/queries";
import { hasRouteAccess } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";

export const dynamic = "force-dynamic";

export default async function PreOrderPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const roles = (profile.roles ?? []) as Role[];
  if (!hasRouteAccess("/pre-order", roles)) redirect("/workspace");

  const [preOrders, products, suppliers] = await Promise.all([
    getPreOrders(),
    getProductsForSalesPicker(),
    getSuppliers(),
  ]);

  return (
    <PreOrderClient
      preOrders={preOrders}
      products={products}
      suppliers={suppliers as { id: string; name: string }[]}
      roles={roles}
    />
  );
}
