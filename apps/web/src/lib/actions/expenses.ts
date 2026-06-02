"use server";

import { createClient } from "@sneakervault/supabase/server";
import {
  expenseCategoryInputSchema,
  expenseInputSchema,
} from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { revalidatePath } from "next/cache";
import { journalForExpense, reverseJournalBySource } from "../journal-engine";
import { assertPeriodOpen } from "@/lib/fiscal-periods";

const OPERATIONAL_ROLES = [
  "owner",
  "finance",
  "admin_gudang",
  "admin_online",
] as const;
const FINANCE_ROLES = ["owner", "finance"] as const;

function revalidateExpenses() {
  revalidatePath("/kas-bank/pengeluaran");
  revalidatePath("/kas-bank/mutasi");
  revalidatePath("/kas-bank/akun");
  revalidatePath("/laporan-keuangan/laba-rugi");
  revalidatePath("/buku-besar/journal");
}

async function assertExpenseAccount(accountCode: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("chart_of_accounts")
    .select("code, type, is_active")
    .eq("code", accountCode)
    .single();
  if (!data || data.type !== "expense" || !data.is_active) {
    return "Akun beban tidak aktif atau tidak ditemukan";
  }
  return null;
}

export async function createExpenseCategory(input: unknown) {
  const profile = await requireRole(["owner"]);
  const parsed = expenseCategoryInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const accountError = await assertExpenseAccount(parsed.data.account_code);
  if (accountError) return { error: { _form: [accountError] } };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expense_categories")
    .insert({
      name: parsed.data.name.trim(),
      account_code: parsed.data.account_code,
      sort_order: parsed.data.sort_order,
      is_active: parsed.data.is_active,
      is_system: false,
      created_by: profile.id,
      updated_by: profile.id,
    })
    .select()
    .single();
  if (error) return { error: { _form: [error.message] } };

  await logActivity({
    user_id: profile.id,
    action: "create",
    entity_type: "expense_category",
    entity_id: data.id,
    new_data: {
      name: parsed.data.name,
      account_code: parsed.data.account_code,
    },
  });

  revalidatePath("/kas-bank/pengeluaran");
  return { data };
}

export async function updateExpenseCategory(input: unknown) {
  const profile = await requireRole(["owner"]);
  const parsed = expenseCategoryInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  if (!parsed.data.id) return { error: { _form: ["Kategori tidak valid"] } };

  const accountError = await assertExpenseAccount(parsed.data.account_code);
  if (accountError) return { error: { _form: [accountError] } };

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("expense_categories")
    .select("*")
    .eq("id", parsed.data.id)
    .single();
  if (!before) return { error: { _form: ["Kategori tidak ditemukan"] } };

  const { data, error } = await supabase
    .from("expense_categories")
    .update({
      name: parsed.data.name.trim(),
      account_code: parsed.data.account_code,
      sort_order: parsed.data.sort_order,
      is_active: parsed.data.is_active,
      updated_by: profile.id,
    })
    .eq("id", parsed.data.id)
    .select()
    .single();
  if (error) return { error: { _form: [error.message] } };

  await logActivity({
    user_id: profile.id,
    action: "update",
    entity_type: "expense_category",
    entity_id: parsed.data.id,
    old_data: before,
    new_data: data,
  });

  revalidatePath("/kas-bank/pengeluaran");
  return { data };
}

export async function archiveExpenseCategory(id: string) {
  const profile = await requireRole(["owner"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expense_categories")
    .update({ is_active: false, updated_by: profile.id })
    .eq("id", id)
    .select("id, name")
    .single();
  if (error) return { error: error.message };

  await logActivity({
    user_id: profile.id,
    action: "archive",
    entity_type: "expense_category",
    entity_id: id,
    new_data: data,
  });

  revalidatePath("/kas-bank/pengeluaran");
  return { success: true };
}

export async function createExpense(input: unknown) {
  const profile = await requireRole([...OPERATIONAL_ROLES]);
  const parsed = expenseInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const lock = await assertPeriodOpen(parsed.data.expense_date);
  if (lock.error) return { error: { _form: [lock.error] } };

  const supabase = await createClient();
  const { data: category } = await supabase
    .from("expense_categories")
    .select("id, name, account_code, is_active")
    .eq("id", parsed.data.category_id)
    .single();
  if (!category || !category.is_active) {
    return { error: { _form: ["Kategori tidak aktif atau tidak ditemukan"] } };
  }

  const { data: bank } = await supabase
    .from("bank_accounts")
    .select("id, is_active")
    .eq("id", parsed.data.bank_account_id)
    .single();
  if (!bank || !bank.is_active) {
    return { error: { _form: ["Akun kas/bank tidak aktif"] } };
  }

  const { data: expenseNumber, error: numberError } = await supabase.rpc(
    "generate_expense_number",
  );
  if (numberError) return { error: { _form: [numberError.message] } };

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      expense_number: expenseNumber,
      expense_date: parsed.data.expense_date,
      category_id: parsed.data.category_id,
      description: parsed.data.description.trim(),
      amount: parsed.data.amount,
      payment_method: parsed.data.payment_method,
      bank_account_id: parsed.data.bank_account_id,
      receipt_path: parsed.data.receipt_path || null,
      status: "draft",
      created_by: profile.id,
    })
    .select()
    .single();
  if (error) return { error: { _form: [error.message] } };

  await logActivity({
    user_id: profile.id,
    action: "create",
    entity_type: "expense",
    entity_id: data.id,
    new_data: {
      expense_number: data.expense_number,
      category: category.name,
      amount: parsed.data.amount,
    },
  });

  revalidateExpenses();
  return { data };
}

export async function approveExpense(id: string) {
  const profile = await requireRole([...FINANCE_ROLES]);
  const supabase = await createClient();
  const { data: expense } = await supabase
    .from("expenses")
    .select("id, expense_number, status")
    .eq("id", id)
    .single();
  if (!expense) return { error: "Pengeluaran tidak ditemukan" };
  if (expense.status !== "draft") {
    return { error: "Hanya pengeluaran Draft yang bisa di-approve" };
  }

  const { error } = await supabase
    .from("expenses")
    .update({
      status: "approved",
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  await logActivity({
    user_id: profile.id,
    action: "approve",
    entity_type: "expense",
    entity_id: id,
    new_data: { expense_number: expense.expense_number },
  });

  revalidateExpenses();
  return { success: true };
}

export async function rejectExpense(id: string, reason?: string) {
  const profile = await requireRole([...FINANCE_ROLES]);
  const supabase = await createClient();
  const { data: expense } = await supabase
    .from("expenses")
    .select("id, expense_number, status")
    .eq("id", id)
    .single();
  if (!expense) return { error: "Pengeluaran tidak ditemukan" };
  if (expense.status === "paid" || expense.status === "voided") {
    return { error: "Pengeluaran yang sudah paid/void tidak bisa ditolak" };
  }

  const { error } = await supabase
    .from("expenses")
    .update({
      status: "rejected",
      rejected_by: profile.id,
      rejected_at: new Date().toISOString(),
      rejection_reason: reason?.trim() || null,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  await logActivity({
    user_id: profile.id,
    action: "reject",
    entity_type: "expense",
    entity_id: id,
    new_data: { expense_number: expense.expense_number, reason },
  });

  revalidateExpenses();
  return { success: true };
}

export async function payExpense(id: string) {
  const profile = await requireRole([...FINANCE_ROLES]);
  const supabase = await createClient();

  const { data: expense } = await supabase
    .from("expenses")
    .select(
      "id, expense_number, expense_date, amount, bank_account_id, status, expense_categories:category_id(name, account_code), bank_accounts:bank_account_id(id, name, current_balance, is_active)",
    )
    .eq("id", id)
    .single();
  if (!expense) return { error: "Pengeluaran tidak ditemukan" };
  if (expense.status !== "approved") {
    return { error: "Hanya pengeluaran Approved yang bisa dibayar" };
  }
  const lock = await assertPeriodOpen(expense.expense_date);
  if (lock.error) return { error: lock.error };

  const category = expense.expense_categories as unknown as {
    name: string;
    account_code: string;
  } | null;
  const bank = expense.bank_accounts as unknown as {
    id: string;
    name: string;
    current_balance: number;
    is_active: boolean;
  } | null;
  if (!category) return { error: "Kategori pengeluaran tidak ditemukan" };
  if (!bank || !bank.is_active) return { error: "Akun kas/bank tidak aktif" };

  const amount = Number(expense.amount);
  const currentBalance = Number(bank.current_balance);
  const newBalance = currentBalance - amount;
  if (newBalance < 0) {
    return {
      error: `Saldo ${bank.name} (${currentBalance}) tidak cukup untuk membayar ${amount}`,
    };
  }

  await supabase
    .from("bank_accounts")
    .update({ current_balance: newBalance })
    .eq("id", bank.id);

  const { data: bankTx, error: txError } = await supabase
    .from("bank_transactions")
    .insert({
      bank_account_id: bank.id,
      transaction_date: expense.expense_date,
      type: "debit",
      amount,
      balance_after: newBalance,
      reference_no: expense.expense_number,
      description: `Pengeluaran ${expense.expense_number} - ${category.name}`,
      related_entity_type: "expense",
      related_entity_id: expense.id,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (txError || !bankTx) {
    await supabase
      .from("bank_accounts")
      .update({ current_balance: currentBalance })
      .eq("id", bank.id);
    return { error: txError?.message ?? "Mutasi bank gagal dibuat" };
  }

  const journal = await journalForExpense({
    expense_id: expense.id,
    expense_number: expense.expense_number,
    expense_date: expense.expense_date,
    category_account_code: category.account_code,
    category_name: category.name,
    amount,
    bank_account_id: bank.id,
    user_id: profile.id,
  });
  if (journal.error) {
    await supabase
      .from("bank_accounts")
      .update({ current_balance: currentBalance })
      .eq("id", bank.id);
    await supabase.from("bank_transactions").delete().eq("id", bankTx.id);
    return { error: journal.error };
  }

  const { error: paidError } = await supabase
    .from("expenses")
    .update({
      status: "paid",
      paid_by: profile.id,
      paid_at: new Date().toISOString(),
    })
    .eq("id", expense.id);
  if (paidError) {
    await reverseJournalBySource("expense", expense.id, paidError.message);
    await supabase
      .from("bank_accounts")
      .update({ current_balance: currentBalance })
      .eq("id", bank.id);
    await supabase.from("bank_transactions").delete().eq("id", bankTx.id);
    return { error: paidError.message };
  }

  await logActivity({
    user_id: profile.id,
    action: "pay",
    entity_type: "expense",
    entity_id: expense.id,
    new_data: {
      expense_number: expense.expense_number,
      amount,
      bank_account: bank.name,
    },
  });

  revalidateExpenses();
  return { success: true };
}

export async function voidExpense(id: string, reason?: string) {
  const profile = await requireRole([...FINANCE_ROLES]);
  const supabase = await createClient();
  const { data: expense } = await supabase
    .from("expenses")
    .select("id, expense_number, expense_date, amount, bank_account_id, status")
    .eq("id", id)
    .single();
  if (!expense) return { error: "Pengeluaran tidak ditemukan" };
  if (expense.status === "voided") return { error: "Pengeluaran sudah void" };

  if (expense.status === "paid") {
    const { data: bank } = await supabase
      .from("bank_accounts")
      .select("id, current_balance, is_active")
      .eq("id", expense.bank_account_id)
      .single();
    if (!bank || !bank.is_active) return { error: "Akun kas/bank tidak aktif" };

    const restored = Number(bank.current_balance) + Number(expense.amount);
    await supabase
      .from("bank_accounts")
      .update({ current_balance: restored })
      .eq("id", bank.id);
    await supabase.from("bank_transactions").insert({
      bank_account_id: bank.id,
      transaction_date: new Date().toISOString().slice(0, 10),
      type: "credit",
      amount: Number(expense.amount),
      balance_after: restored,
      reference_no: expense.expense_number,
      description: `Void pengeluaran ${expense.expense_number}${reason ? ` - ${reason}` : ""}`,
      related_entity_type: "expense_void",
      related_entity_id: expense.id,
      created_by: profile.id,
    });
    await reverseJournalBySource("expense", expense.id, reason);
  }

  const { error } = await supabase
    .from("expenses")
    .update({
      status: "voided",
      voided_by: profile.id,
      voided_at: new Date().toISOString(),
      void_reason: reason?.trim() || null,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  await logActivity({
    user_id: profile.id,
    action: "void",
    entity_type: "expense",
    entity_id: id,
    new_data: { expense_number: expense.expense_number, reason },
  });

  revalidateExpenses();
  return { success: true };
}
