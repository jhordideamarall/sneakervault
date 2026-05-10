"use server";

import { createClient } from "@sneakervault/supabase/server";
import { deleteRequestInputSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { notifyEvent } from "./notify";

export async function requestDelete(input: unknown) {
  const profile = await requireRole(["owner", "admin_gudang", "admin_online", "shopkeeper"]);
  const parsed = deleteRequestInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("delete_requests")
    .insert({ ...parsed.data, requested_by: profile.id, status: "pending" })
    .select()
    .single();

  if (error) return { error: { _form: [error.message] } };

  await logActivity({ user_id: profile.id, action: "delete_request", entity_type: parsed.data.entity_type, entity_id: parsed.data.entity_id, new_data: { reason: parsed.data.reason } });
  await notifyEvent(
    {
      type: "delete_request.submitted",
      requestId: data.id,
      entityType: parsed.data.entity_type,
      reason: parsed.data.reason,
    },
    { actorId: profile.id }
  );
  return { data };
}

export async function approveDelete(requestId: string) {
  const profile = await requireRole(["owner"]);
  const supabase = await createClient();

  const { data: req } = await supabase
    .from("delete_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { error: "Request tidak ditemukan" };
  if (req.status !== "pending") return { error: "Request sudah diproses" };

  // Soft-delete per entity type. Each table has different delete semantics:
  // - product: is_active=false
  // - packing_session: status='cancelled' (no is_active column)
  // - stock_movement: hard delete (auditable via activity_logs)
  // - purchase_batch: is_active=false
  const entityType = req.entity_type;
  if (entityType === "product") {
    await supabase.from("products").update({ is_active: false }).eq("id", req.entity_id);
  } else if (entityType === "packing_session") {
    await supabase
      .from("packing_sessions")
      .update({ status: "cancelled", status_updated_by: profile.id })
      .eq("id", req.entity_id);
  } else if (entityType === "stock_movement") {
    await supabase.from("stock_movements").delete().eq("id", req.entity_id);
  } else if (entityType === "purchase_batch") {
    await supabase.from("purchase_batches").update({ is_active: false }).eq("id", req.entity_id);
  } else {
    return { error: `Jenis entitas tidak dikenali: ${entityType}` };
  }

  await supabase
    .from("delete_requests")
    .update({ status: "approved", reviewed_by: profile.id, reviewed_at: new Date().toISOString() })
    .eq("id", requestId);

  await logActivity({
    user_id: profile.id,
    action: "approve_delete",
    entity_type: req.entity_type,
    entity_id: req.entity_id,
  });

  await notifyEvent(
    {
      type: "delete_request.reviewed",
      requestId: requestId,
      entityType: req.entity_type,
      status: "approved",
      requesterId: req.requested_by,
    },
    { actorId: profile.id }
  );

  return { success: true };
}

export async function rejectDelete(requestId: string, notes: string) {
  const profile = await requireRole(["owner"]);
  const supabase = await createClient();

  const { data: req } = await supabase
    .from("delete_requests")
    .select("entity_type, requested_by")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { error: "Request tidak ditemukan" };

  const { error } = await supabase
    .from("delete_requests")
    .update({ status: "rejected", reviewed_by: profile.id, review_notes: notes, reviewed_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) return { error: error.message };

  await logActivity({ user_id: profile.id, action: "reject_delete", entity_type: "delete_request", entity_id: requestId, new_data: { notes } });

  await notifyEvent(
    {
      type: "delete_request.reviewed",
      requestId,
      entityType: req.entity_type,
      status: "rejected",
      requesterId: req.requested_by,
      notes,
    },
    { actorId: profile.id }
  );

  return { success: true };
}

export async function getAllProfiles() {
  await requireRole(["owner", "admin_gudang", "admin_online", "shopkeeper"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, roles")
    .eq("is_active", true)
    .order("full_name");
  return { data, error };
}
