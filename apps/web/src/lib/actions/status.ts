"use server";

import { createClient } from "@sneakervault/supabase/server";
import { updateSessionStatusSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { notifyEvent } from "./notify";

const STATUS_TRANSITIONS: Record<string, { from: string[]; roles: string[] }> = {
  shipped: { from: ["packing"], roles: ["owner", "shopkeeper"] },
  completed: { from: ["shipped"], roles: ["owner", "admin_online"] },
  has_return: { from: ["shipped", "completed"], roles: ["owner", "admin_online"] },
};

export async function updateSessionStatus(input: unknown) {
  const profile = await requireRole(["owner", "shopkeeper", "admin_online"]);
  const parsed = updateSessionStatusSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { session_id, status } = parsed.data;
  const transition = STATUS_TRANSITIONS[status];
  if (!transition) return { error: { _form: ["Status tidak valid"] } };

  // Check role permission for this transition
  const userRoles: string[] = profile.roles ?? [];
  if (!transition.roles.some((r) => userRoles.includes(r))) {
    return { error: { _form: ["Anda tidak memiliki akses untuk mengubah ke status ini"] } };
  }

  const supabase = await createClient();
  const { data: session } = await supabase
    .from("packing_sessions")
    .select("status")
    .eq("id", session_id)
    .maybeSingle();
  if (!session) return { error: { _form: ["Sesi tidak ditemukan"] } };

  // Validate transition
  if (!transition.from.includes(session.status)) {
    return { error: { _form: [`Tidak bisa ubah dari "${session.status}" ke "${status}"`] } };
  }

  const updateData: Record<string, unknown> = {
    status,
    status_updated_by: profile.id,
    updated_at: new Date().toISOString(),
  };
  if (status === "shipped") updateData.shipped_at = new Date().toISOString();
  if (status === "completed") updateData.completed_at = new Date().toISOString();
  if (status === "has_return") updateData.returned_at = new Date().toISOString();

  const { error } = await supabase
    .from("packing_sessions")
    .update(updateData)
    .eq("id", session_id);
  if (error) return { error: { _form: [error.message] } };

  await logActivity({
    user_id: profile.id,
    action: "status_change",
    entity_type: "packing_session",
    entity_id: session_id,
    old_data: { status: session.status },
    new_data: { status },
  });

  // Notif sesuai status baru
  const { data: sessionInfo } = await supabase
    .from("packing_sessions")
    .select("platform, platform_order_id")
    .eq("id", session_id)
    .maybeSingle();

  if (sessionInfo) {
    const eventType =
      status === "shipped" ? "packing.shipped"
        : status === "completed" ? "packing.completed"
        : status === "has_return" ? "packing.has_return"
        : null;

    if (eventType) {
      await notifyEvent(
        {
          type: eventType,
          sessionId: session_id,
          platform: sessionInfo.platform,
          orderId: sessionInfo.platform_order_id,
        },
        { actorId: profile.id }
      );
    }
  }

  return { success: true };
}
