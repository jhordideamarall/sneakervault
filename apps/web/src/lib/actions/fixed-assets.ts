"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@sneakervault/supabase/server";
import { fixedAssetInputSchema } from "@sneakervault/shared";
import { createJournalEntry } from "@/lib/journal-engine";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { z } from "zod";

const ROLES = ["owner", "finance"] as const;
type ParsedFixedAssetInput = z.infer<typeof fixedAssetInputSchema>;
type JournalLine = Parameters<typeof createJournalEntry>[0]["lines"][number];

function revalidateAssets() {
  revalidatePath("/aset");
  revalidatePath("/kas-bank/akun");
  revalidatePath("/kas-bank/mutasi");
  revalidatePath("/buku-besar/journal");
  revalidatePath("/laporan-keuangan");
}

function assetRowFromInput(input: ParsedFixedAssetInput, createdBy?: string) {
  return {
    asset_code: input.asset_code || null,
    name: input.name,
    acquisition_date: input.acquisition_date,
    acquisition_cost: input.acquisition_cost,
    salvage_value: input.salvage_value,
    useful_life_months: input.useful_life_months,
    method: input.method,
    location: input.location || null,
    department: input.department || null,
    notes: input.notes || null,
    status: input.status ?? "active",
    ...(createdBy ? { created_by: createdBy } : {}),
  };
}

function fallbackBankAccountRef(type: string): Pick<JournalLine, "account_code"> {
  if (type === "cash") return { account_code: "1.1.01" };
  if (type === "marketplace_balance") return { account_code: "1.1.03" };
  return { account_code: "1.1.02" };
}

export async function createFixedAsset(input: unknown) {
  const profile = await requireRole([...ROLES]);
  const parsed = fixedAssetInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();

  const bankAccountId = parsed.data.bank_account_id ?? null;
  let bankCurrentBalance = 0;
  let bankCreditRef: Pick<JournalLine, "account_code" | "account_id"> | null = null;
  if (bankAccountId) {
    const { data: bank, error: bankError } = await (supabase as any)
      .from("bank_accounts")
      .select("id, name, type, coa_account_id, current_balance, is_active")
      .eq("id", bankAccountId)
      .single();
    if (bankError || !bank) {
      return { error: { _form: ["Akun sumber dana aset tidak ditemukan"] } };
    }
    if (!bank.is_active) {
      return { error: { _form: ["Akun sumber dana aset tidak aktif"] } };
    }
    bankCurrentBalance = Number(bank.current_balance ?? 0);
    if (bankCurrentBalance < parsed.data.acquisition_cost) {
      return {
        error: {
          _form: [
            `Saldo ${bank.name} (${bankCurrentBalance}) tidak cukup untuk aset ${parsed.data.acquisition_cost}`,
          ],
        },
      };
    }
    bankCreditRef = bank.coa_account_id
      ? { account_id: bank.coa_account_id }
      : fallbackBankAccountRef(bank.type);
  }

  const { data, error } = await (supabase as any)
    .from("fixed_assets")
    .insert({
      ...assetRowFromInput(parsed.data, profile.id),
      accumulated_depreciation: 0,
    })
    .select("id")
    .single();
  if (error || !data) return { error: { _form: [error?.message ?? "Aset gagal dibuat"] } };

  let bankTransactionId: string | null = null;
  if (bankAccountId) {
    const newBalance = bankCurrentBalance - parsed.data.acquisition_cost;
    const { error: balanceError } = await (supabase as any)
      .from("bank_accounts")
      .update({ current_balance: newBalance })
      .eq("id", bankAccountId);
    if (balanceError) {
      await (supabase as any).from("fixed_assets").delete().eq("id", data.id);
      return { error: { _form: [balanceError.message] } };
    }

    const { data: bankTx, error: bankTxError } = await (supabase as any)
      .from("bank_transactions")
      .insert({
        bank_account_id: bankAccountId,
        transaction_date: parsed.data.acquisition_date,
        type: "debit",
        amount: parsed.data.acquisition_cost,
        balance_after: newBalance,
        description: `Perolehan aset tetap ${parsed.data.name}`,
        related_entity_type: "fixed_asset",
        related_entity_id: data.id,
        is_reconciled: false,
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (bankTxError || !bankTx) {
      await (supabase as any)
        .from("bank_accounts")
        .update({ current_balance: bankCurrentBalance })
        .eq("id", bankAccountId);
      await (supabase as any).from("fixed_assets").delete().eq("id", data.id);
      return {
        error: { _form: [bankTxError?.message ?? "Mutasi kas/bank aset gagal dibuat"] },
      };
    }
    bankTransactionId = bankTx.id;
  }

  const creditLine: JournalLine = bankCreditRef
    ? {
        ...bankCreditRef,
        credit: parsed.data.acquisition_cost,
        description: "Kas/Bank keluar untuk aset tetap",
      }
    : {
        account_code: "2.1.01",
        credit: parsed.data.acquisition_cost,
        description: "Hutang perolehan aset tetap",
      };
  const journal = await createJournalEntry({
    entry_date: parsed.data.acquisition_date,
    description: `Perolehan aset tetap ${parsed.data.name}`,
    source_type: "other",
    source_id: data.id,
    user_id: profile.id,
    lines: [
      { account_code: "1.2.01", debit: parsed.data.acquisition_cost, description: parsed.data.name },
      creditLine,
    ],
  });
  if (journal.error) {
    if (bankAccountId) {
      await (supabase as any)
        .from("bank_accounts")
        .update({ current_balance: bankCurrentBalance })
        .eq("id", bankAccountId);
      if (bankTransactionId) {
        await (supabase as any)
          .from("bank_transactions")
          .delete()
          .eq("id", bankTransactionId);
      }
    }
    await (supabase as any).from("fixed_assets").delete().eq("id", data.id);
    return { error: { _form: [journal.error] } };
  }

  await logActivity({
    user_id: profile.id,
    action: "create",
    entity_type: "fixed_asset",
    entity_id: data.id,
    new_data: parsed.data,
  });
  revalidateAssets();
  return { data };
}

export async function updateFixedAsset(id: string, input: unknown) {
  const profile = await requireRole([...ROLES]);
  const parsed = fixedAssetInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { error } = await (supabase as any)
    .from("fixed_assets")
    .update({
      ...assetRowFromInput(parsed.data),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: { _form: [error.message] } };
  await logActivity({
    user_id: profile.id,
    action: "update",
    entity_type: "fixed_asset",
    entity_id: id,
    new_data: parsed.data,
  });
  revalidateAssets();
  return { success: true };
}

const disposeAssetSchema = z.object({
  disposal_date: z.string().min(1, "Tanggal disposal wajib diisi"),
  reason: z.string().trim().optional(),
});

export async function disposeFixedAsset(id: string, input: unknown) {
  const profile = await requireRole([...ROLES]);
  const parsed = disposeAssetSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { data: asset, error } = await (supabase as any)
    .from("fixed_assets")
    .select("id, name, acquisition_cost, accumulated_depreciation, status, notes")
    .eq("id", id)
    .single();
  if (error || !asset) return { error: "Aset tidak ditemukan" };
  if (asset.status === "disposed") return { error: "Aset sudah disposed" };

  const cost = Number(asset.acquisition_cost ?? 0);
  const accumulated = Math.min(cost, Number(asset.accumulated_depreciation ?? 0));
  const bookValue = Math.max(0, cost - accumulated);
  const lines: Parameters<typeof createJournalEntry>[0]["lines"] = [];
  if (accumulated > 0) {
    lines.push({
      account_code: "1.2.98",
      debit: accumulated,
      description: `Hapus akumulasi depresiasi ${asset.name}`,
    });
  }
  if (bookValue > 0) {
    lines.push({
      account_code: "6.6",
      debit: bookValue,
      description: `Rugi pelepasan aset ${asset.name}`,
    });
  }
  lines.push({
    account_code: "1.2.01",
    credit: cost,
    description: `Hapus aset tetap ${asset.name}`,
  });

  const journal = await createJournalEntry({
    entry_date: parsed.data.disposal_date,
    description: `Disposal aset tetap ${asset.name}`,
    source_type: "other",
    source_id: id,
    user_id: profile.id,
    lines,
  });
  if (journal.error) return { error: journal.error };

  const disposalNote = [
    asset.notes,
    `[Disposed ${parsed.data.disposal_date}] ${parsed.data.reason || "Aset dilepas/dihapus"}`,
  ]
    .filter(Boolean)
    .join("\n");
  const { error: updateError } = await (supabase as any)
    .from("fixed_assets")
    .update({
      status: "disposed",
      notes: disposalNote,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updateError) return { error: updateError.message };

  await logActivity({
    user_id: profile.id,
    action: "dispose",
    entity_type: "fixed_asset",
    entity_id: id,
    new_data: {
      disposal_date: parsed.data.disposal_date,
      reason: parsed.data.reason,
      cost,
      accumulated_depreciation: accumulated,
      book_value: bookValue,
      journal_id: journal.id,
    },
  });
  revalidateAssets();
  return { success: true, journal_id: journal.id };
}

function monthEnd(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function depreciationForMonth(asset: {
  acquisition_cost: number;
  salvage_value: number;
  useful_life_months: number;
  method: "straight_line" | "double_declining";
  accumulated_depreciation: number;
}) {
  const depreciable = Math.max(0, Number(asset.acquisition_cost) - Number(asset.salvage_value));
  const remaining = Math.max(0, depreciable - Number(asset.accumulated_depreciation ?? 0));
  if (remaining <= 0) return 0;
  if (asset.method === "double_declining") {
    const rate = 2 / Math.max(1, Number(asset.useful_life_months));
    return Math.min(remaining, Math.round(Number(asset.acquisition_cost) * rate));
  }
  return Math.min(remaining, Math.round(depreciable / Math.max(1, Number(asset.useful_life_months))));
}

export async function runFixedAssetDepreciation(args: {
  year: number;
  month: number;
  user_id: string;
}) {
  const supabase = await createClient();
  const period = `${args.year}-${String(args.month).padStart(2, "0")}`;
  const { data: existing } = await (supabase as any)
    .from("fixed_asset_depreciation_runs")
    .select("id")
    .eq("period_month", period)
    .maybeSingle();
  if (existing?.id) return { success: true, amount: 0, skipped: true };

  const { data: assets, error } = await (supabase as any)
    .from("fixed_assets")
    .select("id, name, acquisition_cost, salvage_value, useful_life_months, method, accumulated_depreciation, status")
    .eq("status", "active");
  if (error) return { error: error.message };

  let total = 0;
  const lines: Array<{ asset_id: string; amount: number }> = [];
  for (const asset of (assets ?? []) as Array<{
    id: string;
    name: string;
    acquisition_cost: number;
    salvage_value: number;
    useful_life_months: number;
    method: "straight_line" | "double_declining";
    accumulated_depreciation: number;
    status: string;
  }>) {
    const amount = depreciationForMonth(asset);
    if (amount <= 0) continue;
    total += amount;
    lines.push({ asset_id: asset.id, amount });
  }
  if (total <= 0) return { success: true, amount: 0 };

  const journal = await createJournalEntry({
    entry_date: monthEnd(args.year, args.month),
    description: `Depresiasi aset tetap ${period}`,
    source_type: "closing",
    user_id: args.user_id,
    lines: [
      { account_code: "6.6", debit: total, description: "Beban penyusutan aset tetap" },
      { account_code: "1.2.98", credit: total, description: "Akumulasi penyusutan aset tetap" },
    ],
  });
  if (journal.error) return { error: journal.error };

  const { data: run, error: runError } = await (supabase as any)
    .from("fixed_asset_depreciation_runs")
    .insert({
      period_month: period,
      total_amount: total,
      journal_entry_id: journal.id,
      created_by: args.user_id,
    })
    .select("id")
    .single();
  if (runError || !run) return { error: runError?.message ?? "Run depresiasi gagal dicatat" };

  await (supabase as any).from("fixed_asset_depreciation_lines").insert(
    lines.map((line) => ({
      run_id: run.id,
      asset_id: line.asset_id,
      amount: line.amount,
    })),
  );
  for (const line of lines) {
    await (supabase as any).rpc("add_fixed_asset_depreciation", {
      p_asset_id: line.asset_id,
      p_amount: line.amount,
    });
  }
  revalidateAssets();
  return { success: true, amount: total, journal_id: journal.id };
}
