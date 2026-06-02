"use server";

import { createClient } from "@sneakervault/supabase/server";
import { purchaseInvoiceInputSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { revalidatePath } from "next/cache";
import { journalForPurchaseInvoice, reverseJournalBySource } from "../journal-engine";
import { assertPeriodOpen } from "@/lib/fiscal-periods";

const ROLES = ["owner", "finance"] as const;

export async function createPurchaseInvoice(input: unknown) {
  const profile = await requireRole([...ROLES]);
  const parsed = purchaseInvoiceInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const lock = await assertPeriodOpen(parsed.data.invoice_date);
  if (lock.error) return { error: { _form: [lock.error] } };

  const supabase = await createClient();
  const { data: invNum, error: numErr } = await supabase.rpc(
    "generate_purchase_invoice_number",
  );
  if (numErr) return { error: { _form: [numErr.message] } };

  const { data, error } = await supabase
    .from("purchase_invoices")
    .insert({
      invoice_number: invNum,
      supplier_id: parsed.data.supplier_id,
      po_id: parsed.data.po_id || null,
      invoice_date: parsed.data.invoice_date,
      due_date: parsed.data.due_date || null,
      subtotal: parsed.data.subtotal,
      tax: parsed.data.tax,
      total: parsed.data.total,
      paid_amount: 0,
      status: "unpaid",
      notes: parsed.data.notes || null,
      attachment_url: parsed.data.attachment_url || null,
      created_by: profile.id,
    })
    .select()
    .single();
  if (error) return { error: { _form: [error.message] } };

  // Auto-journal: Dr Persediaan + (Dr Pajak Masukan) / Cr Hutang Usaha
  const journal = await journalForPurchaseInvoice({
    invoice_id: data.id,
    invoice_number: invNum as string,
    invoice_date: parsed.data.invoice_date,
    subtotal: parsed.data.subtotal,
    tax: parsed.data.tax,
    user_id: profile.id,
  });
  if (journal.error) return { error: { _form: [journal.error] } };

  await logActivity({
    user_id: profile.id,
    action: "create",
    entity_type: "purchase_invoice",
    entity_id: data.id,
    new_data: {
      invoice_number: invNum,
      supplier_id: parsed.data.supplier_id,
      po_id: parsed.data.po_id,
      total: parsed.data.total,
    },
  });
  revalidatePath("/pembelian/faktur");
  revalidatePath("/buku-besar/journal");
  return { data };
}

export async function updatePurchaseInvoice(id: string, input: unknown) {
  const profile = await requireRole([...ROLES]);
  const parsed = purchaseInvoiceInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const lock = await assertPeriodOpen(parsed.data.invoice_date);
  if (lock.error) return { error: { _form: [lock.error] } };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("purchase_invoices")
    .select("status, paid_amount")
    .eq("id", id)
    .single();
  if (!existing) return { error: { _form: ["Faktur tidak ditemukan"] } };
  if (existing.status === "paid" || existing.status === "cancelled")
    return { error: { _form: ["Faktur lunas/dibatalkan tidak bisa diedit"] } };
  if (parsed.data.total < Number(existing.paid_amount))
    return {
      error: {
        _form: ["Total faktur tidak boleh lebih kecil dari yang sudah dibayar"],
      },
    };

  const { error } = await supabase
    .from("purchase_invoices")
    .update({
      supplier_id: parsed.data.supplier_id,
      po_id: parsed.data.po_id || null,
      invoice_date: parsed.data.invoice_date,
      due_date: parsed.data.due_date || null,
      subtotal: parsed.data.subtotal,
      tax: parsed.data.tax,
      total: parsed.data.total,
      notes: parsed.data.notes || null,
      attachment_url: parsed.data.attachment_url || null,
    })
    .eq("id", id);
  if (error) return { error: { _form: [error.message] } };

  await logActivity({
    user_id: profile.id,
    action: "update",
    entity_type: "purchase_invoice",
    entity_id: id,
  });
  revalidatePath("/pembelian/faktur");
  return { success: true };
}

export async function cancelPurchaseInvoice(id: string, reason?: string) {
  const profile = await requireRole([...ROLES]);
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("purchase_invoices")
    .select("status, paid_amount, notes")
    .eq("id", id)
    .single();
  if (!existing) return { error: "Faktur tidak ditemukan" };
  if (existing.status === "paid")
    return { error: "Faktur lunas tidak bisa dibatalkan" };
  if (Number(existing.paid_amount) > 0)
    return {
      error:
        "Faktur sudah ada pembayaran. Reverse pembayaran dulu sebelum membatalkan.",
    };

  const merged = reason
    ? `${existing.notes ?? ""}\n[Dibatalkan]: ${reason}`.trim()
    : existing.notes;

  const { error } = await supabase
    .from("purchase_invoices")
    .update({ status: "cancelled", notes: merged })
    .eq("id", id);
  if (error) return { error: error.message };

  await reverseJournalBySource("purchase_invoice", id, reason);

  await logActivity({
    user_id: profile.id,
    action: "cancel",
    entity_type: "purchase_invoice",
    entity_id: id,
    new_data: { reason },
  });
  revalidatePath("/pembelian/faktur");
  revalidatePath("/buku-besar/journal");
  return { success: true };
}

export async function deletePurchaseInvoice(id: string) {
  const profile = await requireRole(["owner"]);
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("purchase_invoices")
    .select("status, paid_amount, invoice_number")
    .eq("id", id)
    .single();
  if (!existing) return { error: "Faktur tidak ditemukan" };
  if (Number(existing.paid_amount) > 0)
    return { error: "Faktur dengan pembayaran tidak bisa dihapus" };

  const { error } = await supabase
    .from("purchase_invoices")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };

  await logActivity({
    user_id: profile.id,
    action: "delete",
    entity_type: "purchase_invoice",
    entity_id: id,
    new_data: { invoice_number: existing.invoice_number },
  });
  revalidatePath("/pembelian/faktur");
  return { success: true };
}
