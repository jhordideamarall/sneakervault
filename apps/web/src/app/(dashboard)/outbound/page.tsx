import { OutboundClient } from "@/components/outbound/outbound-client";
import { getUnfinishedPackingSessions } from "@/lib/queries";

export default async function OutboundPage() {
  const unfinishedSessions = await getUnfinishedPackingSessions();
  return (
    <OutboundClient
      unfinishedSessions={
        unfinishedSessions as Parameters<typeof OutboundClient>[0]["unfinishedSessions"]
      }
    />
  );
}
