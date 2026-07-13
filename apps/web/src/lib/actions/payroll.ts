"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@sneakervault/supabase/server";
import { payrollRunInputSchema } from "@sneakervault/shared";
import { createJournalEntry } from "@/lib/journal-engine";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";

const ROLES = ["owner", "finance"] as const;

function revalidatePayroll() {
  revalidatePath("/buku-besar/payroll");
  revalidatePath("/buku-besar/journal");
  revalidatePath("/laporan-keuangan");
}

export async function createPayrollRun(input: unknown) {
  const profile = await requireRole([...ROLES]);
  const parsed = payrollRunInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();

  const gross = parsed.data.lines.reduce(
    (sum, line) => sum + line.base_salary + line.allowances,
    0,
  );
  const deductions = parsed.data.lines.reduce((sum, line) => sum + line.deductions, 0);
  const net = gross - deductions;
  if (net < 0) return { error: { _form: ["Total potongan melebihi gaji"] } };
  if (gross <= 0) return { error: { _form: ["Total payroll harus lebih dari 0"] } };

  const { data: existing } = await (supabase as any)
    .from("payroll_runs")
    .select("id")
    .eq("period_month", parsed.data.period_month)
    .maybeSingle();
  if (existing?.id) return { error: { _form: ["Payroll periode ini sudah dibuat"] } };

  type JournalLine = Parameters<typeof createJournalEntry>[0]["lines"][number];
  let bankAccountRef: Pick<JournalLine, "account_code" | "account_id"> | null = null;
  let selectedBankBalance = 0;
  if (parsed.data.bank_account_id) {
    const { data: bank, error: bankError } = await (supabase as any)
      .from("bank_accounts")
      .select("coa_account_id, current_balance, type, is_active")
      .eq("id", parsed.data.bank_account_id)
      .single();
    if (bankError || !bank) {
      return { error: { _form: ["Akun bank/kas payroll tidak ditemukan"] } };
    }
    if (!bank.is_active) {
      return { error: { _form: ["Akun bank/kas payroll tidak aktif"] } };
    }
    selectedBankBalance = Number(bank.current_balance ?? 0);
    if (selectedBankBalance < net) {
      return { error: { _form: ["Saldo akun bank/kas tidak cukup untuk payroll"] } };
    }
    bankAccountRef = bank.coa_account_id
      ? { account_id: bank.coa_account_id }
      : {
          account_code:
            bank.type === "cash"
              ? "1.1.01"
              : bank.type === "marketplace_balance"
                ? "1.1.03"
                : "1.1.02",
        };
  }

  const { data: run, error } = await (supabase as any)
    .from("payroll_runs")
    .insert({
      period_month: parsed.data.period_month,
      payment_date: parsed.data.payment_date,
      bank_account_id: parsed.data.bank_account_id ?? null,
      gross_amount: gross,
      deductions,
      net_amount: net,
      status: "posted",
      notes: parsed.data.notes || null,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !run) return { error: { _form: [error?.message ?? "Payroll gagal dibuat"] } };

  const { error: lineError } = await (supabase as any)
    .from("payroll_lines")
    .insert(
      parsed.data.lines.map((line) => ({
        payroll_run_id: run.id,
        employee_id: line.employee_id,
        base_salary: line.base_salary,
        allowances: line.allowances,
        deductions: line.deductions,
        net_salary: line.base_salary + line.allowances - line.deductions,
        notes: line.notes || null,
      })),
    );
  if (lineError) {
    await (supabase as any).from("payroll_runs").delete().eq("id", run.id);
    return { error: { _form: [lineError.message] } };
  }

  let bankTransactionInserted = false;
  if (parsed.data.bank_account_id && net > 0) {
    const newBalance = selectedBankBalance - net;
    const { error: balanceError } = await (supabase as any)
      .from("bank_accounts")
      .update({ current_balance: newBalance })
      .eq("id", parsed.data.bank_account_id);
    if (balanceError) {
      await (supabase as any).from("payroll_runs").delete().eq("id", run.id);
      return { error: { _form: [balanceError.message] } };
    }

    const { error: bankTxError } = await (supabase as any)
      .from("bank_transactions")
      .insert({
        bank_account_id: parsed.data.bank_account_id,
        transaction_date: parsed.data.payment_date,
        type: "debit",
        amount: net,
        balance_after: newBalance,
        description: `Pembayaran payroll ${parsed.data.period_month}`,
        related_entity_type: "payroll_run",
        related_entity_id: run.id,
        is_reconciled: false,
        created_by: profile.id,
      });
    if (bankTxError) {
      await (supabase as any)
        .from("bank_accounts")
        .update({ current_balance: selectedBankBalance })
        .eq("id", parsed.data.bank_account_id);
      await (supabase as any).from("payroll_runs").delete().eq("id", run.id);
      return { error: { _form: [bankTxError.message] } };
    }
    bankTransactionInserted = true;
  }

  const creditLines: JournalLine[] = [];
  if (net > 0) {
    creditLines.push(
      bankAccountRef
        ? { ...bankAccountRef, credit: net, description: "Pembayaran gaji" }
        : { account_code: "2.1.03", credit: net, description: "Hutang gaji" },
    );
  }
  if (deductions > 0) {
    creditLines.push({
      account_code: "2.1.04",
      credit: deductions,
      description: "Hutang BPJS / PPh / potongan payroll",
    });
  }

  const journal = await createJournalEntry({
    entry_date: parsed.data.payment_date,
    description: `Payroll ${parsed.data.period_month}`,
    source_type: "other",
    source_id: run.id,
    user_id: profile.id,
    lines: [
      { account_code: "6.5", debit: gross, description: "Beban gaji gross" },
      ...creditLines,
    ],
  });
  if (journal.error) {
    if (parsed.data.bank_account_id && net > 0) {
      await (supabase as any)
        .from("bank_accounts")
        .update({ current_balance: selectedBankBalance })
        .eq("id", parsed.data.bank_account_id);
      if (bankTransactionInserted) {
        await (supabase as any)
          .from("bank_transactions")
          .delete()
          .eq("related_entity_type", "payroll_run")
          .eq("related_entity_id", run.id);
      }
    }
    await (supabase as any).from("payroll_runs").delete().eq("id", run.id);
    return { error: { _form: [journal.error] } };
  }

  const { error: journalLinkError } = await (supabase as any)
    .from("payroll_runs")
    .update({ journal_entry_id: journal.id })
    .eq("id", run.id);
  if (journalLinkError) return { error: { _form: [journalLinkError.message] } };

  await logActivity({
    user_id: profile.id,
    action: "create",
    entity_type: "payroll_run",
    entity_id: run.id,
    new_data: {
      period_month: parsed.data.period_month,
      gross,
      deductions,
      net,
      employee_count: parsed.data.lines.length,
    },
  });
  revalidatePayroll();
  revalidatePath("/kas-bank/akun");
  revalidatePath("/kas-bank/mutasi");
  return { data: { id: run.id, journal_id: journal.id } };
}
