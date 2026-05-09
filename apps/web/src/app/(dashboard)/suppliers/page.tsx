import { getSuppliers } from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { SuppliersClient } from "@/components/suppliers/suppliers-client";

export default async function SuppliersPage() {
  const [profile, suppliers] = await Promise.all([
    getCurrentUser(),
    getSuppliers(),
  ]);
  const roles = (profile?.roles ?? []) as string[];
  return (
    <SuppliersClient
      suppliers={suppliers as Parameters<typeof SuppliersClient>[0]["suppliers"]}
      roles={roles}
    />
  );
}
