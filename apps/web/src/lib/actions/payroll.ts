"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@sneakervault/supabase/server";
import { payrollRunInputSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";

const ROLES = ["owner", "finance"] as const;

function revalidatePayroll() {
  revalidatePath("/buku-besar/payroll");
  revalidatePath("/buku-besar/journal");
  revalidatePath("/laporan-keuangan");
  revalidatePath("/kas-bank/akun");
  revalidatePath("/kas-bank/mutasi");
}

type ParsedPayrollLine = {
  employee_id: string;
  base_salary: number;
  allowances: number;
  deductions: number;
  components: Array<{
    name: string;
    kind: "earning" | "deduction";
    amount: number;
  }>;
  notes?: string;
};

function normalizePayrollLines(lines: ParsedPayrollLine[]) {
  return lines.map((line) => {
    if (line.components.length === 0) return line;
    const baseSalary =
      line.components.find(
        (component) =>
          component.kind === "earning" &&
          component.name.trim().toLocaleLowerCase("id-ID") === "gaji pokok",
      )?.amount ?? 0;
    const earnings = line.components
      .filter((component) => component.kind === "earning")
      .reduce((sum, component) => sum + component.amount, 0);
    const deductions = line.components
      .filter((component) => component.kind === "deduction")
      .reduce((sum, component) => sum + component.amount, 0);
    return {
      ...line,
      base_salary: baseSalary,
      allowances: earnings - baseSalary,
      deductions,
    };
  });
}

export async function createPayrollRun(input: unknown) {
  await requireRole([...ROLES]);
  const parsed = payrollRunInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const payrollLines = normalizePayrollLines(parsed.data.lines);
  const { data, error } = await supabase.rpc(
    "create_payroll_run_atomic",
    {
      p_payload: {
        period_month: parsed.data.period_month,
        payment_date: parsed.data.payment_date,
        bank_account_id: parsed.data.bank_account_id ?? null,
        notes: parsed.data.notes ?? null,
        lines: payrollLines,
      },
    },
  );
  if (error) return { error: { _form: [error.message] } };

  revalidatePayroll();
  return { data };
}

export async function updatePayrollRun(id: string, input: unknown) {
  const profile = await requireRole([...ROLES]);
  const parsed = payrollRunInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const payrollLines = normalizePayrollLines(parsed.data.lines);
  const { data, error } = await supabase.rpc(
    "update_payroll_run_with_components_atomic",
    {
      p_run_id: id,
      p_payload: {
        period_month: parsed.data.period_month,
        payment_date: parsed.data.payment_date,
        bank_account_id: parsed.data.bank_account_id ?? null,
        notes: parsed.data.notes ?? null,
        lines: payrollLines,
      },
    },
  );
  if (error) return { error: { _form: [error.message] } };

  await logActivity({
    user_id: profile.id,
    action: "update",
    entity_type: "payroll_run",
    entity_id: id,
    new_data: {
      period_month: parsed.data.period_month,
      employee_count: payrollLines.length,
    },
  });
  revalidatePayroll();
  return { data };
}

export async function settlePayrollLiability(input: {
  run_id: string;
  bank_account_id: string;
  payment_date: string;
}) {
  await requireRole([...ROLES]);
  if (!input.run_id || !input.bank_account_id || !input.payment_date) {
    return { error: "Payroll, akun bayar, dan tanggal pembayaran wajib diisi" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "settle_payroll_liability_atomic",
    {
      p_run_id: input.run_id,
      p_bank_account_id: input.bank_account_id,
      p_payment_date: input.payment_date,
    },
  );
  if (error) return { error: error.message };

  revalidatePayroll();
  return { data };
}
