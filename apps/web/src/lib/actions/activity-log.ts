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
  const { error } = await supabase.from("activity_logs").insert({
    user_id: params.user_id,
    action: params.action,
    entity_type: params.entity_type,
    entity_id: params.entity_id ?? null,
    old_data: params.old_data ?? null,
    new_data: params.new_data ?? null,
  });

  if (error) {
    // The business mutation may already be committed, so throwing here would
    // mislead the operator into retrying it. Surface the audit failure in
    // server logs for alerting/investigation without logging sensitive payloads.
    console.error("[activity-log] Gagal mencatat aktivitas", {
      code: error.code,
      action: params.action,
      entityType: params.entity_type,
      entityId: params.entity_id ?? null,
    });
    return { success: false as const, error: error.message };
  }

  return { success: true as const };
}
