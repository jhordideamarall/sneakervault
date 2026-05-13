"use server";

import { createClient } from "@sneakervault/supabase/server";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { revalidatePath } from "next/cache";

const ROLES = ["owner", "finance"] as const;

export type BankStatementRow = {
  date: string; // ISO or standard format
  description: string;
  type: "debit" | "credit";
  amount: number;
  reference?: string;
};

export type MatchResult = {
  statement_row_idx: number;
  transaction_id: string;
  confidence: "exact" | "partial";
};

export async function reconcileBankTransactions(
  bankAccountId: string,
  matches: MatchResult[],
) {
  const profile = await requireRole([...ROLES]);
  const supabase = await createClient();

  if (matches.length === 0) return { error: "Tidak ada transaksi untuk direkonsiliasi" };

  const transactionIds = matches.map((m) => m.transaction_id);

  const { error } = await supabase
    .from("bank_transactions")
    .update({ is_reconciled: true })
    .in("id", transactionIds)
    .eq("bank_account_id", bankAccountId);

  if (error) return { error: error.message };

  await logActivity({
    user_id: profile.id,
    action: "reconcile",
    entity_type: "bank_account",
    entity_id: bankAccountId,
    new_data: { matched_count: matches.length },
  });

  revalidatePath("/kas-bank/mutasi");
  revalidatePath("/kas-bank/rekonsiliasi");
  revalidatePath("/overview");

  return { success: true, count: matches.length };
}

export async function getUnreconciledTransactions(bankAccountId: string) {
  await requireRole([...ROLES]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bank_transactions")
    .select("*")
    .eq("bank_account_id", bankAccountId)
    .eq("is_reconciled", false)
    .order("transaction_date", { ascending: true });

  if (error) return [];
  return data;
}
