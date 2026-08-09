"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@sneakervault/supabase/server";
import {
  startStockOpnameSchema,
  stockOpnameCountSchema,
} from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { assertPeriodOpen } from "@/lib/fiscal-periods";

const WAREHOUSE_ROLES = ["owner", "admin_gudang", "finance"] as const;

function revalidateOpname() {
  revalidatePath("/inventory/opname");
  revalidatePath("/inventory");
  revalidatePath("/reports");
  revalidatePath("/buku-besar/journal");
}

export async function startStockOpname(input: unknown) {
  const profile = await requireRole([...WAREHOUSE_ROLES]);
  const parsed = startStockOpnameSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const lock = await assertPeriodOpen(parsed.data.opname_date);
  if (lock.error) return { error: { _form: [lock.error] } };

  const supabase = await createClient();
  const { data: number, error: numberError } = await supabase.rpc(
    "generate_opname_number",
  );
  if (numberError) return { error: { _form: [numberError.message] } };

  const { data: session, error: sessionError } = await supabase
    .from("stock_opname_sessions")
    .insert({
      opname_number: number,
      opname_date: parsed.data.opname_date,
      status: "open",
      scope: parsed.data.scope,
      notes: parsed.data.notes || null,
      started_by: profile.id,
    })
    .select("id, opname_number")
    .single();
  if (sessionError || !session) {
    return {
      error: { _form: [sessionError?.message ?? "Gagal membuat sesi opname"] },
    };
  }

  let query = supabase
    .from("products")
    .select("id, quantity, hpp")
    .eq("is_active", true)
    .order("brand", { ascending: true })
    .order("model", { ascending: true })
    .order("size", { ascending: true });

  if (parsed.data.product_ids?.length) {
    query = query.in("id", parsed.data.product_ids);
  }

  const { data: products, error: productsError } = await query;
  if (productsError || !products || products.length === 0) {
    await supabase.from("stock_opname_sessions").delete().eq("id", session.id);
    return {
      error: {
        _form: [productsError?.message ?? "Tidak ada produk aktif untuk opname"],
      },
    };
  }

  const { error: lineError } = await supabase
    .from("stock_opname_lines")
    .insert(
      products.map((product) => ({
        session_id: session.id,
        product_id: product.id,
        system_qty: Number(product.quantity),
        physical_qty: null,
        unit_cost: Number(product.hpp ?? 0),
      })),
    );
  if (lineError) {
    await supabase.from("stock_opname_sessions").delete().eq("id", session.id);
    return { error: { _form: [lineError.message] } };
  }

  await logActivity({
    user_id: profile.id,
    action: "start",
    entity_type: "stock_opname",
    entity_id: session.id,
    new_data: {
      opname_number: session.opname_number,
      products: products.length,
    },
  });

  revalidateOpname();
  return { data: session };
}

export async function saveStockOpnameCounts(input: unknown) {
  const profile = await requireRole([...WAREHOUSE_ROLES]);
  const parsed = stockOpnameCountSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { data: session } = await supabase
    .from("stock_opname_sessions")
    .select("id, status")
    .eq("id", parsed.data.session_id)
    .single();
  if (!session) return { error: { _form: ["Sesi opname tidak ditemukan"] } };
  if (!["open", "counting"].includes(session.status)) {
    return { error: { _form: ["Sesi opname sudah tidak bisa dihitung"] } };
  }

  for (const line of parsed.data.lines) {
    const { error } = await supabase
      .from("stock_opname_lines")
      .update({
        physical_qty: line.physical_qty,
        reason: line.reason?.trim() || null,
        counted_by: profile.id,
        counted_at: new Date().toISOString(),
      })
      .eq("id", line.line_id)
      .eq("session_id", parsed.data.session_id);
    if (error) return { error: { _form: [error.message] } };
  }

  await supabase
    .from("stock_opname_sessions")
    .update({ status: "counting" })
    .eq("id", parsed.data.session_id);

  await logActivity({
    user_id: profile.id,
    action: "count",
    entity_type: "stock_opname",
    entity_id: parsed.data.session_id,
    new_data: { lines: parsed.data.lines.length },
  });

  revalidateOpname();
  return { success: true };
}

export async function submitStockOpnameForReview(sessionId: string) {
  const profile = await requireRole([...WAREHOUSE_ROLES]);
  const supabase = await createClient();

  const { data: reviewLines, error: reviewError } = await supabase
    .from("stock_opname_lines")
    .select("id, physical_qty, variance, reason")
    .eq("session_id", sessionId);
  if (reviewError) return { error: reviewError.message };
  if ((reviewLines ?? []).some((line) => line.physical_qty === null)) {
    return { error: "Masih ada item yang belum dihitung" };
  }
  if (
    (reviewLines ?? []).some(
      (line) => Number(line.variance ?? 0) !== 0 && !line.reason?.trim(),
    )
  ) {
    return { error: "Setiap item berselisih wajib memiliki alasan" };
  }

  const { error } = await supabase
    .from("stock_opname_sessions")
    .update({
      status: "review",
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .in("status", ["open", "counting"]);
  if (error) return { error: error.message };

  await logActivity({
    user_id: profile.id,
    action: "submit_review",
    entity_type: "stock_opname",
    entity_id: sessionId,
  });

  revalidateOpname();
  return { success: true };
}

export async function approveStockOpname(sessionId: string) {
  const profile = await requireRole(["owner"]);
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("stock_opname_sessions")
    .select("id, opname_number, opname_date, status")
    .eq("id", sessionId)
    .single();
  if (!session) return { error: "Sesi opname tidak ditemukan" };
  if (session.status !== "review") {
    return { error: "Hanya sesi Review yang bisa di-approve" };
  }

  const { data: lines } = await supabase
    .from("stock_opname_lines")
    .select("id, product_id, system_qty, physical_qty, variance, unit_cost, reason")
    .eq("session_id", sessionId);
  if (!lines || lines.length === 0) return { error: "Line opname kosong" };
  if (lines.some((line) => line.physical_qty === null)) {
    return { error: "Masih ada item yang belum dihitung" };
  }

  let increaseAmount = 0;
  let decreaseAmount = 0;
  let varianceLines = 0;

  for (const line of lines) {
    const variance = Number(line.variance ?? 0);
    if (variance === 0) continue;

    const unitCost = Number(line.unit_cost ?? 0);
    const amount = Math.abs(variance) * unitCost;
    if (variance > 0) increaseAmount += amount;
    else decreaseAmount += amount;
    varianceLines++;
  }

  const { error } = await supabase
    .from("stock_opname_sessions")
    .update({
      status: "approved",
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", session.id);
  if (error) return { error: error.message };

  await logActivity({
    user_id: profile.id,
    action: "approve",
    entity_type: "stock_opname",
    entity_id: session.id,
    new_data: {
      opname_number: session.opname_number,
      compare_only: true,
      variance_lines: varianceLines,
      increase_amount: increaseAmount,
      decrease_amount: decreaseAmount,
    },
  });

  revalidateOpname();
  return { success: true };
}

export async function cancelStockOpname(sessionId: string, reason?: string) {
  const profile = await requireRole([...WAREHOUSE_ROLES]);
  const supabase = await createClient();

  const { error } = await supabase
    .from("stock_opname_sessions")
    .update({
      status: "cancelled",
      cancelled_by: profile.id,
      cancelled_at: new Date().toISOString(),
      cancel_reason: reason?.trim() || null,
    })
    .eq("id", sessionId)
    .neq("status", "approved");
  if (error) return { error: error.message };

  await logActivity({
    user_id: profile.id,
    action: "cancel",
    entity_type: "stock_opname",
    entity_id: sessionId,
    new_data: { reason },
  });

  revalidateOpname();
  return { success: true };
}
