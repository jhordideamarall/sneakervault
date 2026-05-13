"use server";

import { createClient } from "@sneakervault/supabase/server";
import { salesInvoiceInputSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { revalidatePath } from "next/cache";
import { journalForSalesInvoice, reverseJournalBySource } from "../journal-engine";

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

export async function createSalesInvoice(
  input: unknown,
  options?: { issue?: boolean },
) {
  const profile = await requireRole([...ROLES]);
  const parsed = salesInvoiceInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();

  // Resolve product snapshots (label + hpp)
  const productIds = parsed.data.lines.map((l) => l.product_id);
  const { data: products, error: prodErr } = await supabase
    .from("products")
    .select("id, brand, model, color, size, sku, hpp, quantity")
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
              `Stok ${p.brand} ${p.model} size ${p.size} tidak cukup (${p.quantity} < ${need})`,
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
      customer_id: parsed.data.customer_id || null,
      customer_name: parsed.data.customer_name,
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
    await journalForSalesInvoice({
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

    for (const l of parsed.data.lines) {
      const { error: decErr } = await supabase.rpc(
        "decrement_product_quantity",
        { p_id: l.product_id, qty: l.qty },
      );
      if (decErr) return { error: { _form: [decErr.message] } };

      await supabase.from("stock_movements").insert({
        product_id: l.product_id,
        type: "outbound",
        quantity: l.qty,
        unit_cost:
          Number(products.find((p) => p.id === l.product_id)?.hpp ?? 0),
        reference_type: "sales_invoice_line",
        reference_id: invoice.id,
        performed_by: profile.id,
      });
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
    .select("id, brand, model, size, quantity")
    .in("id", Array.from(qtyByProduct.keys()));
  for (const p of products ?? []) {
    const need = qtyByProduct.get(p.id) ?? 0;
    if (need > Number(p.quantity))
      return {
        error: `Stok ${p.brand} ${p.model} size ${p.size} tidak cukup (${p.quantity} < ${need})`,
      };
  }

  for (const l of lines) {
    const { error: decErr } = await supabase.rpc(
      "decrement_product_quantity",
      { p_id: l.product_id, qty: l.qty },
    );
    if (decErr) return { error: decErr.message };
    await supabase.from("stock_movements").insert({
      product_id: l.product_id,
      type: "outbound",
      quantity: l.qty,
      unit_cost: Number(l.unit_cost),
      reference_type: "sales_invoice_line",
      reference_id: id,
      performed_by: profile.id,
    });
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
    channel: "wa" | "shopee" | "tiktok" | "offline" | "website" | "mixed";
    total: number;
    subtotal: number;
    discount: number;
    shipping: number;
    marketplace_fee: number;
    tax: number;
  };
  await journalForSalesInvoice({
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

export async function cancelSalesInvoice(id: string, reason?: string) {
  const profile = await requireRole([...ROLES]);
  const supabase = await createClient();

  const { data: inv } = await supabase
    .from("sales_invoices")
    .select(
      "status, paid_amount, notes, sales_invoice_lines(product_id, qty, unit_cost)",
    )
    .eq("id", id)
    .single();
  if (!inv) return { error: "Invoice tidak ditemukan" };
  if (inv.status === "cancelled" || inv.status === "paid")
    return { error: "Invoice tidak bisa dibatalkan" };
  if (Number(inv.paid_amount) > 0)
    return {
      error: "Invoice sudah ada pembayaran. Reverse pembayaran dulu.",
    };

  // If was issued/partial, restore stock
  if (inv.status === "issued" || inv.status === "partial") {
    const lines = (inv.sales_invoice_lines ?? []) as Array<{
      product_id: string;
      qty: number;
      unit_cost: number;
    }>;
    for (const l of lines) {
      await supabase.rpc("increment_product_quantity", {
        p_id: l.product_id,
        qty: l.qty,
      });
      await supabase.from("stock_movements").insert({
        product_id: l.product_id,
        type: "inbound",
        quantity: l.qty,
        unit_cost: Number(l.unit_cost),
        reference_type: "sales_invoice_cancel",
        reference_id: id,
        performed_by: profile.id,
      });
    }
  }

  const merged = reason
    ? `${inv.notes ?? ""}\n[Dibatalkan]: ${reason}`.trim()
    : inv.notes;

  await supabase
    .from("sales_invoices")
    .update({ status: "cancelled", notes: merged })
    .eq("id", id);

  await reverseJournalBySource("sales_invoice", id, reason);

  await logActivity({
    user_id: profile.id,
    action: "cancel",
    entity_type: "sales_invoice",
    entity_id: id,
    new_data: { reason },
  });

  revalidatePath("/penjualan/invoice");
  revalidatePath("/inventory");
  revalidatePath("/buku-besar/journal");
  return { success: true };
}

export async function deleteSalesInvoice(id: string) {
  const profile = await requireRole(["owner"]);
  const supabase = await createClient();
  const { data: inv } = await supabase
    .from("sales_invoices")
    .select("status, paid_amount, invoice_number")
    .eq("id", id)
    .single();
  if (!inv) return { error: "Invoice tidak ditemukan" };
  if (inv.status !== "draft" && inv.status !== "cancelled")
    return { error: "Hanya Draft/Cancelled yang bisa dihapus" };
  if (Number(inv.paid_amount) > 0)
    return { error: "Invoice dengan pembayaran tidak bisa dihapus" };

  const { error } = await supabase.from("sales_invoices").delete().eq("id", id);
  if (error) return { error: error.message };

  await logActivity({
    user_id: profile.id,
    action: "delete",
    entity_type: "sales_invoice",
    entity_id: id,
    new_data: { invoice_number: inv.invoice_number },
  });
  revalidatePath("/penjualan/invoice");
  return { success: true };
}

export async function updateSalesInvoice(id: string, input: unknown) {
  const profile = await requireRole([...ROLES]);
  const parsed = salesInvoiceInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
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
      customer_id: parsed.data.customer_id || null,
      customer_name: parsed.data.customer_name,
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
  return { success: true };
}
