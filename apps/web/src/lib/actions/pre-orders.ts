"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@sneakervault/supabase/server";
import { preOrderInputSchema } from "@sneakervault/shared";
import type { PreOrderInput, PreOrderStatus } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { assertPeriodOpen } from "@/lib/fiscal-periods";

const MANAGE_ROLES = ["owner", "finance", "admin_online"] as const;

type ProductSnapshot = {
  id: string;
  brand: string;
  model: string;
  sku: string;
  size: number | null;
  size_label: string | null;
  color: string;
  quantity: number;
  hpp: number;
  sell_price: number;
  price_offline: number | null;
};

type PreparedLine = PreOrderInput["lines"][number] & {
  productSnapshot: ProductSnapshot | null;
  reservedQty: number;
  purchaseQty: number;
  status: PreOrderStatus;
};

function normalizeOptional(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function summarizeStatus(lines: PreparedLine[]): PreOrderStatus {
  if (lines.some((line) => line.status === "review")) return "review";
  if (lines.some((line) => line.status === "needs_purchase")) {
    return "needs_purchase";
  }
  return "ready_from_stock";
}

async function prepareLines(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lines: PreOrderInput["lines"],
): Promise<{ lines?: PreparedLine[]; error?: string }> {
  const productIds = Array.from(
    new Set(
      lines
        .map((line) => line.product_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const products = new Map<string, ProductSnapshot>();
  const activeReservedByProduct = new Map<string, number>();

  if (productIds.length > 0) {
    const { data: productRows, error: productsErr } = await supabase
      .from("products")
      .select(
        "id, brand, model, sku, size, size_label, color, quantity, hpp, sell_price, price_offline",
      )
      .in("id", productIds)
      .eq("is_active", true);

    if (productsErr) return { error: productsErr.message };

    for (const product of (productRows as ProductSnapshot[] | null) ?? []) {
      products.set(product.id, product);
    }

    const missing = productIds.filter((id) => !products.has(id));
    if (missing.length > 0) {
      return {
        error:
          "Ada produk yang tidak ditemukan atau nonaktif. Pilih ulang produk dari picker inventory.",
      };
    }

    const { data: reservations, error: reservationErr } = await (supabase as any)
      .from("stock_reservations")
      .select("product_id, quantity")
      .in("product_id", productIds)
      .eq("status", "active");

    if (reservationErr) return { error: reservationErr.message };

    for (const reservation of (reservations as Array<{
      product_id: string | null;
      quantity: number | null;
    }> | null) ?? []) {
      if (!reservation.product_id) continue;
      activeReservedByProduct.set(
        reservation.product_id,
        (activeReservedByProduct.get(reservation.product_id) ?? 0) +
          Number(reservation.quantity ?? 0),
      );
    }
  }

  const reservedInThisOrder = new Map<string, number>();

  const prepared = lines.map((line) => {
    const product = line.product_id ? products.get(line.product_id) ?? null : null;
    if (!product) {
      return {
        ...line,
        productSnapshot: null,
        reservedQty: 0,
        purchaseQty: line.requested_qty,
        status: "review" as PreOrderStatus,
      };
    }

    const alreadyReserved = activeReservedByProduct.get(product.id) ?? 0;
    const reservedNow = reservedInThisOrder.get(product.id) ?? 0;
    const availableQty = Math.max(
      0,
      Number(product.quantity ?? 0) - alreadyReserved - reservedNow,
    );
    const reservedQty = Math.min(line.requested_qty, availableQty);
    const purchaseQty = Math.max(0, line.requested_qty - reservedQty);
    reservedInThisOrder.set(product.id, reservedNow + reservedQty);

    return {
      ...line,
      productSnapshot: product,
      reservedQty,
      purchaseQty,
      status:
        purchaseQty > 0
          ? ("needs_purchase" as PreOrderStatus)
          : ("ready_from_stock" as PreOrderStatus),
    };
  });

  return { lines: prepared };
}

export async function createPreOrder(input: unknown) {
  const profile = await requireRole([...MANAGE_ROLES]);
  const parsed = preOrderInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const lock = await assertPeriodOpen(parsed.data.order_date);
  if (lock.error) return { error: { _form: [lock.error] } };

  const supabase = await createClient();
  const prepared = await prepareLines(supabase, parsed.data.lines);
  if (prepared.error || !prepared.lines) {
    return { error: { _form: [prepared.error ?? "Gagal menyiapkan item"] } };
  }

  const headerStatus = summarizeStatus(prepared.lines);

  const { data: preOrder, error: orderErr } = await (supabase as any)
    .from("pre_orders")
    .insert({
      source: parsed.data.source,
      channel: parsed.data.channel,
      marketplace_order_id: normalizeOptional(parsed.data.marketplace_order_id),
      customer_id: parsed.data.customer_id ?? null,
      customer_name: parsed.data.customer_name,
      order_date: parsed.data.order_date,
      deadline_date: parsed.data.deadline_date || null,
      status: headerStatus,
      marketplace_status: normalizeOptional(parsed.data.marketplace_status),
      notes: normalizeOptional(parsed.data.notes),
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (orderErr || !preOrder) {
    return { error: { _form: [orderErr?.message ?? "Gagal membuat Pre Order"] } };
  }

  const insertedLineIds: string[] = [];
  for (const line of prepared.lines) {
    const product = line.productSnapshot;
    const { data: insertedLine, error: lineErr } = await (supabase as any)
      .from("pre_order_lines")
      .insert({
        pre_order_id: preOrder.id,
        product_id: line.product_id ?? null,
        sku: line.sku || product?.sku || "-",
        product_name:
          line.product_name ||
          [product?.brand, product?.model, product?.color]
            .filter(Boolean)
            .join(" ") ||
          "Produk manual",
        brand: normalizeOptional(line.brand) ?? product?.brand ?? null,
        model: normalizeOptional(line.model) ?? product?.model ?? null,
        color: normalizeOptional(line.color) ?? product?.color ?? null,
        size_label:
          line.size_label ||
          product?.size_label ||
          (product?.size != null ? String(Number(product.size)) : "-"),
        size_value: line.size_value ?? product?.size ?? null,
        requested_qty: line.requested_qty,
        reserved_qty: line.reservedQty,
        purchase_qty: line.purchaseQty,
        unit_price: line.unit_price,
        estimated_cost: line.estimated_cost || product?.hpp || 0,
        status: line.status,
        notes: normalizeOptional(line.notes),
      })
      .select("id")
      .single();

    if (lineErr || !insertedLine) {
      await (supabase as any).from("pre_orders").delete().eq("id", preOrder.id);
      return {
        error: {
          _form: [
            lineErr?.message ??
              "Gagal menyimpan item Pre Order. Data header dibatalkan.",
          ],
        },
      };
    }

    insertedLineIds.push(insertedLine.id);

    if (line.product_id && line.reservedQty > 0) {
      const { error: reservationErr } = await (supabase as any)
        .from("stock_reservations")
        .insert({
          pre_order_line_id: insertedLine.id,
          product_id: line.product_id,
          quantity: line.reservedQty,
          status: "active",
          created_by: profile.id,
        });

      if (reservationErr) {
        await (supabase as any).from("pre_orders").delete().eq("id", preOrder.id);
        return {
          error: {
            _form: [
              `Gagal membuat reservasi stok untuk item ${line.sku}: ${reservationErr.message}`,
            ],
          },
        };
      }
    }
  }

  await logActivity({
    user_id: profile.id,
    action: "create",
    entity_type: "pre_order",
    entity_id: preOrder.id,
    new_data: {
      source: parsed.data.source,
      channel: parsed.data.channel,
      marketplace_order_id: parsed.data.marketplace_order_id,
      line_ids: insertedLineIds,
      status: headerStatus,
    },
  });

  revalidatePath("/pre-order");
  revalidatePath("/inventory");
  revalidatePath("/pembelian/purchase-order");
  return { data: { id: preOrder.id, status: headerStatus } };
}

export async function cancelPreOrder(id: string, reason?: string) {
  const profile = await requireRole([...MANAGE_ROLES]);
  const supabase = await createClient();

  const { data: existing, error: getErr } = await (supabase as any)
    .from("pre_orders")
    .select("id, status, notes")
    .eq("id", id)
    .single();

  if (getErr || !existing) return { error: "Pre Order tidak ditemukan" };
  if (existing.status === "packed") {
    return {
      error:
        "Pre Order sudah masuk packing. Batalkan dari jalur packing/retur supaya stok dan audit tetap konsisten.",
    };
  }
  if (existing.status === "cancelled") return { success: true };

  const newNotes = reason
    ? `${existing.notes ?? ""}\n[Dibatalkan]: ${reason}`.trim()
    : existing.notes;

  const { data: lines, error: linesErr } = await (supabase as any)
    .from("pre_order_lines")
    .select("id")
    .eq("pre_order_id", id);
  if (linesErr) return { error: linesErr.message };

  const lineIds = ((lines as Array<{ id: string }> | null) ?? []).map(
    (line) => line.id,
  );

  if (lineIds.length > 0) {
    const { data: reservations, error: reservationsErr } = await (supabase as any)
      .from("stock_reservations")
      .select("id")
      .in("pre_order_line_id", lineIds);
    if (reservationsErr) return { error: reservationsErr.message };

    const reservationIds = ((reservations as Array<{ id: string }> | null) ?? [])
      .map((reservation) => reservation.id);
    if (reservationIds.length > 0) {
      const { data: packedItems, error: packedItemsErr } = await (supabase as any)
        .from("packing_items")
        .select("id")
        .in("stock_reservation_id", reservationIds)
        .limit(1);
      if (packedItemsErr) return { error: packedItemsErr.message };
      if (((packedItems as Array<{ id: string }> | null) ?? []).length > 0) {
        return {
          error:
            "Pre Order sudah punya item di packing. Batalkan/retur dari jalur packing supaya stok dan audit tetap konsisten.",
        };
      }
    }

    const { error: reservationErr } = await (supabase as any)
      .from("stock_reservations")
      .update({ status: "cancelled", released_at: new Date().toISOString() })
      .in("pre_order_line_id", lineIds)
      .eq("status", "active");
    if (reservationErr) return { error: reservationErr.message };
  }

  const { error: lineUpdateErr } = await (supabase as any)
    .from("pre_order_lines")
    .update({ status: "cancelled", reserved_qty: 0 })
    .eq("pre_order_id", id);
  if (lineUpdateErr) return { error: lineUpdateErr.message };

  const { error: orderErr } = await (supabase as any)
    .from("pre_orders")
    .update({ status: "cancelled", notes: newNotes })
    .eq("id", id);
  if (orderErr) return { error: orderErr.message };

  await logActivity({
    user_id: profile.id,
    action: "cancel",
    entity_type: "pre_order",
    entity_id: id,
    new_data: { reason },
  });

  revalidatePath("/pre-order");
  revalidatePath("/inventory");
  return { success: true };
}
