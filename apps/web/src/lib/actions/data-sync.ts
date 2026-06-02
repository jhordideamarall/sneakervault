"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@sneakervault/supabase/server";
import { createJournalEntry } from "@/lib/journal-engine";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { createStockMovement } from "./stock-movements";

export type DataSyncImportKind =
  | "suppliers"
  | "customers"
  | "products"
  | "bank_accounts"
  | "opening_balance"
  | "sales_outstanding"
  | "purchase_outstanding";

export type DataSyncImportResult = {
  inserted: number;
  updated: number;
  skipped: number;
  errors: { row: number; reason: string }[];
  journal_id?: string;
};

const optionalText = z.preprocess((value) => {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}, z.string().optional());

const requiredText = z.preprocess((value) => String(value ?? "").trim(), z.string().min(1));

const money = z.preprocess((value) => {
  if (typeof value === "number") return value;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const cleaned = raw
    .replace(/rp|idr/gi, "")
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "");
  const decimalComma = cleaned.includes(",") && cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".");
  const normalized = decimalComma
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/,/g, "");
  return Number(normalized);
}, z.number().finite());

const nonnegativeMoney = money.pipe(z.number().nonnegative());
const positiveMoney = money.pipe(z.number().positive());

const integer = z.preprocess((value) => {
  if (typeof value === "number") return Math.trunc(value);
  const n = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : value;
}, z.number().int());

function normalizeDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + value * 86400000).toISOString().slice(0, 10);
  }

  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, year, month, day] = iso;
    return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
  }
  const local = raw.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{2,4})$/);
  if (local) {
    const [, day, month, y] = local;
    const year = y!.length === 2 ? `20${y}` : y!;
    return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
}

const dateValue = z.preprocess(
  normalizeDate,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus format YYYY-MM-DD"),
);

const boolValue = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "ya", "yes", "y"].includes(text);
}, z.boolean());

const customerChannel = z.preprocess((value) => {
  const text = String(value ?? "wa").trim().toLowerCase();
  if (["whatsapp", "chat"].includes(text)) return "wa";
  if (["store", "toko"].includes(text)) return "offline";
  if (["campur", "all"].includes(text)) return "mixed";
  return text;
}, z.enum(["wa", "shopee", "tiktok", "offline", "website", "mixed"]).catch("wa"));

const bankAccountType = z.preprocess((value) => {
  const text = String(value ?? "bank").trim().toLowerCase();
  if (["kas", "tunai", "cash"].includes(text)) return "cash";
  if (["e-wallet", "ewallet", "qris"].includes(text)) return "ewallet";
  if (["marketplace", "saldo marketplace"].includes(text)) return "marketplace_balance";
  return "bank";
}, z.enum(["cash", "bank", "ewallet", "marketplace_balance"]));

const productCondition = z.preprocess((value) => {
  const text = String(value ?? "normal").trim().toLowerCase();
  if (["rusak", "cacat"].includes(text)) return "defect";
  if (["mati", "slow"].includes(text)) return "dormant";
  return text || "normal";
}, z.enum(["normal", "defect", "dormant"]).catch("normal"));

const supplierRowSchema = z.object({
  name: requiredText,
  contact_person: optionalText,
  phone: optionalText,
  email: optionalText,
  address: optionalText,
  notes: optionalText,
});

const customerRowSchema = z.object({
  name: requiredText,
  contact_person: optionalText,
  phone: optionalText,
  email: optionalText,
  address: optionalText,
  channel: customerChannel,
  npwp: optionalText,
  notes: optionalText,
});

const productRowSchema = z.object({
  brand: requiredText,
  model: requiredText,
  sku: requiredText,
  size: money.pipe(z.number().positive()),
  color: optionalText,
  barcode: requiredText,
  quantity: integer.pipe(z.number().int().nonnegative()).default(0),
  hpp: nonnegativeMoney.default(0),
  sell_price: nonnegativeMoney.default(0),
  price_offline: nonnegativeMoney.default(0),
  supplier_name: optionalText,
  condition: productCondition,
  defect_reason: optionalText,
});

const bankAccountRowSchema = z.object({
  name: requiredText,
  type: bankAccountType,
  bank_name: optionalText,
  account_number: optionalText,
  account_holder: optionalText,
  opening_balance: nonnegativeMoney.default(0),
  currency: optionalText.default("IDR"),
  is_default: boolValue.default(false),
  notes: optionalText,
});

const openingBalanceRowSchema = z.object({
  account_code: requiredText,
  description: optionalText,
  debit: nonnegativeMoney.default(0),
  credit: nonnegativeMoney.default(0),
});

const salesOutstandingRowSchema = z.object({
  invoice_number: optionalText,
  customer_name: requiredText,
  channel: customerChannel,
  invoice_date: dateValue,
  due_date: z.preprocess((value) => {
    const normalized = normalizeDate(value);
    return normalized || undefined;
  }, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  subtotal: nonnegativeMoney.default(0),
  discount: nonnegativeMoney.default(0),
  shipping: nonnegativeMoney.default(0),
  marketplace_fee: nonnegativeMoney.default(0),
  tax: nonnegativeMoney.default(0),
  total: positiveMoney,
  paid_amount: nonnegativeMoney.default(0),
  marketplace_order_id: optionalText,
  notes: optionalText,
});

const purchaseOutstandingRowSchema = z.object({
  invoice_number: optionalText,
  supplier_name: requiredText,
  invoice_date: dateValue,
  due_date: z.preprocess((value) => {
    const normalized = normalizeDate(value);
    return normalized || undefined;
  }, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  subtotal: nonnegativeMoney.default(0),
  tax: nonnegativeMoney.default(0),
  total: positiveMoney,
  paid_amount: nonnegativeMoney.default(0),
  notes: optionalText,
});

const optionsSchema = z.object({
  cutoff_date: dateValue.default(new Date().toISOString().slice(0, 10)),
});

function key(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function fieldError(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "row"}: ${issue.message}`).join("; ");
}

async function supplierIdByName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: string,
  createdBy: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from("suppliers")
    .select("id")
    .ilike("name", name)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data, error } = await supabase
    .from("suppliers")
    .insert({ name, notes: "Auto-created by data sync import" })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? `Supplier ${name} gagal dibuat`);

  await logActivity({
    user_id: createdBy,
    action: "create",
    entity_type: "supplier",
    entity_id: data.id,
    new_data: { name, source: "data_sync" },
  });
  return data.id as string;
}

async function customerIdByName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: string,
  channel: z.infer<typeof customerChannel>,
  createdBy: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .ilike("name", name)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data, error } = await supabase
    .from("customers")
    .insert({ name, channel, notes: "Auto-created by data sync import" })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? `Customer ${name} gagal dibuat`);

  await logActivity({
    user_id: createdBy,
    action: "create",
    entity_type: "customer",
    entity_id: data.id,
    new_data: { name, channel, source: "data_sync" },
  });
  return data.id as string;
}

async function importSuppliers(rows: unknown[], profileId: string): Promise<DataSyncImportResult> {
  const supabase = await createClient();
  const result: DataSyncImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  const { data: existingRows } = await supabase.from("suppliers").select("id, name");
  const existing = new Map((existingRows ?? []).map((row) => [key(row.name), row.id as string]));

  for (let i = 0; i < rows.length; i++) {
    const parsed = supplierRowSchema.safeParse(rows[i]);
    if (!parsed.success) {
      result.errors.push({ row: i + 2, reason: fieldError(parsed.error) });
      continue;
    }
    const row = parsed.data;
    const existingId = existing.get(key(row.name));
    const payload = { ...row, is_active: true };
    const response = existingId
      ? await supabase.from("suppliers").update(payload).eq("id", existingId)
      : await supabase.from("suppliers").insert(payload).select("id").single();

    if (response.error) {
      result.errors.push({ row: i + 2, reason: response.error.message });
      continue;
    }
    if (existingId) result.updated++;
    else {
      result.inserted++;
      const id = "data" in response ? response.data?.id : undefined;
      if (id) existing.set(key(row.name), id as string);
    }
  }

  await logActivity({ user_id: profileId, action: "data_sync_import", entity_type: "suppliers", new_data: result });
  return result;
}

async function importCustomers(rows: unknown[], profileId: string): Promise<DataSyncImportResult> {
  const supabase = await createClient();
  const result: DataSyncImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  const { data: existingRows } = await supabase.from("customers").select("id, name");
  const existing = new Map((existingRows ?? []).map((row) => [key(row.name), row.id as string]));

  for (let i = 0; i < rows.length; i++) {
    const parsed = customerRowSchema.safeParse(rows[i]);
    if (!parsed.success) {
      result.errors.push({ row: i + 2, reason: fieldError(parsed.error) });
      continue;
    }
    const row = parsed.data;
    const existingId = existing.get(key(row.name));
    const payload = { ...row, email: row.email ?? null, is_active: true };
    const response = existingId
      ? await supabase.from("customers").update(payload).eq("id", existingId)
      : await supabase.from("customers").insert(payload).select("id").single();

    if (response.error) {
      result.errors.push({ row: i + 2, reason: response.error.message });
      continue;
    }
    if (existingId) result.updated++;
    else {
      result.inserted++;
      const id = "data" in response ? response.data?.id : undefined;
      if (id) existing.set(key(row.name), id as string);
    }
  }

  await logActivity({ user_id: profileId, action: "data_sync_import", entity_type: "customers", new_data: result });
  return result;
}

async function importProducts(
  rows: unknown[],
  profileId: string,
  cutoffDate: string,
): Promise<DataSyncImportResult> {
  const supabase = await createClient();
  const result: DataSyncImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  const { data: productRows } = await supabase
    .from("products")
    .select("id, sku, barcode, quantity");
  const bySku = new Map((productRows ?? []).map((row) => [key(row.sku), row]));
  const byBarcode = new Map((productRows ?? []).map((row) => [key(row.barcode), row]));

  for (let i = 0; i < rows.length; i++) {
    const parsed = productRowSchema.safeParse(rows[i]);
    if (!parsed.success) {
      result.errors.push({ row: i + 2, reason: fieldError(parsed.error) });
      continue;
    }
    const row = parsed.data;
    let supplierId: string | null = null;
    if (row.supplier_name) {
      try {
        supplierId = await supplierIdByName(supabase, row.supplier_name, profileId);
      } catch (error) {
        result.errors.push({ row: i + 2, reason: error instanceof Error ? error.message : "Supplier gagal dibuat" });
        continue;
      }
    }

    const existing = byBarcode.get(key(row.barcode)) ?? bySku.get(key(row.sku));
    const payload = {
      brand: row.brand,
      model: row.model,
      sku: row.sku,
      size: row.size,
      color: row.color ?? null,
      barcode: row.barcode,
      quantity: row.quantity,
      hpp: row.hpp,
      sell_price: row.sell_price,
      price_offline: row.price_offline || row.sell_price,
      default_supplier_id: supplierId,
      condition: row.condition,
      defect_reason: row.condition === "normal" ? null : row.defect_reason ?? "Imported from Accurate cutover",
      first_inbound_at: row.quantity > 0 ? `${cutoffDate}T00:00:00+07:00` : null,
      is_active: true,
    };

    const response = existing
      ? await supabase.from("products").update(payload).eq("id", existing.id)
      : await supabase.from("products").insert(payload).select("id, sku, barcode, quantity").single();
    if (response.error) {
      result.errors.push({ row: i + 2, reason: response.error.message });
      continue;
    }

    const productId = existing ? existing.id : ("data" in response ? response.data?.id : null);
    const previousQty = existing ? Number(existing.quantity ?? 0) : 0;
    const delta = row.quantity - previousQty;
    if (productId && row.quantity > 0 && Math.abs(delta) > 0) {
      const movement = await createStockMovement(supabase, {
        product_id: productId,
        type: existing ? "adjustment" : "inbound",
        quantity: Math.abs(delta),
        unit_cost: row.hpp,
        reference_type: "opening_balance",
        notes: existing
          ? `Cutover Accurate ${cutoffDate}: set stok ${previousQty} -> ${row.quantity}`
          : `Cutover Accurate ${cutoffDate}: saldo awal stok`,
      });
      if (movement.error) result.errors.push({ row: i + 2, reason: `Stock movement: ${movement.error}` });
    }

    if (existing) result.updated++;
    else {
      result.inserted++;
      if ("data" in response && response.data) {
        bySku.set(key(row.sku), response.data);
        byBarcode.set(key(row.barcode), response.data);
      }
    }
  }

  await logActivity({ user_id: profileId, action: "data_sync_import", entity_type: "products", new_data: result });
  return result;
}

async function importBankAccounts(rows: unknown[], profileId: string): Promise<DataSyncImportResult> {
  const supabase = await createClient();
  const result: DataSyncImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  const { data: existingRows } = await supabase.from("bank_accounts").select("id, name");
  const existing = new Map((existingRows ?? []).map((row) => [key(row.name), row.id as string]));

  for (let i = 0; i < rows.length; i++) {
    const parsed = bankAccountRowSchema.safeParse(rows[i]);
    if (!parsed.success) {
      result.errors.push({ row: i + 2, reason: fieldError(parsed.error) });
      continue;
    }
    const row = parsed.data;
    const existingId = existing.get(key(row.name));
    const payload = {
      ...row,
      bank_name: row.bank_name ?? null,
      account_number: row.account_number ?? null,
      account_holder: row.account_holder ?? null,
      current_balance: row.opening_balance,
      is_active: true,
    };

    if (row.is_default) {
      await supabase.from("bank_accounts").update({ is_default: false }).eq("is_default", true);
    }

    if (existingId) {
      const { count } = await supabase
        .from("bank_transactions")
        .select("id", { count: "exact", head: true })
        .eq("bank_account_id", existingId);
      if ((count ?? 0) > 0) {
        const metadata: Partial<typeof payload> = { ...payload };
        delete metadata.current_balance;
        delete metadata.opening_balance;
        const { error } = await supabase.from("bank_accounts").update(metadata).eq("id", existingId);
        if (error) result.errors.push({ row: i + 2, reason: error.message });
        else {
          result.updated++;
          result.errors.push({
            row: i + 2,
            reason: "Saldo tidak ditimpa karena akun sudah punya mutasi bank",
          });
        }
        continue;
      }
    }

    const response = existingId
      ? await supabase.from("bank_accounts").update(payload).eq("id", existingId)
      : await supabase.from("bank_accounts").insert(payload).select("id").single();
    if (response.error) {
      result.errors.push({ row: i + 2, reason: response.error.message });
      continue;
    }
    if (existingId) result.updated++;
    else result.inserted++;
  }

  await logActivity({ user_id: profileId, action: "data_sync_import", entity_type: "bank_accounts", new_data: result });
  return result;
}

async function importOpeningBalance(
  rows: unknown[],
  profileId: string,
  cutoffDate: string,
): Promise<DataSyncImportResult> {
  const supabase = await createClient();
  const result: DataSyncImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };

  const { data: existing } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("source_type", "opening_balance")
    .eq("entry_date", cutoffDate)
    .maybeSingle();
  if (existing?.id) {
    return {
      ...result,
      errors: [{ row: 1, reason: `Jurnal saldo awal tanggal ${cutoffDate} sudah ada` }],
    };
  }

  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("code")
    .eq("is_active", true);
  const accountCodes = new Set((accounts ?? []).map((row) => row.code as string));
  const lines: Array<{ account_code: string; debit?: number; credit?: number; description?: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const parsed = openingBalanceRowSchema.safeParse(rows[i]);
    if (!parsed.success) {
      result.errors.push({ row: i + 2, reason: fieldError(parsed.error) });
      continue;
    }
    const row = parsed.data;
    if (row.debit <= 0 && row.credit <= 0) {
      result.skipped++;
      continue;
    }
    if (row.debit > 0 && row.credit > 0) {
      result.errors.push({ row: i + 2, reason: "Isi salah satu saja: debit atau credit" });
      continue;
    }
    if (!accountCodes.has(row.account_code)) {
      result.errors.push({ row: i + 2, reason: `Akun ${row.account_code} tidak ditemukan` });
      continue;
    }
    lines.push({
      account_code: row.account_code,
      debit: row.debit || undefined,
      credit: row.credit || undefined,
      description: row.description,
    });
  }

  const totalDebit = lines.reduce((sum, line) => sum + (line.debit ?? 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + (line.credit ?? 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    result.errors.push({
      row: 1,
      reason: `Saldo awal tidak balance: debit ${totalDebit} vs credit ${totalCredit}`,
    });
    return result;
  }
  if (lines.length < 2) {
    result.errors.push({ row: 1, reason: "Minimal 2 baris saldo awal" });
    return result;
  }

  const journal = await createJournalEntry({
    entry_date: cutoffDate,
    description: `Saldo awal cutover Accurate ${cutoffDate}`,
    source_type: "opening_balance",
    user_id: profileId,
    lines,
  });
  if (journal.error) {
    result.errors.push({ row: 1, reason: journal.error });
    return result;
  }

  result.inserted = lines.length;
  result.journal_id = journal.id;
  await logActivity({
    user_id: profileId,
    action: "data_sync_opening_balance",
    entity_type: "journal_entry",
    entity_id: journal.id,
    new_data: { cutoff_date: cutoffDate, totalDebit, totalCredit, lines: lines.length },
  });
  return result;
}

async function importSalesOutstanding(rows: unknown[], profileId: string): Promise<DataSyncImportResult> {
  const supabase = await createClient();
  const result: DataSyncImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const parsed = salesOutstandingRowSchema.safeParse(rows[i]);
    if (!parsed.success) {
      result.errors.push({ row: i + 2, reason: fieldError(parsed.error) });
      continue;
    }
    const row = parsed.data;
    if (row.paid_amount >= row.total) {
      result.skipped++;
      continue;
    }

    let invoiceNumber = row.invoice_number;
    if (invoiceNumber) {
      const { data: existing } = await supabase
        .from("sales_invoices")
        .select("id")
        .eq("invoice_number", invoiceNumber)
        .maybeSingle();
      if (existing?.id) {
        result.skipped++;
        continue;
      }
    } else {
      const { data: generated, error } = await supabase.rpc("generate_sales_invoice_number");
      if (error || !generated) {
        result.errors.push({ row: i + 2, reason: error?.message ?? "Nomor invoice gagal dibuat" });
        continue;
      }
      invoiceNumber = generated as string;
    }

    let customerId: string;
    try {
      customerId = await customerIdByName(supabase, row.customer_name, row.channel, profileId);
    } catch (error) {
      result.errors.push({ row: i + 2, reason: error instanceof Error ? error.message : "Customer gagal dibuat" });
      continue;
    }

    const status = row.paid_amount > 0 ? "partial" : "issued";
    const subtotal = row.subtotal || row.total;
    const { data: invoice, error } = await supabase
      .from("sales_invoices")
      .insert({
        invoice_number: invoiceNumber,
        customer_id: customerId,
        customer_name: row.customer_name,
        channel: row.channel,
        invoice_date: row.invoice_date,
        due_date: row.due_date ?? null,
        subtotal,
        discount: row.discount,
        shipping: row.shipping,
        marketplace_fee: row.marketplace_fee,
        tax: row.tax,
        total: row.total,
        paid_amount: row.paid_amount,
        status,
        marketplace_order_id: row.marketplace_order_id ?? null,
        notes: `Cutover outstanding AR dari Accurate${row.notes ? `\n${row.notes}` : ""}`,
        created_by: profileId,
      })
      .select("id")
      .single();
    if (error || !invoice) {
      result.errors.push({ row: i + 2, reason: error?.message ?? "Invoice gagal dibuat" });
      continue;
    }

    await supabase.from("sales_invoice_lines").insert({
      invoice_id: invoice.id,
      product_id: null,
      product_label: "Saldo awal piutang dari Accurate",
      qty: 1,
      unit_price: subtotal,
      unit_cost: 0,
      subtotal,
      notes: "Cutover outstanding invoice; efek piutang masuk lewat opening balance",
    });
    result.inserted++;
  }

  await logActivity({ user_id: profileId, action: "data_sync_import", entity_type: "sales_outstanding", new_data: result });
  return result;
}

async function importPurchaseOutstanding(rows: unknown[], profileId: string): Promise<DataSyncImportResult> {
  const supabase = await createClient();
  const result: DataSyncImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const parsed = purchaseOutstandingRowSchema.safeParse(rows[i]);
    if (!parsed.success) {
      result.errors.push({ row: i + 2, reason: fieldError(parsed.error) });
      continue;
    }
    const row = parsed.data;
    if (row.paid_amount >= row.total) {
      result.skipped++;
      continue;
    }

    let invoiceNumber = row.invoice_number;
    if (invoiceNumber) {
      const { data: existing } = await supabase
        .from("purchase_invoices")
        .select("id")
        .eq("invoice_number", invoiceNumber)
        .maybeSingle();
      if (existing?.id) {
        result.skipped++;
        continue;
      }
    } else {
      const { data: generated, error } = await supabase.rpc("generate_purchase_invoice_number");
      if (error || !generated) {
        result.errors.push({ row: i + 2, reason: error?.message ?? "Nomor faktur gagal dibuat" });
        continue;
      }
      invoiceNumber = generated as string;
    }

    let supplierId: string;
    try {
      supplierId = await supplierIdByName(supabase, row.supplier_name, profileId);
    } catch (error) {
      result.errors.push({ row: i + 2, reason: error instanceof Error ? error.message : "Supplier gagal dibuat" });
      continue;
    }

    const status = row.paid_amount > 0 ? "partial" : "unpaid";
    const { error } = await supabase.from("purchase_invoices").insert({
      invoice_number: invoiceNumber,
      supplier_id: supplierId,
      po_id: null,
      invoice_date: row.invoice_date,
      due_date: row.due_date ?? null,
      subtotal: row.subtotal || row.total,
      tax: row.tax,
      total: row.total,
      paid_amount: row.paid_amount,
      status,
      notes: `Cutover outstanding AP dari Accurate${row.notes ? `\n${row.notes}` : ""}`,
      attachment_url: null,
      created_by: profileId,
    });
    if (error) {
      result.errors.push({ row: i + 2, reason: error.message });
      continue;
    }
    result.inserted++;
  }

  await logActivity({ user_id: profileId, action: "data_sync_import", entity_type: "purchase_outstanding", new_data: result });
  return result;
}

export async function importCutoverRows(
  kind: DataSyncImportKind,
  rows: unknown[],
  options?: unknown,
): Promise<DataSyncImportResult> {
  const profile = await requireRole(["owner"]);
  const parsedOptions = optionsSchema.safeParse(options ?? {});
  if (!parsedOptions.success) {
    return {
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [{ row: 1, reason: fieldError(parsedOptions.error) }],
    };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [{ row: 1, reason: "File tidak punya baris data" }],
    };
  }

  let result: DataSyncImportResult;
  switch (kind) {
    case "suppliers":
      result = await importSuppliers(rows, profile.id);
      break;
    case "customers":
      result = await importCustomers(rows, profile.id);
      break;
    case "products":
      result = await importProducts(rows, profile.id, parsedOptions.data.cutoff_date);
      break;
    case "bank_accounts":
      result = await importBankAccounts(rows, profile.id);
      break;
    case "opening_balance":
      result = await importOpeningBalance(rows, profile.id, parsedOptions.data.cutoff_date);
      break;
    case "sales_outstanding":
      result = await importSalesOutstanding(rows, profile.id);
      break;
    case "purchase_outstanding":
      result = await importPurchaseOutstanding(rows, profile.id);
      break;
    default:
      result = {
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: [{ row: 1, reason: "Jenis import tidak dikenal" }],
      };
  }

  revalidatePath("/settings/data-sync");
  revalidatePath("/inventory");
  revalidatePath("/suppliers");
  revalidatePath("/customers");
  revalidatePath("/kas-bank/akun");
  revalidatePath("/buku-besar/journal");
  revalidatePath("/penjualan/invoice");
  revalidatePath("/pembelian/faktur");
  return result;
}
