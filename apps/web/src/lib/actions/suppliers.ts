"use server";

import { createClient } from "@sneakervault/supabase/server";
import { supplierInputSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";

export async function createSupplier(input: unknown) {
  const profile = await requireRole(["owner", "admin_gudang"]);
  const parsed = supplierInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { data, error } = await supabase.from("suppliers").insert(parsed.data).select().single();
  if (error) return { error: { _form: [error.message] } };

  await logActivity({ user_id: profile.id, action: "create", entity_type: "supplier", entity_id: data.id, new_data: data });
  return { data };
}

export async function updateSupplier(id: string, input: unknown) {
  const profile = await requireRole(["owner", "admin_gudang"]);
  const parsed = supplierInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { data, error } = await supabase.from("suppliers").update(parsed.data).eq("id", id).select().single();
  if (error) return { error: { _form: [error.message] } };

  await logActivity({ user_id: profile.id, action: "update", entity_type: "supplier", entity_id: id, new_data: parsed.data });
  return { data };
}

export async function deactivateSupplier(id: string) {
  const profile = await requireRole(["owner"]);
  const supabase = await createClient();

  const { error } = await supabase.from("suppliers").update({ is_active: false }).eq("id", id);
  if (error) return { error: error.message };

  await logActivity({ user_id: profile.id, action: "deactivate", entity_type: "supplier", entity_id: id });
  return { success: true };
}
