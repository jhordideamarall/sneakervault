"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@sneakervault/supabase/server";
import { preOrderInputSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { assertPeriodOpen } from "@/lib/fiscal-periods";

const MANAGE_ROLES = ["owner", "finance", "admin_online"] as const;

export async function createPreOrder(input: unknown) {
  const profile = await requireRole([...MANAGE_ROLES]);
  const parsed = preOrderInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const lock = await assertPeriodOpen(parsed.data.order_date);
  if (lock.error) return { error: { _form: [lock.error] } };

  const supabase = await createClient();
  const { data: preOrder, error: orderErr } = await supabase.rpc(
    "create_pre_order_atomic",
    { p_payload: parsed.data },
  );
  if (orderErr || !preOrder) {
    return {
      error: { _form: [orderErr?.message ?? "Gagal membuat Pre Order"] },
    };
  }

  const created = preOrder as { id: string; status: string; line_count: number };

  await logActivity({
    user_id: profile.id,
    action: "create",
    entity_type: "pre_order",
    entity_id: created.id,
    new_data: {
      source: parsed.data.source,
      channel: parsed.data.channel,
      marketplace_order_id: parsed.data.marketplace_order_id,
      line_count: created.line_count,
      status: created.status,
    },
  });

  revalidatePath("/pre-order");
  revalidatePath("/inventory");
  revalidatePath("/pembelian/purchase-order");
  return { data: { id: created.id, status: created.status } };
}

export async function cancelPreOrder(id: string, reason?: string) {
  const profile = await requireRole([...MANAGE_ROLES]);
  const supabase = await createClient();

  const { data: existing, error: getErr } = await supabase
    .from("pre_orders")
    .select("id, status, notes")
    .eq("id", id)
    .single();

  if (getErr || !existing) return { error: "Pre Order tidak ditemukan" };
  if (existing.status === "cancelled") return { success: true };

  const { error: orderErr } = await supabase.rpc(
    "cancel_pre_order_atomic",
    { p_pre_order_id: id, p_reason: reason ?? null },
  );
  if (orderErr) return { error: orderErr.message };

  await logActivity({
    user_id: profile.id,
    action: "cancel",
    entity_type: "pre_order",
    entity_id: id,
    new_data: { reason },
  });

  revalidatePath("/pre-order");
  revalidatePath("/inventory");
  return { success: true };
}
