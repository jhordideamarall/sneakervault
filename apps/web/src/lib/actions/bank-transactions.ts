"use server";

import { createClient } from "@sneakervault/supabase/server";
import { bankTransactionInputSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { revalidatePath } from "next/cache";
import { assertPeriodOpen } from "@/lib/fiscal-periods";

const ROLES = ["owner", "finance"] as const;

export async function createBankTransaction(input: unknown) {
  const profile = await requireRole([...ROLES]);
  const parsed = bankTransactionInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const lock = await assertPeriodOpen(parsed.data.transaction_date);
  if (lock.error) return { error: { _form: [lock.error] } };

  const supabase = await createClient();

  const { data: ba } = await supabase
    .from("bank_accounts")
    .select("id, current_balance, name, is_active")
    .eq("id", parsed.data.bank_account_id)
    .single();
  if (!ba || !ba.is_active)
    return { error: { _form: ["Akun bank tidak aktif"] } };

  const currentBalance = Number(ba.current_balance);
  const newBalance =
    parsed.data.type === "debit"
      ? currentBalance - parsed.data.amount
      : currentBalance + parsed.data.amount;

  if (parsed.data.type === "debit" && newBalance < 0) {
    return {
      error: {
        _form: [
          `Saldo ${ba.name} (${currentBalance}) tidak cukup untuk debit ${parsed.data.amount}`,
        ],
      },
    };
  }

  await supabase
    .from("bank_accounts")
    .update({ current_balance: newBalance })
    .eq("id", ba.id);

  const { data, error } = await supabase
    .from("bank_transactions")
    .insert({
      bank_account_id: parsed.data.bank_account_id,
      transaction_date: parsed.data.transaction_date,
      type: parsed.data.type,
      amount: parsed.data.amount,
      balance_after: newBalance,
      reference_no: parsed.data.reference_no || null,
      description: parsed.data.description,
      related_entity_type: "manual",
      created_by: profile.id,
    })
    .select()
    .single();
  if (error) {
    // Rollback balance
    await supabase
      .from("bank_accounts")
      .update({ current_balance: currentBalance })
      .eq("id", ba.id);
    return { error: { _form: [error.message] } };
  }

  await logActivity({
    user_id: profile.id,
    action: "create",
    entity_type: "bank_transaction",
    entity_id: data.id,
    new_data: {
      bank_account: ba.name,
      type: parsed.data.type,
      amount: parsed.data.amount,
      description: parsed.data.description,
    },
  });

  revalidatePath("/kas-bank/mutasi");
  revalidatePath("/kas-bank/akun");
  return { data };
}

export async function toggleReconciled(id: string) {
  const profile = await requireRole([...ROLES]);
  const supabase = await createClient();

  const { data: tx } = await supabase
    .from("bank_transactions")
    .select("is_reconciled")
    .eq("id", id)
    .single();
  if (!tx) return { error: "Mutasi tidak ditemukan" };

  const newState = !tx.is_reconciled;
  const { error } = await supabase
    .from("bank_transactions")
    .update({
      is_reconciled: newState,
      reconciled_at: newState ? new Date().toISOString() : null,
      reconciled_by: newState ? profile.id : null,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/kas-bank/mutasi");
  return { success: true };
}
