"use server";

import { createClient } from "@sneakervault/supabase/server";
import { purchaseOrderInputSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { revalidatePath } from "next/cache";
import { assertPeriodOpen } from "@/lib/fiscal-periods";
import { deletePurchaseOrderAtomic } from "./transaction-deletes";
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

  const { error: linesErr } = await supabase
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
  await requireRole([...ROLES]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "approve_purchase_order_atomic",
    { p_po_id: id },
  );
  if (error) return { error: error.message };

  for (const path of [
    "/pembelian/purchase-order",
    "/pembelian/faktur",
    "/pembelian/pembayaran",
    "/kas-bank/akun",
    "/kas-bank/mutasi",
    "/buku-besar/journal",
    "/laporan-keuangan",
  ]) {
    revalidatePath(path);
  }
  return { success: true, data };
}

export async function cancelPurchaseOrder(id: string, reason?: string) {
  const profile = await requireRole([...ROLES]);
  const cleanReason = reason?.trim();
  if (!cleanReason) return { error: "Alasan pembatalan supplier wajib diisi" };

  const supabase = await createClient();

  const { data: po } = await supabase
    .from("purchase_orders")
    .select("status, notes, purchase_order_lines(received_qty)")
    .eq("id", id)
    .single();
  if (!po) return { error: "PO tidak ditemukan" };
  if (po.status === "cancelled") return { error: "PO sudah dibatalkan" };
  const receivedQty = (
    (po.purchase_order_lines ?? []) as Array<{ received_qty: number | null }>
  ).reduce((sum, line) => sum + Number(line.received_qty ?? 0), 0);
  const { count: receiptCount, error: receiptError } = await supabase
    .from("purchase_receipts")
    .select("id", { count: "exact", head: true })
    .eq("po_id", id);
  if (receiptError) return { error: receiptError.message };

  if (receivedQty > 0 || Number(receiptCount ?? 0) > 0) {
    return {
      error:
        "Pembelian Barang sudah memiliki Penerimaan Barang. Gunakan alur Hapus berurutan untuk koreksi data.",
    };
  }

  const { count: invoiceCount, error: invoiceError } = await supabase
    .from("purchase_invoices")
    .select("id", { count: "exact", head: true })
    .eq("po_id", id)
    .neq("status", "cancelled");
  if (invoiceError) return { error: invoiceError.message };
  if (Number(invoiceCount ?? 0) > 0) {
    return {
      error:
        "Pembelian Barang sudah memiliki Faktur/Pembayaran saat disetujui. Hapus Pembayaran Vendor lalu Faktur Pembelian terlebih dahulu agar saldo bank dan jurnal dibalik dengan aman.",
    };
  }

  const newNotes =
    `${po.notes ?? ""}\n[Dibatalkan supplier]: ${cleanReason}`.trim();

  const { data: cancelledPo, error } = await supabase
    .from("purchase_orders")
    .update({ status: "cancelled", notes: newNotes })
    .eq("id", id)
    .in("status", ["draft", "approved"])
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!cancelledPo) {
    return {
      error:
        "Status Pembelian Barang sudah berubah. Muat ulang halaman dan periksa Penerimaan Barang sebelum membatalkan.",
    };
  }

  await logActivity({
    user_id: profile.id,
    action: "cancel",
    entity_type: "purchase_order",
    entity_id: id,
    new_data: { reason: cleanReason },
  });
  revalidatePath("/pembelian/purchase-order");
  return { success: true };
}

export async function deletePurchaseOrder(id: string) {
  return deletePurchaseOrderAtomic(id);
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
  const { error: linesErr } = await supabase
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
  const { data: preOrder, error: preOrderErr } = await supabase
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
    return { error: { _form: ["Pre Order ini tidak bisa dibuatkan Pembelian Barang"] } };
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
          "Tidak ada item yang perlu dibelikan. Semua item sudah ready atau sudah punya link Pembelian Barang.",
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
    return { error: { _form: [poErr?.message ?? "Gagal membuat Pembelian Barang"] } };
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
    const { data: poLine, error: lineErr } = await supabase
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
          _form: [lineErr?.message ?? "Gagal membuat item Pembelian Barang"],
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

  const { error: linkErr } = await supabase
    .from("pre_order_procurement_links")
    .insert(createdLinks);
  if (linkErr) {
    await supabase.from("purchase_orders").delete().eq("id", po.id);
    return { error: { _form: [linkErr.message] } };
  }

  await supabase
    .from("pre_order_lines")
    .update({ status: "purchase_created" })
    .in("id", lines.map((line) => line.id));
  await supabase
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
