"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@sneakervault/supabase/server";
import { fiscalPeriodSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";

function revalidatePeriods() {
  revalidatePath("/buku-besar/periode");
  revalidatePath("/buku-besar/journal");
  revalidatePath("/laporan-keuangan");
}

export async function closePeriod(input: unknown) {
  const profile = await requireRole(["owner", "finance"]);
  const parsed = fiscalPeriodSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { year, month, reason } = parsed.data;
  const { data: existing } = await supabase
    .from("fiscal_periods")
    .select("id, status")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  let periodId: string | null = existing?.id ?? null;
  if (existing) {
    const { error } = await supabase
      .from("fiscal_periods")
      .update({
        status: "closed",
        closed_by: profile.id,
        closed_at: new Date().toISOString(),
        notes: reason.trim(),
      })
      .eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase
      .from("fiscal_periods")
      .insert({
        year,
        month,
        status: "closed",
        closed_by: profile.id,
        closed_at: new Date().toISOString(),
        notes: reason.trim(),
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    periodId = data.id;
  }

  await logActivity({
    user_id: profile.id,
    action: "close_period",
    entity_type: "fiscal_period",
    entity_id: periodId ?? undefined,
    new_data: { year, month, reason },
  });

  revalidatePeriods();
  return { success: true };
}

export async function reopenPeriod(input: unknown) {
  const profile = await requireRole(["owner"]);
  const parsed = fiscalPeriodSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { year, month, reason } = parsed.data;
  const { data: existing } = await supabase
    .from("fiscal_periods")
    .select("id, status")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (!existing) return { error: "Periode belum pernah ditutup" };

  const { error } = await supabase
    .from("fiscal_periods")
    .update({
      status: "open",
      closed_by: null,
      closed_at: null,
      notes: reason.trim(),
    })
    .eq("id", existing.id);
  if (error) return { error: error.message };

  await logActivity({
    user_id: profile.id,
    action: "reopen_period",
    entity_type: "fiscal_period",
    entity_id: existing.id,
    old_data: { status: existing.status },
    new_data: { year, month, reason },
  });

  revalidatePeriods();
  return { success: true };
}
