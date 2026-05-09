"use server";

import { createClient } from "@sneakervault/supabase/server";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { z } from "zod";

const productUpdateSchema = z.object({
  id: z.string().uuid(),
  sell_price: z.coerce.number().nonnegative().optional(),
  color: z.string().optional(),
  image_url: z.string().url().nullable().optional().or(z.literal("")),
  default_supplier_id: z.string().uuid().nullable().optional(),
});

const importRowSchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  sku: z.string().min(1),
  size: z.coerce.number().positive(),
  color: z.string().optional(),
  barcode: z.string().min(1),
  sell_price: z.coerce.number().nonnegative().default(0),
});

export type ImportProductRow = z.infer<typeof importRowSchema>;

const createProductSchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  sku: z.string().min(1),
  size: z.coerce.number().positive(),
  color: z.string().optional(),
  barcode: z.string().min(1),
  sell_price: z.coerce.number().nonnegative().default(0),
  quantity: z.number().default(0),
  hpp: z.number().default(0),
});

export async function createProduct(input: unknown) {
  const profile = await requireRole(["owner", "admin_gudang"]);
  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .insert({ ...parsed.data, is_active: true })
    .select()
    .single();

  if (error) return { error: { _form: [error.message] } };
  await logActivity({ user_id: profile.id, action: "create", entity_type: "product", entity_id: data.id, new_data: data });
  return { data };
}

export async function bulkImportProducts(rows: unknown[]): Promise<{
  inserted: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}> {
  const profile = await requireRole(["owner", "admin_gudang"]);
  const supabase = await createClient();

  let inserted = 0;
  let skipped = 0;
  const errors: { row: number; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const parsed = importRowSchema.safeParse(rows[i]);
    if (!parsed.success) {
      errors.push({
        row: i + 2, // header + 1-indexed
        reason: parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
      });
      continue;
    }

    // Check if already exists by barcode
    const { data: existing } = await supabase
      .from("products")
      .select("id")
      .eq("barcode", parsed.data.barcode)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    const { error } = await supabase.from("products").insert({
      ...parsed.data,
      quantity: 0,
      hpp: 0,
      is_active: true,
    });

    if (error) {
      errors.push({ row: i + 2, reason: error.message });
    } else {
      inserted++;
    }
  }

  if (inserted > 0) {
    await logActivity({
      user_id: profile.id,
      action: "create",
      entity_type: "product",
      new_data: { imported: inserted, skipped, errors: errors.length },
    });
  }

  return { inserted, skipped, errors };
}

export async function updateProduct(input: unknown) {
  const profile = await requireRole(["owner", "admin_gudang"]);
  const parsed = productUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { id, ...patch } = parsed.data;
  const supabase = await createClient();

  // Owner can change sell_price; admin_gudang cannot.
  if (patch.sell_price !== undefined && !profile.roles?.includes("owner")) {
    delete (patch as { sell_price?: number }).sell_price;
  }

  const { error } = await supabase.from("products").update(patch).eq("id", id);
  if (error) return { error: { _form: [error.message] } };

  await logActivity({
    user_id: profile.id,
    action: "update",
    entity_type: "product",
    entity_id: id,
    new_data: patch,
  });

  return { success: true };
}
