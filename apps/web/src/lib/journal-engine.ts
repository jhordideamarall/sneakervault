// Server-side auto-journal engine.
// Maps business transactions to balanced journal entries.
//
// Conventions:
//   - Asset, Expense, COGS → normal balance DEBIT (increase=debit, decrease=credit)
//   - Liability, Equity, Revenue → normal balance CREDIT
//
// CoA codes used (must match phase4_buku_besar seed):
//   1.1.01 Kas               1.1.02 Bank             1.1.03 Saldo Marketplace
//   1.1.04 Piutang Usaha     1.1.05 Persediaan Barang
//   2.1.01 Hutang Usaha      2.1.02 Hutang Pajak
//   4.1.01 Penjualan WA/Offline  4.1.02 Penjualan Shopee  4.1.03 Penjualan TikTok
//   5.1   HPP Barang Terjual
//   6.1   Beban Administrasi Marketplace
//   6.2   Beban Diskon & Promosi
//   6.3   Beban Pengiriman
//   6.7   Beban Penyesuaian Stok
//   6.8+  Beban operasional PDF scope

import { createClient } from "@sneakervault/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertPeriodOpen } from "@/lib/fiscal-periods";

type JournalLineInput = {
  account_code: string;
  debit?: number;
  credit?: number;
  description?: string;
};

export type JournalSourceType =
  | "manual"
  | "purchase_invoice"
  | "vendor_payment"
  | "sales_invoice"
  | "customer_payment"
  | "stock_adjustment"
  | "expense"
  | "opening_balance"
  | "closing"
  | "other";

async function nextEntryNumber(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc(
    "generate_journal_entry_number",
  );
  if (error || !data) {
    // fallback: timestamp-based
    return `JRN-${Date.now()}`;
  }
  return data as string;
}

async function coaIdByCode(
  supabase: SupabaseClient,
  code: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("code", code)
    .single();
  return (data as { id: string } | null)?.id ?? null;
}

async function bankCodeByAccountId(
  supabase: SupabaseClient,
  bankAccountId: string | null,
): Promise<string> {
  if (!bankAccountId) return "1.1.01";

  const { data: ba } = await supabase
    .from("bank_accounts")
    .select("type")
    .eq("id", bankAccountId)
    .single();
  const type = (ba as { type: string } | null)?.type;
  if (type === "cash") return "1.1.01";
  if (type === "marketplace_balance") return "1.1.03";
  return "1.1.02";
}

export async function createJournalEntry(args: {
  entry_date: string;
  description: string;
  source_type: JournalSourceType;
  source_id?: string | null;
  user_id?: string | null;
  lines: JournalLineInput[];
}): Promise<{ id?: string; error?: string }> {
  const lock = await assertPeriodOpen(args.entry_date);
  if (lock.error) return { error: lock.error };

  const supabase = await createClient();

  let totalDebit = 0;
  let totalCredit = 0;
  for (const l of args.lines) {
    totalDebit += l.debit ?? 0;
    totalCredit += l.credit ?? 0;
  }
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return {
      error: `Journal not balanced: dr=${totalDebit} cr=${totalCredit}`,
    };
  }

  // Resolve account ids
  const codeToId = new Map<string, string>();
  for (const l of args.lines) {
    if (codeToId.has(l.account_code)) continue;
    const id = await coaIdByCode(supabase, l.account_code);
    if (!id) return { error: `CoA code ${l.account_code} not found` };
    codeToId.set(l.account_code, id);
  }

  const entry_number = await nextEntryNumber(supabase);

  const { data: entry, error: entryErr } = await supabase
    .from("journal_entries")
    .insert({
      entry_number,
      entry_date: args.entry_date,
      description: args.description,
      source_type: args.source_type,
      source_id: args.source_id ?? null,
      total_debit: totalDebit,
      total_credit: totalCredit,
      status: "posted",
      created_by: args.user_id ?? null,
    })
    .select("id")
    .single();
  if (entryErr || !entry) return { error: entryErr?.message ?? "insert failed" };

  const lineRows = args.lines.map((l, idx) => ({
    entry_id: entry.id,
    account_id: codeToId.get(l.account_code)!,
    debit: l.debit ?? 0,
    credit: l.credit ?? 0,
    description: l.description ?? null,
    line_order: idx,
  }));
  const { error: lineErr } = await supabase
    .from("journal_lines")
    .insert(lineRows);
  if (lineErr) {
    await supabase.from("journal_entries").delete().eq("id", entry.id);
    return { error: lineErr.message };
  }

  return { id: entry.id };
}

// ─── Specific journal templates ────────────────────────────

export async function journalForPurchaseInvoice(args: {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  subtotal: number;
  tax: number;
  user_id?: string | null;
}): Promise<{ id?: string; error?: string }> {
  const lines: JournalLineInput[] = [
    {
      account_code: "1.1.05",
      debit: args.subtotal,
      description: "Pembelian persediaan",
    },
  ];
  if (args.tax > 0) {
    lines.push({
      account_code: "2.1.02",
      debit: args.tax,
      description: "PPN masukan",
    });
  }
  lines.push({
    account_code: "2.1.01",
    credit: args.subtotal + args.tax,
    description: "Hutang vendor",
  });
  return createJournalEntry({
    entry_date: args.invoice_date,
    description: `Faktur pembelian ${args.invoice_number}`,
    source_type: "purchase_invoice",
    source_id: args.invoice_id,
    user_id: args.user_id,
    lines,
  });
}

export async function journalForVendorPayment(args: {
  payment_id: string;
  payment_number: string;
  payment_date: string;
  amount: number;
  bank_account_id: string | null;
  user_id?: string | null;
}): Promise<{ id?: string; error?: string }> {
  // Determine bank/cash code: try lookup from bank_accounts.type
  const supabase = await createClient();
  const bankCode = await bankCodeByAccountId(supabase, args.bank_account_id);

  return createJournalEntry({
    entry_date: args.payment_date,
    description: `Pembayaran vendor ${args.payment_number}`,
    source_type: "vendor_payment",
    source_id: args.payment_id,
    user_id: args.user_id,
    lines: [
      {
        account_code: "2.1.01",
        debit: args.amount,
        description: "Pelunasan hutang vendor",
      },
      {
        account_code: bankCode,
        credit: args.amount,
        description: "Kas/Bank keluar",
      },
    ],
  });
}

export async function journalForSalesInvoice(args: {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  channel: "wa" | "shopee" | "tiktok" | "tokopedia" | "offline" | "website" | "mixed";
  total: number;
  subtotal: number;
  discount: number;
  shipping: number;
  marketplace_fee: number;
  tax: number;
  cogs_total: number;
  user_id?: string | null;
}): Promise<{ id?: string; error?: string }> {
  // Revenue account by channel
  let revenueCode = "4.1.01"; // WA/Offline default
  if (args.channel === "shopee") revenueCode = "4.1.02";
  else if (args.channel === "tiktok") revenueCode = "4.1.03";
  else if (args.channel === "tokopedia") revenueCode = "4.1.04";

  const lines: JournalLineInput[] = [];

  // 1) AR (Debit Asset) = total (net amount to be collected)
  lines.push({
    account_code: "1.1.04",
    debit: args.total,
    description: "Piutang penjualan",
  });

  // 2) Marketplace fee (Debit Expense)
  if (args.marketplace_fee > 0) {
    lines.push({
      account_code: "6.1",
      debit: args.marketplace_fee,
      description: "Beban administrasi marketplace",
    });
  }

  // 3) Discount (Debit Expense)
  if (args.discount > 0) {
    lines.push({
      account_code: "6.2",
      debit: args.discount,
      description: "Beban diskon & promosi",
    });
  }

  // 4) Revenue (Credit Revenue) = subtotal + shipping
  lines.push({
    account_code: revenueCode,
    credit: args.subtotal + args.shipping,
    description: "Pendapatan penjualan",
  });

  // 5) Tax (Credit Liability)
  if (args.tax > 0) {
    lines.push({
      account_code: "2.1.02",
      credit: args.tax,
      description: "Hutang pajak (PPN)",
    });
  }

  // Balance Check: total + fee + disc = subtotal + shipping + tax
  // which is: total = subtotal + shipping + tax - fee - disc

  // 6) COGS recognition
  if (args.cogs_total > 0) {
    lines.push({
      account_code: "5.1",
      debit: args.cogs_total,
      description: "HPP barang terjual",
    });
    lines.push({
      account_code: "1.1.05",
      credit: args.cogs_total,
      description: "Persediaan keluar",
    });
  }

  return createJournalEntry({
    entry_date: args.invoice_date,
    description: `Invoice penjualan ${args.invoice_number}`,
    source_type: "sales_invoice",
    source_id: args.invoice_id,
    user_id: args.user_id,
    lines,
  });
}

export async function journalForCustomerPayment(args: {
  payment_id: string;
  payment_number: string;
  payment_date: string;
  amount: number;
  bank_account_id: string | null;
  user_id?: string | null;
}): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const bankCode = await bankCodeByAccountId(supabase, args.bank_account_id);

  return createJournalEntry({
    entry_date: args.payment_date,
    description: `Penerimaan customer ${args.payment_number}`,
    source_type: "customer_payment",
    source_id: args.payment_id,
    user_id: args.user_id,
    lines: [
      {
        account_code: bankCode,
        debit: args.amount,
        description: "Kas/Bank masuk",
      },
      {
        account_code: "1.1.04",
        credit: args.amount,
        description: "Pelunasan piutang",
      },
    ],
  });
}

export async function journalForExpense(args: {
  expense_id: string;
  expense_number: string;
  expense_date: string;
  category_account_code: string;
  category_name: string;
  amount: number;
  bank_account_id: string | null;
  user_id?: string | null;
}): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const bankCode = await bankCodeByAccountId(supabase, args.bank_account_id);

  return createJournalEntry({
    entry_date: args.expense_date,
    description: `Pengeluaran ${args.expense_number} - ${args.category_name}`,
    source_type: "expense",
    source_id: args.expense_id,
    user_id: args.user_id,
    lines: [
      {
        account_code: args.category_account_code,
        debit: args.amount,
        description: args.category_name,
      },
      {
        account_code: bankCode,
        credit: args.amount,
        description: "Kas/Bank keluar",
      },
    ],
  });
}

export async function journalForStockAdjustment(args: {
  session_id: string;
  opname_number: string;
  adjustment_date: string;
  amount: number;
  direction: "increase" | "decrease";
  user_id?: string | null;
}): Promise<{ id?: string; error?: string }> {
  if (args.amount <= 0) return { id: undefined };

  const lines: JournalLineInput[] =
    args.direction === "increase"
      ? [
          {
            account_code: "1.1.05",
            debit: args.amount,
            description: "Selisih lebih stock opname",
          },
          {
            account_code: "6.7",
            credit: args.amount,
            description: "Koreksi beban penyesuaian stok",
          },
        ]
      : [
          {
            account_code: "6.7",
            debit: args.amount,
            description: "Selisih kurang stock opname",
          },
          {
            account_code: "1.1.05",
            credit: args.amount,
            description: "Persediaan berkurang saat opname",
          },
        ];

  return createJournalEntry({
    entry_date: args.adjustment_date,
    description: `Stock opname ${args.opname_number}`,
    source_type: "stock_adjustment",
    source_id: args.session_id,
    user_id: args.user_id,
    lines,
  });
}

export async function reverseJournalBySource(
  source_type: JournalSourceType,
  source_id: string,
  reason?: string,
): Promise<{ reversed: number; error?: string }> {
  const supabase = await createClient();
  const { data: entries } = await supabase
    .from("journal_entries")
    .select("id, entry_number, status, total_debit, total_credit, journal_lines(account_id, debit, credit, description, line_order)")
    .eq("source_type", source_type)
    .eq("source_id", source_id)
    .eq("status", "posted");

  if (!entries || entries.length === 0) return { reversed: 0 };

  let reversed = 0;
  for (const e of entries as Array<{
    id: string;
    entry_number: string;
    total_debit: number;
    total_credit: number;
    journal_lines: Array<{
      account_id: string;
      debit: number;
      credit: number;
      description: string | null;
      line_order: number;
    }>;
  }>) {
    const new_number = await nextEntryNumber(supabase);
    const { data: newEntry, error: insErr } = await supabase
      .from("journal_entries")
      .insert({
        entry_number: new_number,
        entry_date: new Date().toISOString().slice(0, 10),
        description: `Reverse ${e.entry_number}${reason ? ` — ${reason}` : ""}`,
        source_type,
        source_id,
        total_debit: e.total_credit,
        total_credit: e.total_debit,
        status: "posted",
        notes: reason ?? null,
      })
      .select("id")
      .single();
    if (insErr || !newEntry) continue;

    const lineRows = e.journal_lines.map((l) => ({
      entry_id: newEntry.id,
      account_id: l.account_id,
      debit: l.credit,
      credit: l.debit,
      description: `Reverse: ${l.description ?? ""}`,
      line_order: l.line_order,
    }));
    await supabase.from("journal_lines").insert(lineRows);
    await supabase
      .from("journal_entries")
      .update({ status: "reversed", reversed_by: newEntry.id })
      .eq("id", e.id);
    reversed++;
  }

  return { reversed };
}
