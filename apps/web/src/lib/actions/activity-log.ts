"use server";

import { createClient } from "@sneakervault/supabase/server";

export async function logActivity(params: {
  user_id: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  old_data?: unknown;
  new_data?: unknown;
}) {
  const supabase = await createClient();
  await supabase.from("activity_logs").insert({
    user_id: params.user_id,
    action: params.action,
    entity_type: params.entity_type,
    entity_id: params.entity_id ?? null,
    old_data: params.old_data ?? null,
    new_data: params.new_data ?? null,
  });
}
