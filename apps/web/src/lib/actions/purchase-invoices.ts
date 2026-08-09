"use server";

import { createClient } from "@sneakervault/supabase/server";
import { purchaseInvoiceInputSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { revalidatePath } from "next/cache";
import { journalForPurchaseInvoice } from "../journal-engine";
import { assertPeriodOpen } from "@/lib/fiscal-periods";
import { createStockMovement } from "./stock-movements";
import { deletePurchaseInvoiceAtomic } from "./transaction-deletes";

const ROLES = ["owner", "finance"] as const;

type ParsedInvoiceLine = NonNullable<
  ReturnType<typeof purchaseInvoiceInputSchema.parse>["lines"]
>[number];

async function productIdForManualInvoiceLine(
  supabase: Awaited<ReturnType<typeof createClient>>,
  line: ParsedInvoiceLine,
) {
  if (line.product_id) return line.product_id;

  const sku = (line.new_sku ?? "").trim();
  const sizeLabel = String(line.new_size_label ?? line.new_size ?? "").trim();
  if (!sku || !line.new_brand || !line.new_model || !sizeLabel) {
    throw new Error("Item manual tidak lengkap (brand/model/size/SKU)");
  }

  const { data: existing } = await supabase
    .from("products")
    .select("id")
    .eq("sku", sku)
    .eq("size_label", sizeLabel)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const productPayload = {
    brand: line.new_brand,
    model: line.new_model,
    size_label: sizeLabel,
    color: line.new_color ?? null,
    sku,
    barcode: sku,
    hpp: 0,
    sell_price: Number(line.unit_cost),
    price_offline: Number(line.unit_cost),
    quantity: 0,
    is_active: true,
    first_inbound_at: new Date().toISOString(),
  } as Record<string, unknown>;
  if (line.new_size != null) productPayload.size = line.new_size;

  const { data: created, error } = await supabase
    .from("products")
    .insert(productPayload)
    .select("id")
    .single();
  if (error || !created) {
    throw new Error(error?.message ?? `Produk ${sku} gagal dibuat`);
  }
  return created.id as string;
}

async function receiveManualInvoiceLines(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceId: string,
  invoiceNumber: string,
  lines: ParsedInvoiceLine[],
) {
  for (const line of lines) {
    const productId = await productIdForManualInvoiceLine(supabase, line);
    const productLabel =
      line.product_label ||
      [
        line.new_brand,
        line.new_model,
        line.new_color,
        line.new_size_label ?? line.new_size,
        line.new_sku,
      ]
        .filter(Boolean)
        .join(" ");
    const { data: invoiceLine, error: lineError } = await supabase
      .from("purchase_invoice_lines")
      .insert({
        invoice_id: invoiceId,
        product_id: productId,
        product_label: productLabel,
        qty: line.qty,
        unit_cost: line.unit_cost,
        subtotal: line.qty * line.unit_cost,
        notes: line.notes || null,
      })
      .select("id")
      .single();
    if (lineError || !invoiceLine) {
      throw new Error(lineError?.message ?? "Line faktur gagal dibuat");
    }

    const { error: incrementError } = await supabase.rpc(
      "increment_product_quantity",
      {
        p_id: productId,
        qty: line.qty,
      },
    );
    if (incrementError) throw new Error(incrementError.message);

    const { error: hppError } = await supabase.rpc("recalculate_hpp_by_sku", {
      p_product_id: productId,
      p_new_qty: line.qty,
      p_new_unit_cost: line.unit_cost,
    });
    if (hppError) throw new Error(hppError.message);

    const movement = await createStockMovement(supabase, {
      product_id: productId,
      type: "inbound",
      quantity: line.qty,
      unit_cost: line.unit_cost,
      reference_type: "purchase_invoice_line",
      reference_id: invoiceLine.id,
      notes: `Faktur manual ${invoiceNumber}`,
    });
    if (movement.error) throw new Error(movement.error);
  }
}

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
  const manualLines = parsed.data.po_id ? [] : (parsed.data.lines ?? []);
  const subtotal = parsed.data.po_id
    ? parsed.data.subtotal
    : manualLines.reduce((sum, line) => sum + line.qty * line.unit_cost, 0);
  const total = subtotal + parsed.data.tax;

  const { data, error } = await supabase
    .from("purchase_invoices")
    .insert({
      invoice_number: invNum,
      supplier_id: parsed.data.supplier_id,
      po_id: parsed.data.po_id || null,
      invoice_date: parsed.data.invoice_date,
      due_date: parsed.data.due_date || null,
      subtotal,
      tax: parsed.data.tax,
      total,
      paid_amount: 0,
      status: "unpaid",
      notes: parsed.data.notes || null,
      attachment_url: parsed.data.attachment_url || null,
      created_by: profile.id,
    })
    .select()
    .single();
  if (error) return { error: { _form: [error.message] } };

  if (manualLines.length > 0) {
    try {
      await receiveManualInvoiceLines(
        supabase,
        data.id,
        invNum as string,
        manualLines,
      );
    } catch (lineError) {
      await supabase.from("purchase_invoices").delete().eq("id", data.id);
      return {
        error: {
          _form: [
            lineError instanceof Error
              ? lineError.message
              : "Line faktur manual gagal diproses",
          ],
        },
      };
    }
  }

  // Auto-journal: Dr Persediaan + (Dr Pajak Masukan) / Cr Hutang Usaha
  const journal = await journalForPurchaseInvoice({
    invoice_id: data.id,
    invoice_number: invNum as string,
    invoice_date: parsed.data.invoice_date,
    subtotal,
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
      total,
      line_count: manualLines.length,
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

export async function deletePurchaseInvoice(id: string) {
  return deletePurchaseInvoiceAtomic(id);
}
