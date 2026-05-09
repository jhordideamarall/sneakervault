import { getProducts } from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { InventoryClient } from "@/components/inventory/inventory-client";

export default async function InventoryPage() {
  const [profile, productsRes] = await Promise.all([
    getCurrentUser(),
    getProducts({ limit: 200 }),
  ]);
  const roles = (profile?.roles ?? []) as string[];
  return (
    <InventoryClient
      products={productsRes.data as Parameters<typeof InventoryClient>[0]["products"]}
      total={productsRes.total}
      roles={roles}
    />
  );
}
