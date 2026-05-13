"use server";

import { createClient } from "@sneakervault/supabase/server";
import { bankAccountInputSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { revalidatePath } from "next/cache";

const ROLES = ["owner", "finance"] as const;

export async function createBankAccount(input: unknown) {
  const profile = await requireRole([...ROLES]);
  const parsed = bankAccountInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();

  if (parsed.data.is_default) {
    await supabase
      .from("bank_accounts")
      .update({ is_default: false })
      .eq("is_default", true);
  }

  const { data, error } = await supabase
    .from("bank_accounts")
    .insert({
      ...parsed.data,
      current_balance: parsed.data.opening_balance,
    })
    .select()
    .single();
  if (error) return { error: { _form: [error.message] } };

  await logActivity({
    user_id: profile.id,
    action: "create",
    entity_type: "bank_account",
    entity_id: data.id,
    new_data: data,
  });
  revalidatePath("/kas-bank/akun");
  return { data };
}

export async function updateBankAccount(id: string, input: unknown) {
  const profile = await requireRole([...ROLES]);
  const parsed = bankAccountInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();

  if (parsed.data.is_default) {
    await supabase
      .from("bank_accounts")
      .update({ is_default: false })
      .neq("id", id);
  }

  const { data, error } = await supabase
    .from("bank_accounts")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();
  if (error) return { error: { _form: [error.message] } };

  await logActivity({
    user_id: profile.id,
    action: "update",
    entity_type: "bank_account",
    entity_id: id,
    new_data: parsed.data,
  });
  revalidatePath("/kas-bank/akun");
  return { data };
}

export async function deactivateBankAccount(id: string) {
  const profile = await requireRole([...ROLES]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("bank_accounts")
    .update({ is_active: false, is_default: false })
    .eq("id", id);
  if (error) return { error: error.message };
  await logActivity({
    user_id: profile.id,
    action: "deactivate",
    entity_type: "bank_account",
    entity_id: id,
  });
  revalidatePath("/kas-bank/akun");
  return { success: true };
}

export async function reactivateBankAccount(id: string) {
  const profile = await requireRole([...ROLES]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("bank_accounts")
    .update({ is_active: true })
    .eq("id", id);
  if (error) return { error: error.message };
  await logActivity({
    user_id: profile.id,
    action: "reactivate",
    entity_type: "bank_account",
    entity_id: id,
  });
  revalidatePath("/kas-bank/akun");
  return { success: true };
}
