import { listUsers } from "@/lib/actions/users";
import { getCurrentUser } from "@/lib/actions/auth";
import { redirect } from "next/navigation";
import { SettingsClient } from "@/components/settings/settings-client";
import { ProfileSettings } from "@/components/settings/profile-settings";

export default async function SettingsPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const isOwner = (profile.roles as string[])?.includes("owner");
  const users = isOwner ? await listUsers() : [];

  return (
    <div className="space-y-10">
      <ProfileSettings profile={{ id: profile.id, full_name: profile.full_name ?? "", email: profile.email ?? "", avatar_url: profile.avatar_url ?? null }} />
      {isOwner && <SettingsClient users={users as Parameters<typeof SettingsClient>[0]["users"]} />}
    </div>
  );
}
