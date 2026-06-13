import { getSuppliers } from "@/lib/queries";
import { SuppliersClient } from "@/components/suppliers/suppliers-client";

export default async function SuppliersPage() {
  const suppliers = await getSuppliers();
  
  return (
    <SuppliersClient
      initialSuppliers={suppliers as Parameters<typeof SuppliersClient>[0]["initialSuppliers"]}
    />
  );
}
