"use server";

import { createClient } from "@sneakervault/supabase/server";
import { initiateReturnSchema, processReturnSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";

export async function initiateReturn(input: unknown) {
  const profile = await requireRole(["owner", "admin_online"]);
  const parsed = initiateReturnSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();

  // Get packing item + session status + product info
  const { data: item } = await supabase
    .from("packing_items")
    .select("*, products(id, size, brand, model), packing_sessions(id, status)")
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
  return { success: true };
}

export async function processReturn(input: unknown) {
  const profile = await requireRole(["owner", "admin_gudang", "admin_online"]);
  const parsed = processReturnSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { data: ret } = await supabase.from("returns").select("*, packing_items(product_id)").eq("id", parsed.data.return_id).maybeSingle();
  if (!ret) return { error: { _form: ["Return tidak ditemukan"] } };
  if (ret.status !== "verified") return { error: { _form: ["Return belum diverifikasi"] } };

  const originalProductId = ret.original_product_id;

  if (ret.type === "refund") {
    const { error: rpcErr } = await supabase.rpc("increment_product_quantity", { p_id: originalProductId, qty: 1 });
    if (rpcErr) return { error: { _form: [rpcErr.message] } };

    const { error: mvErr } = await supabase.from("stock_movements").insert({
      product_id: originalProductId, type: "return_in", quantity: 1, unit_cost: 0,
      reference_type: "return", reference_id: ret.id, performed_by: profile.id,
    });
    if (mvErr) return { error: { _form: [mvErr.message] } };
  } else if (ret.type === "exchange_size") {
    const newProductId = parsed.data.new_product_id;
    if (!newProductId) return { error: { _form: ["Produk pengganti wajib dipilih"] } };

    // Return in original
    const { error: incErr } = await supabase.rpc("increment_product_quantity", { p_id: originalProductId, qty: 1 });
    if (incErr) return { error: { _form: [incErr.message] } };
    await supabase.from("stock_movements").insert({
      product_id: originalProductId, type: "return_in", quantity: 1, unit_cost: 0,
      reference_type: "return", reference_id: ret.id, performed_by: profile.id,
    });

    // Send out new product
    const { data: decOk, error: decErr } = await supabase.rpc("decrement_product_quantity", { p_id: newProductId, qty: 1 });
    if (decErr) return { error: { _form: [decErr.message] } };
    if (!decOk) return { error: { _form: ["Stok produk pengganti habis"] } };
    await supabase.from("stock_movements").insert({
      product_id: newProductId, type: "return_out", quantity: 1, unit_cost: 0,
      reference_type: "return", reference_id: ret.id, performed_by: profile.id,
    });
  }

  // Update return status
  const { error: updateErr } = await supabase.from("returns").update({
    status: "processed", processed_by: profile.id, processed_at: new Date().toISOString(),
    new_product_id: parsed.data.new_product_id || null, new_size: parsed.data.new_size || null,
  }).eq("id", parsed.data.return_id);
  if (updateErr) return { error: { _form: [updateErr.message] } };

  await logActivity({ user_id: profile.id, action: "process_return", entity_type: "return", entity_id: parsed.data.return_id, new_data: { type: ret.type, new_product_id: parsed.data.new_product_id } });
  return { success: true };
}
