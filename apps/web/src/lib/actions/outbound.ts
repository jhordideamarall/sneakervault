"use server";

import { createClient } from "@sneakervault/supabase/server";
import { packingSessionInputSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { notifyEvent, checkLowStockAndNotify } from "./notify";

type PackingPayload = {
  product: {
    id: string;
    brand: string;
    model: string;
    size: number | null;
    size_label?: string | null;
    barcode?: string | null;
    quantity?: number | null;
  };
  item: { id: string; stock_reservation_id?: string | null };
};

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
  await notifyEvent(
    {
      type: "packing.created",
      sessionId: data.id,
      platform: data.platform,
      orderId: data.platform_order_id,
    },
    { actorId: profile.id }
  );
  return { data };
}

export async function scanPackingItem(sessionId: string, barcode: string) {
  const profile = await requireRole(["owner", "shopkeeper"]);
  return commitPackingItemByBarcode(sessionId, barcode, profile.id, "scan");
}

export async function searchProductsForPacking(query: string) {
  await requireRole(["owner", "shopkeeper"]);
  const supabase = await createClient();
  const term = query.trim().replace(/[(),]/g, " ");

  let productQuery = supabase
    .from("products")
    .select(
      "id, brand, model, sku, barcode, size, size_label, color, quantity, sell_price, price_offline, image_url",
    )
    .eq("is_active", true)
    .gt("quantity", 0)
    .order("brand", { ascending: true })
    .order("model", { ascending: true })
    .order("size", { ascending: true })
    .limit(18);

  if (term) {
    productQuery = productQuery.or(
      `brand.ilike.%${term}%,model.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%,color.ilike.%${term}%,size_label.ilike.%${term}%`,
    );
  }

  const { data, error } = await productQuery;
  if (error) return { error: error.message };
  return { data: data ?? [] };
}

export async function addPackingItemManual(sessionId: string, productId: string) {
  const profile = await requireRole(["owner", "shopkeeper"]);
  const supabase = await createClient();

  const { data: product, error } = await supabase
    .from("products")
    .select("id, barcode, quantity, is_active")
    .eq("id", productId)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!product || product.is_active === false) return { error: "Produk tidak ditemukan atau tidak aktif" };
  if (Number(product.quantity ?? 0) <= 0) return { error: "Stok produk habis" };
  if (!product.barcode) return { error: "Produk belum memiliki barcode. Lengkapi barcode sebelum packing." };

  return commitPackingItemByBarcode(sessionId, product.barcode, profile.id, "manual");
}

async function commitPackingItemByBarcode(
  sessionId: string,
  barcode: string,
  userId: string,
  source: "scan" | "manual",
) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("scan_packing_item_atomic", {
    p_session_id: sessionId,
    p_barcode: barcode,
  });
  if (error) return { error: error.message };

  const payload = data as PackingPayload | null;
  if (!payload?.product || !payload.item) {
    return { error: "Scan gagal: response database tidak lengkap" };
  }

  await logActivity({
    user_id: userId,
    action: source === "manual" ? "manual_add_out" : "scan_out",
    entity_type: "packing_item",
    entity_id: payload.item.id,
    new_data: {
      product_id: payload.product.id,
      barcode,
      session_id: sessionId,
      source,
      stock_reservation_id: payload.item.stock_reservation_id ?? null,
    },
  });

  // Cek stok rendah setelah outbound — broadcast notif kalau di bawah threshold
  await checkLowStockAndNotify(payload.product.id, { actorId: userId });

  return { data: payload };
}

export async function removePackingItem(itemId: string) {
  const profile = await requireRole(["owner", "shopkeeper"]);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("remove_packing_item_atomic", {
    p_item_id: itemId,
  });
  if (error) return { error: error.message };

  const item = data as {
    product_id?: string;
    packing_session_id?: string;
    stock_reservation_id?: string | null;
  } | null;

  await logActivity({
    user_id: profile.id,
    action: "remove_item",
    entity_type: "packing_item",
    entity_id: itemId,
    old_data: {
      product_id: item?.product_id,
      session_id: item?.packing_session_id,
      stock_reservation_id: item?.stock_reservation_id ?? null,
    },
  });
  return { success: true };
}

export async function cancelPackingSession(sessionId: string) {
  const profile = await requireRole(["owner", "shopkeeper"]);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("cancel_packing_session_atomic", {
    p_session_id: sessionId,
  });
  if (error) return { error: error.message };
  const payload = data as { items_count?: number } | null;

  await logActivity({
    user_id: profile.id,
    action: "cancel_session",
    entity_type: "packing_session",
    entity_id: sessionId,
    old_data: { items_count: payload?.items_count ?? 0 },
  });
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
