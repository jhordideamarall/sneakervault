"use server";

import { createJournalEntry } from "@/lib/journal-engine";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { createClient } from "@sneakervault/supabase/server";
import { revalidatePath } from "next/cache";
import { assertPeriodOpen } from "@/lib/fiscal-periods";

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
  const lock = await assertPeriodOpen(data.entry_date);
  if (lock.error) return { error: { _form: [lock.error] } };
  if (!data.lines || data.lines.length < 2) {
    return { error: { _form: ["Jurnal minimal 2 baris"] } };
  }

  const invalidLine = data.lines.find(
    (line) =>
      !line.account_code ||
      line.debit < 0 ||
      line.credit < 0 ||
      (line.debit > 0) === (line.credit > 0),
  );
  if (invalidLine) {
    return {
      error: {
        _form: [
          "Setiap baris harus memilih akun dan mengisi tepat salah satu nilai Debit atau Kredit",
        ],
      },
    };
  }

  const totalDebit = data.lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = data.lines.reduce((s, l) => s + (l.credit || 0), 0);
  if (totalDebit <= 0 || Math.abs(totalDebit - totalCredit) > 0.01) {
    return {
      error: {
        _form: [
          `Jurnal tidak balance: total debit Rp ${totalDebit.toLocaleString("id-ID")} ≠ total kredit Rp ${totalCredit.toLocaleString("id-ID")}`,
        ],
      },
    };
  }

  const supabase = await createClient();
  const resolved = await resolveLeafAccountIds(
    supabase,
    data.lines.map((line) => line.account_code),
  );
  if (resolved.error) {
    return { error: { _form: [resolved.error] } };
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

async function resolveLeafAccountIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  codes: string[],
): Promise<{ ids?: Map<string, string>; error?: string }> {
  const uniqueCodes = Array.from(new Set(codes));
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("id, code, is_active")
    .in("code", uniqueCodes);

  if (error) return { error: error.message };

  const accounts = (data ?? []) as Array<{
    id: string;
    code: string;
    is_active: boolean;
  }>;
  const byCode = new Map(accounts.map((account) => [account.code, account]));
  const missing = uniqueCodes.find((code) => !byCode.has(code));
  if (missing) return { error: `Akun ${missing} tidak ditemukan` };

  const inactive = accounts.find((account) => !account.is_active);
  if (inactive) return { error: `Akun ${inactive.code} sudah tidak aktif` };

  const accountIds = accounts.map((account) => account.id);
  const { data: children, error: childrenError } = await supabase
    .from("chart_of_accounts")
    .select("parent_id")
    .in("parent_id", accountIds)
    .limit(accountIds.length);
  if (childrenError) return { error: childrenError.message };

  const parentIds = new Set(
    ((children ?? []) as Array<{ parent_id: string | null }>)
      .map((child) => child.parent_id)
      .filter((id): id is string => Boolean(id)),
  );
  const parent = accounts.find((account) => parentIds.has(account.id));
  if (parent) {
    return {
      error: `Akun ${parent.code} adalah kelompok. Pilih akun detail agar laporan tidak salah.`,
    };
  }

  return {
    ids: new Map(accounts.map((account) => [account.code, account.id])),
  };
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
  const lock = await assertPeriodOpen(data.entry_date);
  if (lock.error) return { error: { _form: [lock.error] } };
  if (!data.lines || data.lines.length < 2) {
    return { error: { _form: ["Jurnal minimal 2 baris"] } };
  }

  const invalidLine = data.lines.find(
    (line) =>
      !line.account_code ||
      line.debit < 0 ||
      line.credit < 0 ||
      (line.debit > 0) === (line.credit > 0),
  );
  if (invalidLine) {
    return {
      error: {
        _form: [
          "Setiap baris harus memilih akun dan mengisi tepat salah satu nilai Debit atau Kredit",
        ],
      },
    };
  }

  const totalDebit = data.lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = data.lines.reduce((s, l) => s + (l.credit || 0), 0);
  if (totalDebit <= 0 || Math.abs(totalDebit - totalCredit) > 0.01) {
    return {
      error: {
        _form: [
          `Jurnal tidak balance: debit Rp ${totalDebit.toLocaleString("id-ID")} ≠ kredit Rp ${totalCredit.toLocaleString("id-ID")}`,
        ],
      },
    };
  }

  const supabase = await createClient();

  // Verify entry exists and is editable. Owner/finance may override posted
  // system journals for accounting corrections; source documents are not
  // changed by this action.
  const { data: existing } = await supabase
    .from("journal_entries")
    .select("id, source_type, status, entry_date, description, notes, total_debit, total_credit")
    .eq("id", data.id)
    .single();

  if (!existing) {
    return { error: { _form: ["Jurnal tidak ditemukan"] } };
  }
  const ex = existing as {
    source_type: string;
    status: string;
    entry_date: string;
    description: string;
    notes: string | null;
    total_debit: number;
    total_credit: number;
  };
  if (ex.status === "reversed") {
    return { error: { _form: ["Jurnal yang sudah di-reverse tidak bisa diedit"] } };
  }

  // Resolve only active posting accounts. Parent/group accounts would make
  // leaf-based financial statements silently omit the journal amount.
  const resolved = await resolveLeafAccountIds(
    supabase,
    data.lines.map((line) => line.account_code),
  );
  if (resolved.error || !resolved.ids) {
    return {
      error: { _form: [resolved.error ?? "Akun jurnal tidak valid"] },
    };
  }

  const { error: updateError } = await supabase.rpc(
    "update_manual_journal_atomic",
    {
      p_entry_id: data.id,
      p_entry_date: data.entry_date,
      p_description: data.description,
      p_notes: data.notes ?? null,
      p_lines: data.lines,
    },
  );
  if (updateError) {
    return { error: { _form: [updateError.message] } };
  }

  await logActivity({
    user_id: profile.id,
    action: ex.source_type === "manual" ? "update_manual_journal" : "manual_override_journal",
    entity_type: "journal_entry",
    entity_id: data.id,
    old_data: {
      source_type: ex.source_type,
      entry_date: ex.entry_date,
      description: ex.description,
      notes: ex.notes,
      total_debit: ex.total_debit,
      total_credit: ex.total_credit,
    },
    new_data: {
      source_type: ex.source_type,
      entry_date: data.entry_date,
      description: data.description,
      notes: data.notes ?? null,
      total_debit: totalDebit,
      total_credit: totalCredit,
      lines: data.lines,
    },
  });

  revalidatePath("/buku-besar/journal");
  revalidatePath("/laporan-keuangan");
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

  const { error: delErr } = await supabase.rpc(
    "delete_manual_journal_atomic",
    { p_entry_id: id },
  );

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
