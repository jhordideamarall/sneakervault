"use server";

import { createClient } from "@sneakervault/supabase/server";
import { bankAccountInputSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { revalidatePath } from "next/cache";
import { createJournalEntry } from "@/lib/journal-engine";

const ROLES = ["owner", "finance"] as const;

async function nextCashBankCoaCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  const { data } = await supabase
    .from("chart_of_accounts")
    .select("code")
    .eq("type", "asset")
    .like("code", "1.1.%")
    .order("code", { ascending: false });

  const used = new Set((data ?? []).map((row) => row.code as string));
  for (let n = 2; n < 100; n++) {
    const code = `1.1.${String(n).padStart(2, "0")}`;
    if (!used.has(code)) return code;
  }
  return `1.1.${Date.now().toString().slice(-6)}`;
}

async function parentCurrentAssetId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const { data } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("code", "1.1")
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function ensureBankAccountCoa(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: { name: string; type: string; coa_account_id?: string | null },
): Promise<{ id?: string; error?: string }> {
  const existingId = input.coa_account_id ?? null;
  if (existingId) {
    const { error } = await supabase
      .from("chart_of_accounts")
      .update({
        name: input.name,
        type: "asset",
        normal_balance: "debit",
        is_active: true,
        description: `Akun kas/bank: ${input.name}`,
      })
      .eq("id", existingId);
    return error ? { error: error.message } : { id: existingId };
  }

  const parent_id = await parentCurrentAssetId(supabase);
  const code = await nextCashBankCoaCode(supabase);
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .insert({
      code,
      name: input.name,
      type: "asset",
      normal_balance: "debit",
      parent_id,
      is_active: true,
      is_system: false,
      description: `Akun kas/bank: ${input.name}`,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Gagal membuat COA bank" };
  return { id: data.id };
}

export async function createBankAccount(input: unknown) {
  const profile = await requireRole([...ROLES]);
  const parsed = bankAccountInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const coa = await ensureBankAccountCoa(supabase, {
    name: parsed.data.name,
    type: parsed.data.type,
  });
  if (coa.error || !coa.id) return { error: { _form: [coa.error ?? "COA bank gagal dibuat"] } };

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
      coa_account_id: coa.id,
    })
    .select()
    .single();
  if (error) return { error: { _form: [error.message] } };

  if (parsed.data.opening_balance > 0) {
    const journal = await createJournalEntry({
      entry_date: new Date().toISOString().slice(0, 10),
      description: `Saldo awal akun ${parsed.data.name}`,
      source_type: "opening_balance",
      source_id: data.id,
      user_id: profile.id,
      lines: [
        {
          account_id: coa.id,
          debit: parsed.data.opening_balance,
          description: `Saldo awal ${parsed.data.name}`,
        },
        {
          account_code: "3.1",
          credit: parsed.data.opening_balance,
          description: "Modal awal",
        },
      ],
    });
    if (journal.error) return { error: { _form: [journal.error] } };
  }

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
  const { data: existing } = await supabase
    .from("bank_accounts")
    .select("coa_account_id")
    .eq("id", id)
    .single();
  const coa = await ensureBankAccountCoa(supabase, {
    name: parsed.data.name,
    type: parsed.data.type,
    coa_account_id: (existing as { coa_account_id?: string | null } | null)
      ?.coa_account_id,
  });
  if (coa.error || !coa.id) return { error: { _form: [coa.error ?? "COA bank gagal dibuat"] } };

  if (parsed.data.is_default) {
    await supabase
      .from("bank_accounts")
      .update({ is_default: false })
      .neq("id", id);
  }

  const { data, error } = await supabase
    .from("bank_accounts")
    .update({ ...parsed.data, coa_account_id: coa.id })
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
  const { data: bank } = await supabase
    .from("bank_accounts")
    .select("coa_account_id")
    .eq("id", id)
    .single();
  const coaId = (bank as { coa_account_id?: string | null } | null)?.coa_account_id;
  if (coaId) {
    await supabase.from("chart_of_accounts").update({ is_active: false }).eq("id", coaId);
  }
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
  const { data: bank } = await supabase
    .from("bank_accounts")
    .select("coa_account_id")
    .eq("id", id)
    .single();
  const coaId = (bank as { coa_account_id?: string | null } | null)?.coa_account_id;
  if (coaId) {
    await supabase.from("chart_of_accounts").update({ is_active: true }).eq("id", coaId);
  }
  await logActivity({
    user_id: profile.id,
    action: "reactivate",
    entity_type: "bank_account",
    entity_id: id,
  });
  revalidatePath("/kas-bank/akun");
  return { success: true };
}
