import { getSuppliers } from "@/lib/queries";
import { InboundClient } from "@/components/inbound/inbound-client";

export default async function InboundPage() {
  const suppliers = await getSuppliers();
  return <InboundClient suppliers={suppliers as { id: string; name: string }[]} />;
}
