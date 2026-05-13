"use server";

import { createJournalEntry } from "@/lib/journal-engine";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { createClient } from "@sneakervault/supabase/server";
import { revalidatePath } from "next/cache";

const ALLOWED_ROLES = ["owner", "finance"] as const;

export async function createManualJournalEntry(data: {
  entry_date: string;
  description: string;
  notes?: string;
  lines: Array<{
    account_code: string;
    debit: number;
    credit: number;
    description?: string;
  }>;
}) {
  const profile = await requireRole([...ALLOWED_ROLES]);

  if (!data.entry_date || !data.description) {
    return { error: { _form: ["Tanggal dan deskripsi wajib diisi"] } };
  }
  if (!data.lines || data.lines.length < 2) {
    return { error: { _form: ["Jurnal minimal 2 baris"] } };
  }

  const totalDebit = data.lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = data.lines.reduce((s, l) => s + (l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return {
      error: {
        _form: [
          `Jurnal tidak balance: total debit Rp ${totalDebit.toLocaleString("id-ID")} ≠ total kredit Rp ${totalCredit.toLocaleString("id-ID")}`,
        ],
      },
    };
  }

  const result = await createJournalEntry({
    entry_date: data.entry_date,
    description: data.description,
    source_type: "manual",
    source_id: null,
    user_id: profile.id,
    lines: data.lines.map((l) => ({
      account_code: l.account_code,
      debit: l.debit || undefined,
      credit: l.credit || undefined,
      description: l.description,
    })),
  });

  if (result.error) {
    return { error: { _form: [result.error] } };
  }

  await logActivity({
    user_id: profile.id,
    action: "create_manual_journal",
    entity_type: "journal_entry",
    entity_id: result.id,
  });

  revalidatePath("/buku-besar/journal");
  return { success: true, id: result.id };
}

async function coaIdByCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  code: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("code", code)
    .single();
  return (data as { id: string } | null)?.id ?? null;
}

export async function updateManualJournalEntry(data: {
  id: string;
  entry_date: string;
  description: string;
  notes?: string;
  lines: Array<{
    account_code: string;
    debit: number;
    credit: number;
    description?: string;
  }>;
}) {
  const profile = await requireRole([...ALLOWED_ROLES]);

  if (!data.id) {
    return { error: { _form: ["ID jurnal tidak valid"] } };
  }
  if (!data.entry_date || !data.description) {
    return { error: { _form: ["Tanggal dan deskripsi wajib diisi"] } };
  }
  if (!data.lines || data.lines.length < 2) {
    return { error: { _form: ["Jurnal minimal 2 baris"] } };
  }

  const totalDebit = data.lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = data.lines.reduce((s, l) => s + (l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return {
      error: {
        _form: [
          `Jurnal tidak balance: debit Rp ${totalDebit.toLocaleString("id-ID")} ≠ kredit Rp ${totalCredit.toLocaleString("id-ID")}`,
        ],
      },
    };
  }

  const supabase = await createClient();

  // Verify entry exists and is editable (manual + posted)
  const { data: existing } = await supabase
    .from("journal_entries")
    .select("id, source_type, status")
    .eq("id", data.id)
    .single();

  if (!existing) {
    return { error: { _form: ["Jurnal tidak ditemukan"] } };
  }
  const ex = existing as { source_type: string; status: string };
  if (ex.source_type !== "manual") {
    return {
      error: {
        _form: [
          "Hanya jurnal manual yang bisa diedit. Jurnal otomatis dari transaksi harus dikoreksi lewat modul asalnya.",
        ],
      },
    };
  }
  if (ex.status === "reversed") {
    return { error: { _form: ["Jurnal yang sudah di-reverse tidak bisa diedit"] } };
  }

  // Resolve all account codes first
  const codeToId = new Map<string, string>();
  for (const l of data.lines) {
    if (codeToId.has(l.account_code)) continue;
    const id = await coaIdByCode(supabase, l.account_code);
    if (!id) {
      return { error: { _form: [`Akun ${l.account_code} tidak ditemukan`] } };
    }
    codeToId.set(l.account_code, id);
  }

  // Update header
  const { error: hdrErr } = await supabase
    .from("journal_entries")
    .update({
      entry_date: data.entry_date,
      description: data.description,
      notes: data.notes ?? null,
      total_debit: totalDebit,
      total_credit: totalCredit,
    })
    .eq("id", data.id);
  if (hdrErr) {
    return { error: { _form: [hdrErr.message] } };
  }

  // Delete old lines + insert new
  await supabase.from("journal_lines").delete().eq("entry_id", data.id);

  const lineRows = data.lines.map((l, idx) => ({
    entry_id: data.id,
    account_id: codeToId.get(l.account_code)!,
    debit: l.debit || 0,
    credit: l.credit || 0,
    description: l.description ?? null,
    line_order: idx,
  }));

  const { error: lineErr } = await supabase.from("journal_lines").insert(lineRows);
  if (lineErr) {
    return { error: { _form: [`Gagal update lines: ${lineErr.message}`] } };
  }

  await logActivity({
    user_id: profile.id,
    action: "update_manual_journal",
    entity_type: "journal_entry",
    entity_id: data.id,
  });

  revalidatePath("/buku-besar/journal");
  return { success: true };
}

export async function deleteManualJournalEntry(id: string) {
  const profile = await requireRole([...ALLOWED_ROLES]);

  if (!id) {
    return { error: "ID tidak valid" };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("journal_entries")
    .select("id, source_type, description")
    .eq("id", id)
    .single();

  if (!existing) {
    return { error: "Jurnal tidak ditemukan" };
  }
  const ex = existing as { source_type: string; description: string };
  if (ex.source_type !== "manual") {
    return {
      error:
        "Hanya jurnal manual yang bisa dihapus. Jurnal otomatis harus dibatalkan lewat modul asalnya.",
    };
  }

  // Cascade delete: lines deleted first then header
  await supabase.from("journal_lines").delete().eq("entry_id", id);
  const { error: delErr } = await supabase
    .from("journal_entries")
    .delete()
    .eq("id", id);

  if (delErr) {
    return { error: delErr.message };
  }

  await logActivity({
    user_id: profile.id,
    action: "delete_manual_journal",
    entity_type: "journal_entry",
    entity_id: id,
  });

  revalidatePath("/buku-besar/journal");
  return { success: true };
}
