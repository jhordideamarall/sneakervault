"use server";

import { createClient } from "@sneakervault/supabase/server";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { revalidatePath } from "next/cache";
import type { MarketplaceChannel } from "@/lib/marketplace/parsers";
import type { SettlementRow } from "@/lib/marketplace/settlement-parsers";

export type { SettlementRow } from "@/lib/marketplace/settlement-parsers";
export type SettlementPhase = "pending" | "released";

const ROLES = ["owner", "finance"] as const;

export type BankOption = { id: string; name: string; type: string };

export async function listActiveBankAccounts(): Promise<BankOption[]> {
  await requireRole([...ROLES]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("bank_accounts")
    .select("id, name, type")
    .eq("is_active", true)
    .order("is_default", { ascending: false });
  return (data ?? []).map((b) => ({ id: b.id, name: b.name, type: b.type as string }));
}

export type SettlementLineDiff = {
  order_id: string;
  net: number;
  fee: number;
  invoice_total: number | null;
  current_status: "none" | "pending" | "released" | null;
  action: "apply" | "skip" | "unmatched";
  reason?: string;
};

export type SettlementReconcile = {
  rows: SettlementLineDiff[];
  summary: { apply: number; skip: number; unmatched: number };
};

/** Preview: match settlement rows to invoices and decide per-row action. */
export async function reconcileSettlement(
  channel: MarketplaceChannel,
  phase: SettlementPhase,
  rows: SettlementRow[],
): Promise<SettlementReconcile> {
  await requireRole([...ROLES]);
  const supabase = await createClient();

  const orderIds = rows.map((r) => r.order_id).filter(Boolean);
  const byId = new Map<string, { total: number; status: "none" | "pending" | "released" }>();
  if (orderIds.length > 0) {
    const { data } = await supabase
      .from("sales_invoices")
      .select("marketplace_order_id, total, settlement_status")
      .eq("channel", channel)
      .in("marketplace_order_id", orderIds);
    for (const i of data ?? []) {
      if (i.marketplace_order_id) {
        byId.set(i.marketplace_order_id, {
          total: Number(i.total),
          status: (i.settlement_status ?? "none") as "none" | "pending" | "released",
        });
      }
    }
  }

  const diffs: SettlementLineDiff[] = rows.map((r) => {
    const inv = byId.get(r.order_id);
    if (!inv) {
      return { ...r, invoice_total: null, current_status: null, action: "unmatched" };
    }
    let action: SettlementLineDiff["action"] = "apply";
    let reason: string | undefined;
    if (phase === "pending") {
      if (inv.status !== "none") {
        action = "skip";
        reason = inv.status === "pending" ? "Sudah pending" : "Sudah cair";
      }
    } else {
      if (inv.status === "released") {
        action = "skip";
        reason = "Sudah cair";
      } else if (inv.status !== "pending") {
        action = "skip";
        reason = "Belum ada settlement pending";
      }
    }
    return { ...r, invoice_total: inv.total, current_status: inv.status, action, reason };
  });

  return {
    rows: diffs,
    summary: {
      apply: diffs.filter((d) => d.action === "apply").length,
      skip: diffs.filter((d) => d.action === "skip").length,
      unmatched: diffs.filter((d) => d.action === "unmatched").length,
    },
  };
}

export type SettlementResult = {
  matched: number;
  skipped: number;
  unmatched: string[];
  error?: string;
};

/** Commit settlement reconciliation atomically (2-phase) + record the batch. */
export async function commitSettlement(input: {
  channel: MarketplaceChannel;
  phase: SettlementPhase;
  bankAccountId?: string | null;
  settledDate?: string | null;
  settlementRef?: string | null;
  rows: SettlementRow[];
  fileName?: string;
}): Promise<SettlementResult> {
  const profile = await requireRole([...ROLES]);
  const supabase = await createClient();

  if (input.phase === "released" && !input.bankAccountId) {
    return { matched: 0, skipped: 0, unmatched: [], error: "Pilih akun bank tujuan pencairan" };
  }

  const payload = {
    channel: input.channel,
    phase: input.phase,
    bank_account_id: input.bankAccountId ?? null,
    settled_date: input.settledDate ?? null,
    settlement_ref: input.settlementRef ?? null,
    items: input.rows.map((r) => ({ order_id: r.order_id, net: r.net, fee: r.fee })),
  };

  const { data, error } = await supabase.rpc("settle_marketplace_atomic", { p_payload: payload });
  if (error) return { matched: 0, skipped: 0, unmatched: [], error: error.message };

  const result = data as { matched: number; skipped: number; unmatched: string[] };

  const net = input.rows.reduce((a, b) => a + b.net, 0);
  const fee = input.rows.reduce((a, b) => a + b.fee, 0);
  await supabase.from("marketplace_imports").insert({
    marketplace: input.channel,
    kind: "settlement",
    file_name: input.fileName ?? null,
    period_start: input.settledDate ?? new Date().toISOString().slice(0, 10),
    period_end: input.settledDate ?? new Date().toISOString().slice(0, 10),
    total_orders: result.matched,
    total_gmv: net,
    total_fee: fee,
    total_net: net,
    matched_count: result.matched,
    mismatch_count: result.unmatched.length,
    status: "confirmed",
    notes: `Settlement ${input.phase === "pending" ? "belum cair" : "cair"} ${input.channel.toUpperCase()}`,
    uploaded_by: profile.id,
    confirmed_by: profile.id,
    confirmed_at: new Date().toISOString(),
  });

  if (result.matched > 0) {
    await logActivity({
      user_id: profile.id,
      action: "settlement",
      entity_type: "sales_invoice",
      new_data: { phase: input.phase, channel: input.channel, count: result.matched },
    });
    revalidatePath("/penjualan/invoice");
    revalidatePath("/kas-bank/mutasi");
    revalidatePath("/buku-besar/journal");
    revalidatePath("/laporan-keuangan");
  }

  return result;
}
