"use server";

import { createClient } from "@sneakervault/supabase/server";
import { purchaseOrderInputSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { revalidatePath } from "next/cache";
import { assertPeriodOpen } from "@/lib/fiscal-periods";
import { deletePurchaseInvoice } from "./purchase-invoices";
import { reverseVendorPayment } from "./vendor-payments";
import { z } from "zod";

const ROLES = ["owner", "finance"] as const;

function computeTotals(
  lines: { ordered_qty: number; unit_cost: number }[],
  tax: number,
  shipping: number,
) {
  const subtotal = lines.reduce(
    (acc, l) => acc + l.ordered_qty * l.unit_cost,
    0,
  );
  const total = subtotal + tax + shipping;
  return { subtotal, total };
}

export async function createPurchaseOrder(input: unknown) {
  const profile = await requireRole([...ROLES]);
  const parsed = purchaseOrderInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const lock = await assertPeriodOpen(parsed.data.order_date);
  if (lock.error) return { error: { _form: [lock.error] } };

  const supabase = await createClient();

  const { data: poNumber, error: numErr } = await supabase.rpc(
    "generate_po_number",
  );
  if (numErr) return { error: { _form: [numErr.message] } };

  const { subtotal, total } = computeTotals(
    parsed.data.lines,
    parsed.data.tax,
    parsed.data.shipping,
  );

  // Clamp DP to total (jangan biarkan DP > total)
  const finalDpAmount =
    parsed.data.payment_type === "cash"
      ? total
      : parsed.data.payment_type === "dp"
        ? Math.min(parsed.data.dp_amount, total)
        : 0;

  const { data: po, error: poErr } = await supabase
    .from("purchase_orders")
    .insert({
      po_number: poNumber,
      supplier_id: parsed.data.supplier_id,
      order_date: parsed.data.order_date,
      expected_date: parsed.data.expected_date || null,
      tax: parsed.data.tax,
      shipping: parsed.data.shipping,
      subtotal,
      total,
      notes: parsed.data.notes || null,
      created_by: profile.id,
      status: "draft",
      payment_type: parsed.data.payment_type,
      dp_amount: finalDpAmount,
      dp_bank_account_id:
        parsed.data.payment_type === "credit"
          ? null
          : parsed.data.dp_bank_account_id ?? null,
    })
    .select()
    .single();

  if (poErr) return { error: { _form: [poErr.message] } };

  const lineRows = parsed.data.lines.map((l) => ({
    po_id: po.id,
    product_id: l.product_id ?? null,
    ordered_qty: l.ordered_qty,
    unit_cost: l.unit_cost,
    subtotal: l.ordered_qty * l.unit_cost,
    notes: l.notes || null,
    new_brand: l.product_id ? null : l.new_brand ?? null,
    new_model: l.product_id ? null : l.new_model ?? null,
    new_size: l.product_id ? null : l.new_size ?? null,
    new_size_label:
      l.product_id ? null : l.new_size_label ?? (l.new_size != null ? String(l.new_size) : null),
    new_color: l.product_id ? null : l.new_color ?? null,
    new_sku: l.product_id ? null : l.new_sku ?? null,
  }));

  const { error: linesErr } = await (supabase as any)
    .from("purchase_order_lines")
    .insert(lineRows);

  if (linesErr) {
    await supabase.from("purchase_orders").delete().eq("id", po.id);
    return { error: { _form: [linesErr.message] } };
  }

  await logActivity({
    user_id: profile.id,
    action: "create",
    entity_type: "purchase_order",
    entity_id: po.id,
    new_data: { po_number: poNumber, supplier_id: parsed.data.supplier_id, total },
  });

  revalidatePath("/pembelian/purchase-order");
  return { data: po };
}

export async function approvePurchaseOrder(id: string) {
  const profile = await requireRole([...ROLES]);
  const supabase = await createClient();

  const { data: po, error: getErr } = await supabase
    .from("purchase_orders")
    .select("status")
    .eq("id", id)
    .single();
  if (getErr || !po) return { error: "PO tidak ditemukan" };
  if (po.status !== "draft")
    return { error: "Hanya PO status Draft yang bisa disetujui" };

  const { error } = await supabase
    .from("purchase_orders")
    .update({
      status: "approved",
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  await logActivity({
    user_id: profile.id,
    action: "approve",
    entity_type: "purchase_order",
    entity_id: id,
  });
  revalidatePath("/pembelian/purchase-order");
  return { success: true };
}

export async function cancelPurchaseOrder(id: string, reason?: string) {
  const profile = await requireRole([...ROLES]);
  const supabase = await createClient();

  const { data: po } = await supabase
    .from("purchase_orders")
    .select("status, notes")
    .eq("id", id)
    .single();
  if (!po) return { error: "PO tidak ditemukan" };
  if (po.status === "completed" || po.status === "cancelled")
    return { error: "PO ini tidak bisa dibatalkan" };

  const newNotes = reason
    ? `${po.notes ?? ""}\n[Dibatalkan]: ${reason}`.trim()
    : po.notes;

  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: "cancelled", notes: newNotes })
    .eq("id", id);
  if (error) return { error: error.message };

  await logActivity({
    user_id: profile.id,
    action: "cancel",
    entity_type: "purchase_order",
    entity_id: id,
    new_data: { reason },
  });
  revalidatePath("/pembelian/purchase-order");
  return { success: true };
}

export async function deletePurchaseOrder(id: string) {
  const profile = await requireRole(["owner"]);
  const supabase = await createClient();

  const { data: po } = await supabase
    .from("purchase_orders")
    .select("status, po_number, purchase_order_lines(received_qty)")
    .eq("id", id)
    .single();
  if (!po) return { error: "PO tidak ditemukan" };
  if (po.status === "completed") {
    return {
      error:
        "PO sudah selesai dan memiliki transaksi turunan. Reverse faktur/pembayaran dulu sebelum menghapus PO.",
    };
  }

  const receivedQty = (
    (po as unknown as { purchase_order_lines?: Array<{ received_qty: number | null }> })
      .purchase_order_lines ?? []
  ).reduce((sum, line) => sum + Number(line.received_qty ?? 0), 0);
  if (receivedQty > 0) {
    return {
      error:
        "PO sudah memiliki penerimaan barang. Batalkan/reverse faktur dan penerimaan terkait sebelum menghapus PO.",
    };
  }

  const { data: invoices } = await supabase
    .from("purchase_invoices")
    .select("id, invoice_number, paid_amount, status")
    .eq("po_id", id);
  const invoiceRows = ((invoices ?? []) as Array<{
    id: string;
    invoice_number: string;
    paid_amount: number | null;
    status: string;
  }>);
  if (invoiceRows.length > 0) {
    const invoiceIds = invoiceRows.map((invoice) => invoice.id);
    const invoiceIdSet = new Set(invoiceIds);

    const { data: paymentAllocations, error: allocationError } = await supabase
      .from("vendor_payment_allocations")
      .select("payment_id, invoice_id")
      .in("invoice_id", invoiceIds);
    if (allocationError) return { error: allocationError.message };

    const paymentIds = Array.from(
      new Set(((paymentAllocations ?? []) as Array<{ payment_id: string }>).map((a) => a.payment_id)),
    );
    if (paymentIds.length > 0) {
      const { data: allPaymentAllocations, error: allAllocationError } = await supabase
        .from("vendor_payment_allocations")
        .select("payment_id, invoice_id")
        .in("payment_id", paymentIds);
      if (allAllocationError) return { error: allAllocationError.message };

      const hasMixedPayment = ((allPaymentAllocations ?? []) as Array<{
        invoice_id: string;
      }>).some((allocation) => !invoiceIdSet.has(allocation.invoice_id));
      if (hasMixedPayment) {
        return {
          error:
            "PO memiliki pembayaran gabungan dengan faktur lain. Reverse pembayaran vendor manual dulu agar faktur lain tidak ikut terdampak.",
        };
      }

      for (const paymentId of paymentIds) {
        const reversed = await reverseVendorPayment(
          paymentId,
          `Auto reverse saat hapus PO ${po.po_number}`,
        );
        if (reversed.error) {
          return {
            error: `Gagal auto-reverse pembayaran vendor untuk PO ${po.po_number}: ${reversed.error}`,
          };
        }
      }
    }

    for (const invoice of invoiceRows) {
      const deletedInvoice = await deletePurchaseInvoice(invoice.id);
      if (deletedInvoice.error) {
        return {
          error: `Gagal menghapus faktur ${invoice.invoice_number}: ${deletedInvoice.error}`,
        };
      }
    }
  }

  await (supabase as any)
    .from("pre_order_procurement_links")
    .delete()
    .eq("purchase_order_id", id);
  await supabase.from("purchase_order_lines").delete().eq("po_id", id);
  const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
  if (error) return { error: error.message };

  await logActivity({
    user_id: profile.id,
    action: "delete",
    entity_type: "purchase_order",
    entity_id: id,
    new_data: { po_number: po.po_number },
  });
  revalidatePath("/pembelian/purchase-order");
  revalidatePath("/pre-order");
  return { success: true };
}

export async function updatePurchaseOrder(id: string, input: unknown) {
  const profile = await requireRole([...ROLES]);
  const parsed = purchaseOrderInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const lock = await assertPeriodOpen(parsed.data.order_date);
  if (lock.error) return { error: { _form: [lock.error] } };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("purchase_orders")
    .select("status")
    .eq("id", id)
    .single();
  if (!existing) return { error: { _form: ["PO tidak ditemukan"] } };
  if (existing.status !== "draft")
    return { error: { _form: ["Hanya PO Draft yang bisa diedit"] } };

  const { subtotal, total } = computeTotals(
    parsed.data.lines,
    parsed.data.tax,
    parsed.data.shipping,
  );

  const finalDpAmount =
    parsed.data.payment_type === "cash"
      ? total
      : parsed.data.payment_type === "dp"
        ? Math.min(parsed.data.dp_amount, total)
        : 0;

  const { error: updErr } = await supabase
    .from("purchase_orders")
    .update({
      supplier_id: parsed.data.supplier_id,
      order_date: parsed.data.order_date,
      expected_date: parsed.data.expected_date || null,
      tax: parsed.data.tax,
      shipping: parsed.data.shipping,
      subtotal,
      total,
      notes: parsed.data.notes || null,
      payment_type: parsed.data.payment_type,
      dp_amount: finalDpAmount,
      dp_bank_account_id:
        parsed.data.payment_type === "credit"
          ? null
          : parsed.data.dp_bank_account_id ?? null,
    })
    .eq("id", id);
  if (updErr) return { error: { _form: [updErr.message] } };

  // Replace lines: simpler than diff
  await supabase.from("purchase_order_lines").delete().eq("po_id", id);
  const lineRows = parsed.data.lines.map((l) => ({
    po_id: id,
    product_id: l.product_id ?? null,
    ordered_qty: l.ordered_qty,
    unit_cost: l.unit_cost,
    subtotal: l.ordered_qty * l.unit_cost,
    notes: l.notes || null,
    new_brand: l.product_id ? null : l.new_brand ?? null,
    new_model: l.product_id ? null : l.new_model ?? null,
    new_size: l.product_id ? null : l.new_size ?? null,
    new_size_label:
      l.product_id ? null : l.new_size_label ?? (l.new_size != null ? String(l.new_size) : null),
    new_color: l.product_id ? null : l.new_color ?? null,
    new_sku: l.product_id ? null : l.new_sku ?? null,
  }));
  const { error: linesErr } = await (supabase as any)
    .from("purchase_order_lines")
    .insert(lineRows);
  if (linesErr) return { error: { _form: [linesErr.message] } };

  await logActivity({
    user_id: profile.id,
    action: "update",
    entity_type: "purchase_order",
    entity_id: id,
  });
  revalidatePath("/pembelian/purchase-order");
  revalidatePath(`/pembelian/purchase-order/${id}`);
  return { success: true };
}

export async function loadPoDetailAction(id: string) {
  await requireRole(["owner", "finance", "admin_gudang"]);
  const { getPurchaseOrderById } = await import("@/lib/queries");
  const detail = await getPurchaseOrderById(id);
  if (!detail) return { error: "PO tidak ditemukan" };
  return { data: detail };
}

const createPoFromPreOrderSchema = z.object({
  pre_order_id: z.string().uuid(),
  supplier_id: z.string().uuid("Vendor wajib dipilih"),
  order_date: z.string().optional(),
  expected_date: z.string().optional().nullable(),
  notes: z.string().optional(),
});

type PreOrderLineForPo = {
  id: string;
  product_id: string | null;
  sku: string;
  product_name: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  size_label: string;
  size_value: number | null;
  requested_qty: number;
  reserved_qty: number;
  purchase_qty: number;
  estimated_cost: number;
  status: string;
  pre_order_procurement_links: Array<{ quantity: number | null }> | null;
};

function splitManualProductName(productName: string) {
  const parts = productName.trim().split(/\s+/);
  return {
    brand: parts[0] || "Marketplace",
    model: parts.slice(1).join(" ") || productName || "Pre Order Item",
  };
}

export async function createPurchaseOrderFromPreOrder(input: unknown) {
  const profile = await requireRole([...ROLES]);
  const parsed = createPoFromPreOrderSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const orderDate = parsed.data.order_date || new Date().toISOString().slice(0, 10);
  const lock = await assertPeriodOpen(orderDate);
  if (lock.error) return { error: { _form: [lock.error] } };

  const supabase = await createClient();
  const { data: preOrder, error: preOrderErr } = await (supabase as any)
    .from("pre_orders")
    .select(`
      id, customer_name, marketplace_order_id, channel, status, notes,
      pre_order_lines(
        id, product_id, sku, product_name, brand, model, color, size_label, size_value,
        requested_qty, reserved_qty, purchase_qty, estimated_cost, status,
        pre_order_procurement_links(quantity)
      )
    `)
    .eq("id", parsed.data.pre_order_id)
    .single();

  if (preOrderErr || !preOrder) {
    return { error: { _form: ["Pre Order tidak ditemukan"] } };
  }
  if (["cancelled", "packed"].includes(String(preOrder.status))) {
    return { error: { _form: ["Pre Order ini tidak bisa dibuatkan PO Pembelian"] } };
  }

  const lines = ((preOrder.pre_order_lines ?? []) as PreOrderLineForPo[])
    .map((line) => {
      const linkedQty = (line.pre_order_procurement_links ?? []).reduce(
        (sum, link) => sum + Number(link.quantity ?? 0),
        0,
      );
      const basePurchaseQty =
        Number(line.purchase_qty ?? 0) > 0
          ? Number(line.purchase_qty)
          : Math.max(0, Number(line.requested_qty) - Number(line.reserved_qty ?? 0));
      const qtyToBuy = Math.max(0, basePurchaseQty - linkedQty);
      return { ...line, qtyToBuy };
    })
    .filter((line) => line.qtyToBuy > 0);

  if (lines.length === 0) {
    return {
      error: {
        _form: [
          "Tidak ada item yang perlu dibelikan. Semua item sudah ready atau sudah punya link PO Pembelian.",
        ],
      },
    };
  }

  const subtotal = lines.reduce(
    (sum, line) => sum + line.qtyToBuy * Number(line.estimated_cost ?? 0),
    0,
  );
  const { data: poNumber, error: numErr } = await supabase.rpc("generate_po_number");
  if (numErr || !poNumber) {
    return { error: { _form: [numErr?.message ?? "Gagal membuat nomor PO"] } };
  }

  const { data: po, error: poErr } = await supabase
    .from("purchase_orders")
    .insert({
      po_number: poNumber,
      supplier_id: parsed.data.supplier_id,
      order_date: orderDate,
      expected_date: parsed.data.expected_date || null,
      subtotal,
      tax: 0,
      shipping: 0,
      total: subtotal,
      notes:
        parsed.data.notes ||
        [
          `Dibuat dari Pre Order ${preOrder.marketplace_order_id ?? preOrder.id}`,
          `Customer: ${preOrder.customer_name}`,
        ].join(" • "),
      created_by: profile.id,
      status: "draft",
      payment_type: "credit",
      dp_amount: 0,
      dp_bank_account_id: null,
    })
    .select("id, po_number")
    .single();

  if (poErr || !po) {
    return { error: { _form: [poErr?.message ?? "Gagal membuat PO Pembelian"] } };
  }

  const createdLinks: Array<{
    pre_order_line_id: string;
    purchase_order_id: string;
    purchase_order_line_id: string;
    quantity: number;
    created_by: string;
  }> = [];

  for (const line of lines) {
    const manualName = splitManualProductName(line.product_name);
    const { data: poLine, error: lineErr } = await (supabase as any)
      .from("purchase_order_lines")
      .insert({
        po_id: po.id,
        product_id: line.product_id,
        ordered_qty: line.qtyToBuy,
        unit_cost: Number(line.estimated_cost ?? 0),
        subtotal: line.qtyToBuy * Number(line.estimated_cost ?? 0),
        notes: `Dari Pre Order ${preOrder.marketplace_order_id ?? preOrder.id}`,
        new_brand: line.product_id ? null : line.brand ?? manualName.brand,
        new_model: line.product_id ? null : line.model ?? manualName.model,
        new_size: line.product_id ? null : line.size_value ?? null,
        new_size_label: line.product_id ? null : line.size_label,
        new_color: line.product_id ? null : line.color ?? null,
        new_sku: line.product_id ? null : line.sku,
      })
      .select("id")
      .single();

    if (lineErr || !poLine) {
      await supabase.from("purchase_orders").delete().eq("id", po.id);
      return {
        error: {
          _form: [lineErr?.message ?? "Gagal membuat line PO Pembelian"],
        },
      };
    }

    createdLinks.push({
      pre_order_line_id: line.id,
      purchase_order_id: po.id,
      purchase_order_line_id: poLine.id,
      quantity: line.qtyToBuy,
      created_by: profile.id,
    });
  }

  const { error: linkErr } = await (supabase as any)
    .from("pre_order_procurement_links")
    .insert(createdLinks);
  if (linkErr) {
    await supabase.from("purchase_orders").delete().eq("id", po.id);
    return { error: { _form: [linkErr.message] } };
  }

  await (supabase as any)
    .from("pre_order_lines")
    .update({ status: "purchase_created" })
    .in("id", lines.map((line) => line.id));
  await (supabase as any)
    .from("pre_orders")
    .update({ status: "purchase_created" })
    .eq("id", preOrder.id);

  await logActivity({
    user_id: profile.id,
    action: "create",
    entity_type: "purchase_order",
    entity_id: po.id,
    new_data: {
      source: "pre_order",
      pre_order_id: preOrder.id,
      po_number: po.po_number,
      line_count: lines.length,
      total: subtotal,
    },
  });

  revalidatePath("/pre-order");
  revalidatePath("/pembelian/purchase-order");
  return { data: { id: po.id, po_number: po.po_number } };
}
