"use server";

import { createClient } from "@sneakervault/supabase/server";
import { initiateReturnSchema, processReturnSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { notifyEvent } from "./notify";

export async function initiateReturn(input: unknown) {
  const profile = await requireRole(["owner", "admin_online"]);
  const parsed = initiateReturnSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();

  // Get packing item + session status + product info
  const { data: item } = await supabase
    .from("packing_items")
    .select("*, products(id, size, size_label, brand, model), packing_sessions(id, status)")
    .eq("id", parsed.data.packing_item_id)
    .maybeSingle();
  if (!item) return { error: { _form: ["Item tidak ditemukan"] } };

  // Validate session status — only shipped/completed can have returns
  const sessionStatus = (item.packing_sessions as { status: string } | null)?.status;
  if (!sessionStatus || !["shipped", "completed", "has_return"].includes(sessionStatus)) {
    return { error: { _form: ["Return hanya bisa dilakukan untuk order yang sudah dikirim"] } };
  }

  // Check for existing active return on this item (prevent duplicates)
  const { data: existingReturn } = await supabase
    .from("returns")
    .select("id")
    .eq("packing_item_id", parsed.data.packing_item_id)
    .neq("status", "cancelled")
    .maybeSingle();
  if (existingReturn) return { error: { _form: ["Item ini sudah memiliki return aktif"] } };

  const { data, error } = await supabase
    .from("returns")
    .insert({
      packing_item_id: parsed.data.packing_item_id,
      type: parsed.data.type,
      reason: parsed.data.reason,
      original_product_id: item.product_id,
      original_size: item.products?.size ?? 0,
      status: "pending",
    })
    .select()
    .single();
  if (error) return { error: { _form: [error.message] } };

  // Update packing session status to has_return
  const sessionId = (item.packing_sessions as { id: string } | null)?.id;
  if (sessionId) {
    await supabase.from("packing_sessions")
      .update({ status: "has_return", returned_at: new Date().toISOString(), status_updated_by: profile.id })
      .eq("id", sessionId);
  }

  await logActivity({ user_id: profile.id, action: "initiate_return", entity_type: "return", entity_id: data.id, new_data: { type: parsed.data.type, reason: parsed.data.reason, packing_item_id: parsed.data.packing_item_id } });

  const productLabel = item.products
    ? `${item.products.brand} ${item.products.model} size ${item.products.size_label ?? item.products.size}`
    : "Produk";
  await notifyEvent(
    {
      type: "return.initiated",
      returnId: data.id,
      reason: parsed.data.reason,
      productLabel,
    },
    { actorId: profile.id }
  );

  return { data };
}

export async function verifyReturn(returnId: string) {
  const profile = await requireRole(["owner", "admin_gudang"]);
  const supabase = await createClient();

  const { data: ret } = await supabase.from("returns").select("status").eq("id", returnId).maybeSingle();
  if (!ret) return { error: "Return tidak ditemukan" };
  if (ret.status !== "pending") return { error: "Return sudah diverifikasi" };

  const { error } = await supabase.from("returns")
    .update({ status: "verified", verified_by: profile.id, verified_at: new Date().toISOString() })
    .eq("id", returnId);
  if (error) return { error: error.message };

  await logActivity({ user_id: profile.id, action: "verify_return", entity_type: "return", entity_id: returnId });

  // Ambil product label untuk notif
  const { data: retRow } = await supabase
    .from("returns")
    .select("original_product_id")
    .eq("id", returnId)
    .maybeSingle();
  let productLabel = "Produk";
  if (retRow?.original_product_id) {
    const { data: p } = await supabase
      .from("products")
      .select("brand, model, size, size_label")
      .eq("id", retRow.original_product_id)
      .maybeSingle();
    if (p) productLabel = `${p.brand} ${p.model} size ${p.size_label ?? p.size}`;
  }
  await notifyEvent(
    { type: "return.verified", returnId, productLabel },
    { actorId: profile.id }
  );

  return { success: true };
}

export async function processReturn(input: unknown) {
  const profile = await requireRole(["owner", "admin_gudang", "admin_online"]);
  const parsed = processReturnSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { data: retBefore } = await supabase
    .from("returns")
    .select("type, original_product_id")
    .eq("id", parsed.data.return_id)
    .maybeSingle();
  if (!retBefore) return { error: { _form: ["Return tidak ditemukan"] } };

  const { data: result, error: processError } = await supabase.rpc(
    "process_return_atomic",
    {
      p_return_id: parsed.data.return_id,
      p_new_product_id: parsed.data.new_product_id ?? null,
    },
  );
  if (processError) return { error: { _form: [processError.message] } };

  await logActivity({
    user_id: profile.id,
    action: "process_return",
    entity_type: "return",
    entity_id: parsed.data.return_id,
    new_data: {
      type: retBefore.type,
      new_product_id: parsed.data.new_product_id,
      atomic_result: result,
    },
  });

  const { data: prodOriginal } = await supabase
    .from("products")
    .select("brand, model, size, size_label")
    .eq("id", retBefore.original_product_id)
    .maybeSingle();
  const processedLabel = prodOriginal
    ? `${prodOriginal.brand} ${prodOriginal.model} size ${prodOriginal.size_label ?? prodOriginal.size}`
    : "Produk";
  await notifyEvent(
    {
      type: "return.processed",
      returnId: parsed.data.return_id,
      returnType: retBefore.type,
      productLabel: processedLabel,
    },
    { actorId: profile.id }
  );

  return { success: true };
}
