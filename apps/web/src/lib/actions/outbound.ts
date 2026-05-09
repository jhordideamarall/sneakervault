"use server";

import { createClient } from "@sneakervault/supabase/server";
import { packingSessionInputSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";

export async function createPackingSession(input: unknown) {
  const profile = await requireRole(["owner", "shopkeeper"]);
  const parsed = packingSessionInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("packing_sessions")
    .insert({
      ...parsed.data,
      packed_by: parsed.data.packed_by ?? profile.id,
      status: "packing",
      created_by: profile.id,
    })
    .select()
    .single();

  if (error) return { error: { _form: [error.message] } };

  await logActivity({ user_id: profile.id, action: "create", entity_type: "packing_session", entity_id: data.id, new_data: data });
  return { data };
}

export async function scanPackingItem(sessionId: string, barcode: string) {
  const profile = await requireRole(["owner", "shopkeeper"]);
  const supabase = await createClient();

  // Validate session is still packing
  const { data: session } = await supabase
    .from("packing_sessions")
    .select("status")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { error: "Sesi tidak ditemukan" };
  if (session.status !== "packing") return { error: "Sesi sudah tidak aktif" };

  // Find product by barcode
  const { data: product } = await supabase
    .from("products")
    .select("*")
    .eq("barcode", barcode)
    .maybeSingle();
  if (!product) return { error: "Produk tidak ditemukan" };

  // Decrement stock atomically via RPC (bypasses products_update RLS for shopkeeper).
  // Returns false if stock insufficient (race-safe).
  const { data: ok, error: decErr } = await supabase.rpc("decrement_product_quantity", {
    p_id: product.id,
    qty: 1,
  });
  if (decErr) return { error: decErr.message };
  if (!ok) return { error: "Stok habis atau sudah diambil pengguna lain" };

  // Create packing item
  const { data: item, error: itemErr } = await supabase
    .from("packing_items")
    .insert({
      packing_session_id: sessionId,
      product_id: product.id,
      barcode_scanned: barcode,
      unit_hpp: product.hpp,
      sell_price: product.sell_price,
    })
    .select()
    .single();
  if (itemErr) return { error: itemErr.message };

  // Record stock movement
  await supabase.from("stock_movements").insert({
    product_id: product.id,
    type: "outbound",
    quantity: 1,
    unit_cost: product.hpp,
    reference_type: "packing_item",
    reference_id: item.id,
    performed_by: profile.id,
  });

  await logActivity({
    user_id: profile.id,
    action: "scan_out",
    entity_type: "packing_item",
    entity_id: item.id,
    new_data: { product_id: product.id, barcode, session_id: sessionId },
  });

  return { data: { product, item } };
}

export async function removePackingItem(itemId: string) {
  const profile = await requireRole(["owner", "shopkeeper"]);
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("packing_items")
    .select("id, product_id, packing_session_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return { error: "Item tidak ditemukan" };

  const { data: deletedRows, error: deleteErr } = await supabase
    .from("packing_items")
    .delete()
    .eq("id", itemId)
    .select("id");
  if (deleteErr) return { error: deleteErr.message };
  if (!deletedRows || deletedRows.length === 0) {
    return { error: "Tidak bisa menghapus item (sesi sudah tidak aktif)" };
  }

  await supabase.rpc("increment_product_quantity", { p_id: item.product_id, qty: 1 });
  await supabase.from("stock_movements").delete().eq("reference_type", "packing_item").eq("reference_id", itemId);

  await logActivity({ user_id: profile.id, action: "remove_item", entity_type: "packing_item", entity_id: itemId, old_data: { product_id: item.product_id, session_id: item.packing_session_id } });
  return { success: true };
}

export async function cancelPackingSession(sessionId: string) {
  const profile = await requireRole(["owner", "shopkeeper"]);
  const supabase = await createClient();

  const { data: session } = await supabase.from("packing_sessions").select("status").eq("id", sessionId).maybeSingle();
  if (!session) return { error: "Sesi tidak ditemukan" };
  if (session.status !== "packing") return { error: "Hanya bisa batalkan sesi yang masih packing" };

  const { data: deletedItems, error: deleteErr } = await supabase
    .from("packing_items").delete().eq("packing_session_id", sessionId).select("id, product_id");
  if (deleteErr) return { error: deleteErr.message };

  const items = deletedItems ?? [];

  // Rollback stock — collect errors but continue
  for (const item of items) {
    const { error: rpcErr } = await supabase.rpc("increment_product_quantity", { p_id: item.product_id, qty: 1 });
    if (rpcErr) console.error(`Failed to rollback stock for ${item.product_id}:`, rpcErr.message);
  }

  if (items.length > 0) {
    await supabase.from("stock_movements").delete().eq("reference_type", "packing_item").in("reference_id", items.map((i) => i.id));
  }

  await supabase.from("packing_sessions").update({ status: "cancelled", status_updated_by: profile.id }).eq("id", sessionId);

  await logActivity({ user_id: profile.id, action: "cancel_session", entity_type: "packing_session", entity_id: sessionId, old_data: { items_count: items.length } });
  return { success: true };
}

export async function finalizePackingSession(sessionId: string) {
  const profile = await requireRole(["owner", "shopkeeper"]);
  const supabase = await createClient();

  const { data: session } = await supabase.from("packing_sessions").select("status").eq("id", sessionId).maybeSingle();
  if (!session) return { error: "Sesi tidak ditemukan" };
  if (session.status !== "packing") return { error: "Sesi sudah tidak aktif" };

  const { count } = await supabase.from("packing_items").select("id", { count: "exact", head: true }).eq("packing_session_id", sessionId);
  if (!count || count === 0) return { error: "Sesi tidak memiliki item" };

  await supabase.from("packing_sessions").update({ packed_at: new Date().toISOString(), status_updated_by: profile.id }).eq("id", sessionId);

  await logActivity({ user_id: profile.id, action: "finalize_session", entity_type: "packing_session", entity_id: sessionId, new_data: { items_count: count } });
  return { success: true };
}
