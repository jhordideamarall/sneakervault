"use server";

import { createClient } from "@sneakervault/supabase/server";
import { productInputSchema, confirmInboundSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";

export async function scanInbound(barcode: string) {
  await requireRole(["owner", "admin_gudang"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("barcode", barcode)
    .maybeSingle();
  return data;
}

export async function registerProduct(input: unknown) {
  await requireRole(["owner", "admin_gudang"]);
  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .insert({ ...parsed.data, first_inbound_at: new Date().toISOString() })
    .select()
    .single();

  if (error) return { error: { _form: [error.message] } };
  return { data };
}

export async function confirmInbound(input: unknown) {
  const profile = await requireRole(["owner", "admin_gudang"]);
  const parsed = confirmInboundSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { product_id, quantity, batch_data } = parsed.data;
  const supabase = await createClient();

  // Get product to derive brand/model (don't trust user input for HPP recalc)
  const { data: product } = await supabase
    .from("products")
    .select("brand, model, quantity, hpp")
    .eq("id", product_id)
    .maybeSingle();
  if (!product) return { error: { _form: ["Produk tidak ditemukan"] } };

  // Atomic stock increment (race-safe)
  const { error: incErr } = await supabase.rpc("increment_product_quantity", { p_id: product_id, qty: quantity });
  if (incErr) return { error: { _form: [incErr.message] } };

  // Create the batch header
  const { data: batch, error: batchErr } = await supabase
    .from("purchase_batches")
    .insert({ ...batch_data, product_id, created_by: profile.id })
    .select()
    .single();
  if (batchErr) return { error: { _form: [batchErr.message] } };

  // Record stock movement
  const { error: mvErr } = await supabase.from("stock_movements").insert({
    product_id, type: "inbound", quantity, unit_cost: batch_data.unit_cost,
    reference_type: "purchase_batch", reference_id: batch.id, performed_by: profile.id,
  });
  if (mvErr) return { error: { _form: [mvErr.message] } };

  // Recompute model-wide HPP using product's actual brand/model (not user input)
  const { error: hppErr } = await supabase.rpc("recalculate_hpp_by_model", {
    p_brand: product.brand,
    p_model: product.model,
    p_new_qty: quantity,
    p_new_unit_cost: batch_data.unit_cost,
  });
  if (hppErr) return { error: { _form: [`HPP recalculation failed: ${hppErr.message}`] } };

  await logActivity({
    user_id: profile.id,
    action: "scan_in",
    entity_type: "product",
    entity_id: product_id,
    new_data: { quantity, unit_cost: batch_data.unit_cost, batch_id: batch.id },
  });

  return { success: true };
}
