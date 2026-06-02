import { createClient } from "@sneakervault/supabase/server";

export type PeriodLockCheck =
  | { locked: false }
  | { locked: true; year: number; month: number; message: string };

function yearMonthFromDate(input: string | Date): { year: number; month: number } {
  if (input instanceof Date) {
    return { year: input.getFullYear(), month: input.getMonth() + 1 };
  }

  const datePart = input.slice(0, 10);
  const [year, month] = datePart.split("-").map(Number);
  if (!year || !month) throw new Error("Tanggal transaksi tidak valid");
  return { year, month };
}

export async function getPeriodLockStatus(
  input: string | Date,
): Promise<PeriodLockCheck> {
  const { year, month } = yearMonthFromDate(input);
  const supabase = await createClient();
  const { data } = await supabase
    .from("fiscal_periods")
    .select("status")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (data?.status === "closed") {
    return {
      locked: true,
      year,
      month,
      message: `Periode ${String(month).padStart(2, "0")}/${year} sudah ditutup`,
    };
  }

  return { locked: false };
}

export async function assertPeriodOpen(
  input: string | Date,
): Promise<{ error?: string }> {
  const status = await getPeriodLockStatus(input);
  if (status.locked) return { error: status.message };
  return {};
}
