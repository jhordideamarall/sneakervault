"use server";

import { createClient } from "@sneakervault/supabase/server";
import { salesInvoiceInputSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { revalidatePath } from "next/cache";
import { journalForSalesInvoice } from "../journal-engine";
import { assertPeriodOpen } from "@/lib/fiscal-periods";
import { createStockMovement } from "./stock-movements";
import { deleteSalesInvoiceAtomic } from "./transaction-deletes";

const ROLES = ["owner", "finance", "admin_online"] as const;

type ComputeArgs = {
  lines: { qty: number; unit_price: number }[];
  discount: number;
  shipping: number;
  marketplace_fee: number;
  tax: number;
};

function computeTotals(args: ComputeArgs): { subtotal: number; total: number } {
  const subtotal = args.lines.reduce(
    (acc, l) => acc + l.qty * l.unit_price,
    0,
  );
  const total =
    subtotal - args.discount + args.shipping - args.marketplace_fee + args.tax;
  return { subtotal, total: Math.max(0, total) };
}

async function resolveInvoiceCustomer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: { customer_id?: string | null; customer_name: string; channel: string },
) {
  if (input.customer_id) return { customerId: input.customer_id };

  const customerName = input.customer_name.trim();
  const { data, error } = await supabase.rpc(
    "resolve_customer_for_invoice",
    {
      p_name: customerName,
      p_channel: input.channel,
    },
  );
  if (error || !data) {
    return {
      error:
        error?.message ??
        "Nama customer tidak dapat disimpan ke Master Data Pelanggan",
    };
  }
  return { customerId: data as string };
}

export async function loadSalesInvoiceDetailAction(id: string) {
  await requireRole([...ROLES]);
  const { getSalesInvoiceById } = await import("@/lib/queries");
  const detail = await getSalesInvoiceById(id);
  if (!detail) return { error: "Invoice tidak ditemukan" };
  return { data: detail };
}

export async function createSalesInvoice(
  input: unknown,
  options?: { issue?: boolean },
) {
  const profile = await requireRole([...ROLES]);
  const parsed = salesInvoiceInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  if (options?.issue) {
    const lock = await assertPeriodOpen(parsed.data.invoice_date);
    if (lock.error) return { error: { _form: [lock.error] } };
  }

  const supabase = await createClient();
  const customer = await resolveInvoiceCustomer(supabase, parsed.data);
  if (customer.error) return { error: { _form: [customer.error] } };

  // Resolve product snapshots (label + hpp)
  const productIds = parsed.data.lines.map((l) => l.product_id);
  const { data: products, error: prodErr } = await supabase
    .from("products")
    .select("id, brand, model, color, size, size_label, sku, hpp, quantity")
    .in("id", productIds);
  if (prodErr) return { error: { _form: [prodErr.message] } };
  if (!products || products.length !== productIds.length)
    return { error: { _form: ["Beberapa produk tidak ditemukan"] } };

  const issue = options?.issue ?? false;

  // If issuing, ensure stock available
  if (issue) {
    const qtyByProduct = new Map<string, number>();
    for (const l of parsed.data.lines) {
      qtyByProduct.set(
        l.product_id,
        (qtyByProduct.get(l.product_id) ?? 0) + l.qty,
      );
    }
    for (const p of products) {
      const need = qtyByProduct.get(p.id) ?? 0;
      if (need > Number(p.quantity)) {
        return {
          error: {
            _form: [
              `Stok ${p.brand} ${p.model} size ${p.size_label ?? p.size} tidak cukup (${p.quantity} < ${need})`,
            ],
          },
        };
      }
    }
  }

  const { subtotal, total } = computeTotals(parsed.data);

  const { data: invNum, error: numErr } = await supabase.rpc(
    "generate_sales_invoice_number",
  );
  if (numErr) return { error: { _form: [numErr.message] } };

  const { data: invoice, error: invErr } = await supabase
    .from("sales_invoices")
    .insert({
      invoice_number: invNum,
      customer_id: customer.customerId,
      customer_name: parsed.data.customer_name.trim(),
      channel: parsed.data.channel,
      invoice_date: parsed.data.invoice_date,
      due_date: parsed.data.due_date || null,
      subtotal,
      discount: parsed.data.discount,
      shipping: parsed.data.shipping,
      marketplace_fee: parsed.data.marketplace_fee,
      tax: parsed.data.tax,
      total,
      paid_amount: 0,
      status: issue ? "issued" : "draft",
      marketplace_order_id: parsed.data.marketplace_order_id || null,
      notes: parsed.data.notes || null,
      created_by: profile.id,
    })
    .select()
    .single();
  if (invErr) return { error: { _form: [invErr.message] } };

  // Insert lines with snapshot label & cost
  const lineRows = parsed.data.lines.map((l) => {
    const prod = products.find((p) => p.id === l.product_id)!;
    return {
      invoice_id: invoice.id,
      product_id: l.product_id,
      product_label: `${prod.brand} ${prod.model} ${prod.color} • Size ${Number(prod.size)} • ${prod.sku}`,
      qty: l.qty,
      unit_price: l.unit_price,
      unit_cost: Number(prod.hpp),
      subtotal: l.qty * l.unit_price,
      notes: l.notes || null,
    };
  });
  const { error: linesErr } = await supabase
    .from("sales_invoice_lines")
    .insert(lineRows);
  if (linesErr) {
    await supabase.from("sales_invoices").delete().eq("id", invoice.id);
    return { error: { _form: [linesErr.message] } };
  }

  // If issuing: decrement stock + record movements + auto-journal
  if (issue) {
    let cogsTotal = 0;
    for (const l of parsed.data.lines) {
      const prod = products.find((p) => p.id === l.product_id)!;
      cogsTotal += Number(prod.hpp) * l.qty;
    }
    const journal = await journalForSalesInvoice({
      invoice_id: invoice.id,
      invoice_number: invNum as string,
      invoice_date: parsed.data.invoice_date,
      channel: parsed.data.channel,
      total,
      subtotal,
      discount: parsed.data.discount,
      shipping: parsed.data.shipping,
      marketplace_fee: parsed.data.marketplace_fee,
      tax: parsed.data.tax,
      cogs_total: cogsTotal,
      user_id: profile.id,
    });
    if (journal.error) return { error: { _form: [journal.error] } };

    for (const l of parsed.data.lines) {
      const { data: decOk, error: decErr } = await supabase.rpc(
        "decrement_product_quantity",
        { p_id: l.product_id, qty: l.qty },
      );
      if (decErr) return { error: { _form: [decErr.message] } };
      if (!decOk) return { error: { _form: ["Stok tidak cukup saat menerbitkan invoice"] } };

      const movement = await createStockMovement(supabase, {
        product_id: l.product_id,
        type: "outbound",
        quantity: l.qty,
        unit_cost:
          Number(products.find((p) => p.id === l.product_id)?.hpp ?? 0),
        reference_type: "sales_invoice_line",
        reference_id: invoice.id,
      });
      if (movement.error) return { error: { _form: [movement.error] } };
    }
  }

  await logActivity({
    user_id: profile.id,
    action: issue ? "create_and_issue" : "create",
    entity_type: "sales_invoice",
    entity_id: invoice.id,
    new_data: {
      invoice_number: invNum,
      customer_name: parsed.data.customer_name,
      total,
      channel: parsed.data.channel,
    },
  });

  revalidatePath("/penjualan/invoice");
  revalidatePath("/customers");
  revalidatePath("/inventory");
  revalidatePath("/buku-besar/journal");
  return { data: invoice };
}

export async function issueSalesInvoice(id: string) {
  const profile = await requireRole([...ROLES]);
  const supabase = await createClient();

  const { data: inv } = await supabase
    .from("sales_invoices")
    .select(
      "status, invoice_number, invoice_date, channel, total, subtotal, discount, shipping, marketplace_fee, tax, sales_invoice_lines(product_id, qty, unit_cost)",
    )
    .eq("id", id)
    .single();
  if (!inv) return { error: "Invoice tidak ditemukan" };
  if (inv.status !== "draft")
    return { error: "Hanya invoice Draft yang bisa diterbitkan" };
  const lock = await assertPeriodOpen(inv.invoice_date);
  if (lock.error) return { error: lock.error };

  const lines = (inv.sales_invoice_lines ?? []) as Array<{
    product_id: string;
    qty: number;
    unit_cost: number;
  }>;

  // Verify stock
  const qtyByProduct = new Map<string, number>();
  for (const l of lines) {
    qtyByProduct.set(
      l.product_id,
      (qtyByProduct.get(l.product_id) ?? 0) + l.qty,
    );
  }
  const { data: products } = await supabase
    .from("products")
    .select("id, brand, model, size, size_label, quantity")
    .in("id", Array.from(qtyByProduct.keys()));
  for (const p of products ?? []) {
    const need = qtyByProduct.get(p.id) ?? 0;
    if (need > Number(p.quantity))
      return {
        error: `Stok ${p.brand} ${p.model} size ${p.size_label ?? p.size} tidak cukup (${p.quantity} < ${need})`,
      };
  }

  for (const l of lines) {
    const { data: decOk, error: decErr } = await supabase.rpc(
      "decrement_product_quantity",
      { p_id: l.product_id, qty: l.qty },
    );
    if (decErr) return { error: decErr.message };
    if (!decOk) return { error: "Stok tidak cukup saat menerbitkan invoice" };
    const movement = await createStockMovement(supabase, {
      product_id: l.product_id,
      type: "outbound",
      quantity: l.qty,
      unit_cost: Number(l.unit_cost),
      reference_type: "sales_invoice_line",
      reference_id: id,
    });
    if (movement.error) return { error: movement.error };
  }

  await supabase
    .from("sales_invoices")
    .update({ status: "issued" })
    .eq("id", id);

  // Auto-journal
  const cogsTotal = lines.reduce(
    (a, l) => a + Number(l.unit_cost) * l.qty,
    0,
  );
  const inv2 = inv as unknown as {
    invoice_number: string;
    invoice_date: string;
    channel: "wa" | "shopee" | "tiktok" | "tokopedia" | "offline" | "website" | "mixed";
    total: number;
    subtotal: number;
    discount: number;
    shipping: number;
    marketplace_fee: number;
    tax: number;
  };
  const journal = await journalForSalesInvoice({
    invoice_id: id,
    invoice_number: inv2.invoice_number,
    invoice_date: inv2.invoice_date,
    channel: inv2.channel,
    total: Number(inv2.total),
    subtotal: Number(inv2.subtotal),
    discount: Number(inv2.discount),
    shipping: Number(inv2.shipping),
    marketplace_fee: Number(inv2.marketplace_fee),
    tax: Number(inv2.tax),
    cogs_total: cogsTotal,
    user_id: profile.id,
  });
  if (journal.error) return { error: journal.error };

  await logActivity({
    user_id: profile.id,
    action: "issue",
    entity_type: "sales_invoice",
    entity_id: id,
  });

  revalidatePath("/penjualan/invoice");
  revalidatePath("/inventory");
  revalidatePath("/buku-besar/journal");
  return { success: true };
}

export async function deleteSalesInvoice(id: string) {
  return deleteSalesInvoiceAtomic(id);
}

export async function updateSalesInvoice(id: string, input: unknown) {
  const profile = await requireRole([...ROLES]);
  const parsed = salesInvoiceInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const lock = await assertPeriodOpen(parsed.data.invoice_date);
  if (lock.error) return { error: { _form: [lock.error] } };

  const supabase = await createClient();
  const customer = await resolveInvoiceCustomer(supabase, parsed.data);
  if (customer.error) return { error: { _form: [customer.error] } };

  const { data: existing } = await supabase
    .from("sales_invoices")
    .select("status")
    .eq("id", id)
    .single();
  if (!existing) return { error: { _form: ["Invoice tidak ditemukan"] } };
  if (existing.status !== "draft")
    return { error: { _form: ["Hanya Draft yang bisa diedit"] } };

  const productIds = parsed.data.lines.map((l) => l.product_id);
  const { data: products } = await supabase
    .from("products")
    .select("id, brand, model, color, size, sku, hpp")
    .in("id", productIds);
  if (!products) return { error: { _form: ["Gagal load produk"] } };

  const { subtotal, total } = computeTotals(parsed.data);

  await supabase
    .from("sales_invoices")
    .update({
      customer_id: customer.customerId,
      customer_name: parsed.data.customer_name.trim(),
      channel: parsed.data.channel,
      invoice_date: parsed.data.invoice_date,
      due_date: parsed.data.due_date || null,
      subtotal,
      discount: parsed.data.discount,
      shipping: parsed.data.shipping,
      marketplace_fee: parsed.data.marketplace_fee,
      tax: parsed.data.tax,
      total,
      marketplace_order_id: parsed.data.marketplace_order_id || null,
      notes: parsed.data.notes || null,
    })
    .eq("id", id);

  await supabase.from("sales_invoice_lines").delete().eq("invoice_id", id);
  const lineRows = parsed.data.lines.map((l) => {
    const prod = products.find((p) => p.id === l.product_id)!;
    return {
      invoice_id: id,
      product_id: l.product_id,
      product_label: `${prod.brand} ${prod.model} ${prod.color} • Size ${Number(prod.size)} • ${prod.sku}`,
      qty: l.qty,
      unit_price: l.unit_price,
      unit_cost: Number(prod.hpp),
      subtotal: l.qty * l.unit_price,
      notes: l.notes || null,
    };
  });
  const { error: linesErr } = await supabase
    .from("sales_invoice_lines")
    .insert(lineRows);
  if (linesErr) return { error: { _form: [linesErr.message] } };

  await logActivity({
    user_id: profile.id,
    action: "update",
    entity_type: "sales_invoice",
    entity_id: id,
  });
  revalidatePath("/penjualan/invoice");
  revalidatePath("/customers");
  return { success: true };
}
