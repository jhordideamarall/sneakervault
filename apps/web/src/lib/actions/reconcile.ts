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

function toDate(value: string): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  const local = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (local) {
    const year = Number(local[3]) < 100 ? 2000 + Number(local[3]) : Number(local[3]);
    return new Date(Date.UTC(year, Number(local[2]) - 1, Number(local[1])));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetween(a: string, b: string): number | null {
  const da = toDate(a);
  const db = toDate(b);
  if (!da || !db) return null;
  return Math.abs(da.getTime() - db.getTime()) / 86400000;
}

function amountMatches(a: number, b: number) {
  return Math.abs(Number(a) - Number(b)) < 0.01;
}

export async function reconcileBankTransactions(
  bankAccountId: string,
  matches: MatchResult[],
  statementRows: BankStatementRow[],
) {
  const profile = await requireRole([...ROLES]);
  const supabase = await createClient();

  if (matches.length === 0) return { error: "Tidak ada transaksi untuk direkonsiliasi" };
  if (statementRows.length === 0) return { error: "File mutasi bank kosong" };

  const transactionIds = Array.from(new Set(matches.map((m) => m.transaction_id)));
  if (transactionIds.length !== matches.length) {
    return { error: "Satu transaksi internal tidak boleh dipakai untuk lebih dari satu baris statement" };
  }

  const statementIndexes = new Set<number>();
  for (const match of matches) {
    if (statementIndexes.has(match.statement_row_idx)) {
      return { error: "Satu baris statement tidak boleh dipakai untuk lebih dari satu transaksi" };
    }
    statementIndexes.add(match.statement_row_idx);
  }

  const { data: txRows, error: txError } = await supabase
    .from("bank_transactions")
    .select("id, bank_account_id, transaction_date, type, amount, reference_no, description, is_reconciled")
    .in("id", transactionIds)
    .eq("bank_account_id", bankAccountId);

  if (txError) return { error: txError.message };

  const txById = new Map((txRows ?? []).map((tx) => [tx.id, tx]));
  for (const match of matches) {
    const statement = statementRows[match.statement_row_idx];
    const tx = txById.get(match.transaction_id);
    if (!statement || !tx) return { error: "Data rekonsiliasi tidak valid" };
    if (tx.is_reconciled) return { error: "Ada transaksi yang sudah direkonsiliasi" };
    if (tx.type !== statement.type) return { error: "Tipe debit/kredit tidak cocok dengan statement" };
    if (!amountMatches(Number(tx.amount), statement.amount)) {
      return { error: "Nominal statement tidak cocok dengan transaksi internal" };
    }

    const dateGap = daysBetween(String(tx.transaction_date), statement.date);
    const statementRef = String(statement.reference ?? "").trim().toLowerCase();
    const txRef = String(tx.reference_no ?? "").trim().toLowerCase();
    const referenceText = `${statementRef} ${statement.description}`.toLowerCase();
    const txText = `${txRef} ${tx.description ?? ""}`.toLowerCase();
    const hasTextSignal =
      referenceText.length >= 4 &&
      txText.length >= 4 &&
      ((txRef.length >= 4 && referenceText.includes(txRef)) ||
        (statementRef.length >= 4 && txText.includes(statementRef)));

    if (dateGap !== null && dateGap > 14 && !hasTextSignal) {
      return { error: "Tanggal statement terlalu jauh dari transaksi internal" };
    }
  }

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
    new_data: {
      matched_count: matches.length,
      matches: matches.map((match) => {
        const statement = statementRows[match.statement_row_idx];
        return {
          transaction_id: match.transaction_id,
          statement_row_idx: match.statement_row_idx,
          confidence: match.confidence,
          statement_date: statement?.date,
          statement_amount: statement?.amount,
          statement_type: statement?.type,
          statement_reference: statement?.reference,
        };
      }),
    },
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
