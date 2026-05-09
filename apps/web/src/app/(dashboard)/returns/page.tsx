import { getReturns, getReturnableItems } from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { ReturnsClient } from "@/components/returns/returns-client";

export default async function ReturnsPage() {
  const [profile, returns, items] = await Promise.all([
    getCurrentUser(),
    getReturns(),
    getReturnableItems(),
  ]);
  const roles = (profile?.roles ?? []) as string[];
  return (
    <ReturnsClient
      returns={returns as Parameters<typeof ReturnsClient>[0]["returns"]}
      returnableItems={items as Parameters<typeof ReturnsClient>[0]["returnableItems"]}
      roles={roles}
    />
  );
}
