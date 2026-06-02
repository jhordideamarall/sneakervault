"use server";

import { createClient } from "@sneakervault/supabase/server";
import { purchaseOrderInputSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { revalidatePath } from "next/cache";
import { assertPeriodOpen } from "@/lib/fiscal-periods";

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
    product_id: l.product_id,
    ordered_qty: l.ordered_qty,
    unit_cost: l.unit_cost,
    subtotal: l.ordered_qty * l.unit_cost,
    notes: l.notes || null,
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
    .select("status, po_number")
    .eq("id", id)
    .single();
  if (!po) return { error: "PO tidak ditemukan" };
  if (po.status !== "draft" && po.status !== "cancelled")
    return { error: "Hanya PO Draft atau Cancelled yang bisa dihapus" };

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
    product_id: l.product_id,
    ordered_qty: l.ordered_qty,
    unit_cost: l.unit_cost,
    subtotal: l.ordered_qty * l.unit_cost,
    notes: l.notes || null,
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
