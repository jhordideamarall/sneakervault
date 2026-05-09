import { getDeleteRequests } from "@/lib/queries";
import { DeleteRequestsClient } from "@/components/delete-requests/delete-requests-client";

export default async function DeleteRequestsPage() {
  const requests = await getDeleteRequests();
  return (
    <DeleteRequestsClient
      requests={requests as Parameters<typeof DeleteRequestsClient>[0]["requests"]}
    />
  );
}
