import { getBankAccounts, getReturns, getReturnableItems } from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { ReturnsClient } from "@/components/returns/returns-client";

export default async function ReturnsPage() {
  const profile = await getCurrentUser();
  const roles = (profile?.roles ?? []) as string[];
  const canSettleRefund = roles.includes("owner") || roles.includes("finance");
  const [returns, items, bankAccounts] = await Promise.all([
    getReturns(),
    getReturnableItems(),
    canSettleRefund ? getBankAccounts() : Promise.resolve([]),
  ]);
  return (
    <ReturnsClient
      returns={returns as Parameters<typeof ReturnsClient>[0]["returns"]}
      returnableItems={items as Parameters<typeof ReturnsClient>[0]["returnableItems"]}
      bankAccounts={bankAccounts}
      roles={roles}
    />
  );
}
