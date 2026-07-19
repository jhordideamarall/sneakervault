"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@sneakervault/supabase/server";
import { coaInputSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";

const ROLES = ["owner", "finance"] as const;

function revalidateCoa() {
  revalidatePath("/buku-besar/coa");
  revalidatePath("/buku-besar/journal");
  revalidatePath("/laporan-keuangan");
}

export async function createChartOfAccount(input: unknown) {
  const profile = await requireRole([...ROLES]);
  const parsed = coaInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const payload = {
    code: parsed.data.code,
    name: parsed.data.name,
    type: parsed.data.type,
    normal_balance: parsed.data.normal_balance,
    parent_id: parsed.data.parent_id ?? null,
    is_active: parsed.data.is_active,
    is_system: false,
    description: parsed.data.description || null,
  };

  const { data, error } = await supabase
    .from("chart_of_accounts")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { error: { _form: [error.message] } };

  await logActivity({
    user_id: profile.id,
    action: "create",
    entity_type: "chart_of_account",
    entity_id: data.id,
    new_data: payload,
  });
  revalidateCoa();
  return { data };
}

export async function updateChartOfAccount(id: string, input: unknown) {
  const profile = await requireRole([...ROLES]);
  const parsed = coaInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  if (parsed.data.parent_id === id) {
    return { error: { parent_id: ["Parent akun tidak boleh akun yang sama"] } };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("chart_of_accounts")
    .select("id, code, name, type, normal_balance, parent_id, is_active, is_system, description")
    .eq("id", id)
    .single();
  if (!existing) return { error: { _form: ["Akun tidak ditemukan"] } };

  const ex = existing as {
    code: string;
    name: string;
    type: string;
    normal_balance: string;
    parent_id: string | null;
    is_active: boolean;
    is_system: boolean;
    description: string | null;
  };

  const payload = ex.is_system
    ? {
        name: parsed.data.name,
        is_active: true,
        description: parsed.data.description || null,
      }
    : {
        code: parsed.data.code,
        name: parsed.data.name,
        type: parsed.data.type,
        normal_balance: parsed.data.normal_balance,
        parent_id: parsed.data.parent_id ?? null,
        is_active: parsed.data.is_active,
        description: parsed.data.description || null,
      };

  const { error } = await supabase
    .from("chart_of_accounts")
    .update(payload)
    .eq("id", id);
  if (error) return { error: { _form: [error.message] } };

  await logActivity({
    user_id: profile.id,
    action: "update",
    entity_type: "chart_of_account",
    entity_id: id,
    old_data: ex,
    new_data: payload,
  });
  revalidateCoa();
  return { success: true };
}

export async function deactivateChartOfAccount(id: string) {
  const profile = await requireRole([...ROLES]);
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("chart_of_accounts")
    .select("id, code, name")
    .eq("id", id)
    .single();
  if (!existing) return { error: "Akun tidak ditemukan" };

  const { error } = await supabase
    .from("chart_of_accounts")
    .update({ is_active: false })
    .eq("id", id);
  if (error) return { error: error.message };

  await logActivity({
    user_id: profile.id,
    action: "deactivate",
    entity_type: "chart_of_account",
    entity_id: id,
    old_data: existing,
  });
  revalidateCoa();
  return { success: true };
}

export async function deleteChartOfAccount(id: string) {
  const profile = await requireRole([...ROLES]);
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("chart_of_accounts")
    .select("id, code, name, is_system")
    .eq("id", id)
    .single();
  if (!existing) return { error: "Akun tidak ditemukan" };
  if (existing.is_system) {
    return { error: "Akun sistem tidak bisa dihapus. Nonaktifkan akun custom saja bila perlu." };
  }

  const usageChecks = [
    supabase
      .from("chart_of_accounts")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", id)
      .then(({ count }) => ({ label: "punya child/sub-akun", count: count ?? 0 })),
    supabase
      .from("journal_lines")
      .select("id", { count: "exact", head: true })
      .eq("account_id", id)
      .then(({ count }) => ({ label: "sudah dipakai jurnal", count: count ?? 0 })),
    supabase
      .from("bank_accounts")
      .select("id", { count: "exact", head: true })
      .eq("coa_account_id", id)
      .then(({ count }) => ({ label: "terhubung akun kas/bank", count: count ?? 0 })),
    supabase
      .from("bank_transactions")
      .select("id", { count: "exact", head: true })
      .eq("counterpart_account_id", id)
      .then(({ count }) => ({ label: "dipakai mutasi kas/bank", count: count ?? 0 })),
    supabase
      .from("expense_categories")
      .select("id", { count: "exact", head: true })
      .eq("account_code", existing.code)
      .then(({ count }) => ({ label: "dipakai kategori expense", count: count ?? 0 })),
  ];

  const usages = (await Promise.all(usageChecks)).filter((usage) => usage.count > 0);
  if (usages.length > 0) {
    return {
      error: `Akun belum bisa dihapus karena ${usages
        .map((usage) => `${usage.label} (${usage.count})`)
        .join(", ")}. Nonaktifkan akun bila historinya perlu tetap utuh.`,
    };
  }

  const { error } = await supabase
    .from("chart_of_accounts")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };

  await logActivity({
    user_id: profile.id,
    action: "delete",
    entity_type: "chart_of_account",
    entity_id: id,
    old_data: existing,
  });
  revalidateCoa();
  return { success: true };
}
