import { DataSyncClient } from "@/components/settings/data-sync-client";
import { getChartOfAccounts } from "@/lib/queries";

export default async function DataSyncPage() {
  const accounts = await getChartOfAccounts();

  return <DataSyncClient accounts={accounts} />;
}

