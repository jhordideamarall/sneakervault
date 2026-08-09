"use server";

import { createClient } from "@sneakervault/supabase/server";
import { bankTransactionInputSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { revalidatePath } from "next/cache";
import { assertPeriodOpen } from "@/lib/fiscal-periods";

const ROLES = ["owner", "finance"] as const;

type ManualBankTransactionResult = {
  id: string;
  bank_account_id: string;
  counterpart_account_id: string;
  transaction_date: string;
  type: "debit" | "credit";
  amount: number;
  balance_after: number;
  reference_no: string | null;
  description: string;
  is_transfer: boolean;
  counterpart_bank_account_id: string | null;
  counterpart_transaction_id: string | null;
};

export async function createBankTransaction(input: unknown) {
  await requireRole([...ROLES]);
  const parsed = bankTransactionInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const lock = await assertPeriodOpen(parsed.data.transaction_date);
  if (lock.error) return { error: { _form: [lock.error] } };

  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "create_manual_bank_transaction_atomic",
    {
      p_payload: {
        bank_account_id: parsed.data.bank_account_id,
        counterpart_account_id: parsed.data.counterpart_account_id,
        transaction_date: parsed.data.transaction_date,
        type: parsed.data.type,
        amount: parsed.data.amount,
        reference_no: parsed.data.reference_no || null,
        description: parsed.data.description,
      },
    },
  );

  if (error) {
    return { error: { _form: [error.message] } };
  }

  revalidatePath("/kas-bank/mutasi");
  revalidatePath("/kas-bank/akun");
  revalidatePath("/buku-besar/journal");
  revalidatePath("/laporan-keuangan");
  return { data: data as unknown as ManualBankTransactionResult };
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
