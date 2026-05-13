"use server";

import { createClient } from "@sneakervault/supabase/server";
import { customerInputSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { revalidatePath } from "next/cache";

const MANAGE_ROLES = ["owner", "finance", "admin_online"] as const;

export async function createCustomer(input: unknown) {
  const profile = await requireRole([...MANAGE_ROLES]);
  const parsed = customerInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const payload = {
    ...parsed.data,
    email: parsed.data.email || null,
    contact_person: parsed.data.contact_person || null,
    phone: parsed.data.phone || null,
    address: parsed.data.address || null,
    npwp: parsed.data.npwp || null,
    notes: parsed.data.notes || null,
  };

  const { data, error } = await supabase
    .from("customers")
    .insert(payload)
    .select()
    .single();
  if (error) return { error: { _form: [error.message] } };

  await logActivity({
    user_id: profile.id,
    action: "create",
    entity_type: "customer",
    entity_id: data.id,
    new_data: data,
  });
  revalidatePath("/customers");
  return { data };
}

export async function updateCustomer(id: string, input: unknown) {
  const profile = await requireRole([...MANAGE_ROLES]);
  const parsed = customerInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const payload = {
    ...parsed.data,
    email: parsed.data.email || null,
    contact_person: parsed.data.contact_person || null,
    phone: parsed.data.phone || null,
    address: parsed.data.address || null,
    npwp: parsed.data.npwp || null,
    notes: parsed.data.notes || null,
  };

  const { data, error } = await supabase
    .from("customers")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) return { error: { _form: [error.message] } };

  await logActivity({
    user_id: profile.id,
    action: "update",
    entity_type: "customer",
    entity_id: id,
    new_data: payload,
  });
  revalidatePath("/customers");
  return { data };
}

export async function deactivateCustomer(id: string) {
  const profile = await requireRole(["owner"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({ is_active: false })
    .eq("id", id);
  if (error) return { error: error.message };

  await logActivity({
    user_id: profile.id,
    action: "deactivate",
    entity_type: "customer",
    entity_id: id,
  });
  revalidatePath("/customers");
  return { success: true };
}

export async function reactivateCustomer(id: string) {
  const profile = await requireRole(["owner"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({ is_active: true })
    .eq("id", id);
  if (error) return { error: error.message };

  await logActivity({
    user_id: profile.id,
    action: "reactivate",
    entity_type: "customer",
    entity_id: id,
  });
  revalidatePath("/customers");
  return { success: true };
}
