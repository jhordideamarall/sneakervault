import { getPackingSessions } from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { OrdersClient } from "@/components/orders/orders-client";

export default async function OrdersPage() {
  const [profile, sessionsRes] = await Promise.all([
    getCurrentUser(),
    getPackingSessions(),
  ]);
  const roles = (profile?.roles ?? []) as string[];
  return (
    <OrdersClient
      sessions={sessionsRes.data as Parameters<typeof OrdersClient>[0]["sessions"]}
      roles={roles}
    />
  );
}
