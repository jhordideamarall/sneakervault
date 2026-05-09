import { listUsers } from "@/lib/actions/users";
import { SettingsClient } from "@/components/settings/settings-client";

export default async function SettingsPage() {
  const users = await listUsers();
  return <SettingsClient users={users as Parameters<typeof SettingsClient>[0]["users"]} />;
}
