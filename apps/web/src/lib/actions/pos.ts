"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@sneakervault/supabase/server";
import { posCheckoutSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { assertPeriodOpen } from "@/lib/fiscal-periods";

const POS_ROLES = ["owner", "shopkeeper", "finance"] as const;

function revalidatePos() {
  revalidatePath("/penjualan/pos");
  revalidatePath("/penjualan/invoice");
  revalidatePath("/penjualan/penerimaan-kas");
  revalidatePath("/kas-bank/akun");
  revalidatePath("/kas-bank/mutasi");
  revalidatePath("/inventory");
  revalidatePath("/buku-besar/journal");
}

type PosCheckoutResult = {
  invoice_id: string;
  invoice_number: string;
  payment_id: string;
  payment_number: string;
  total: number;
};

export async function posCheckout(input: unknown) {
  const profile = await requireRole([...POS_ROLES]);
  const parsed = posCheckoutSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const lock = await assertPeriodOpen(parsed.data.invoice_date);
  if (lock.error) return { error: { _form: [lock.error] } };

  const supabase = await createClient();

  // Every write (invoice, lines, stock decrement, movements, sales journal,
  // payment, allocation, bank balance + transaction, payment journal) runs
  // inside the single `pos_checkout` DB transaction. A failure at any step
  // rolls back the whole sale instead of leaving partial accounting data.
  const { data, error } = await supabase.rpc("pos_checkout", {
    p_payload: {
      invoice_date: parsed.data.invoice_date,
      discount: parsed.data.discount,
      tax: parsed.data.tax,
      customer_id: parsed.data.customer_id ?? null,
      customer_name: parsed.data.customer_name?.trim() || null,
      payment_method: parsed.data.payment_method,
      bank_account_id: parsed.data.bank_account_id,
      reference_no: parsed.data.reference_no ?? null,
      notes: parsed.data.notes ?? null,
      lines: parsed.data.lines.map((line) => ({
        product_id: line.product_id,
        qty: line.qty,
        unit_price: line.unit_price,
      })),
    },
  });

  if (error) return { error: { _form: [error.message] } };
  const result = data as unknown as PosCheckoutResult;

  await logActivity({
    user_id: profile.id,
    action: "pos_checkout",
    entity_type: "sales_invoice",
    entity_id: result.invoice_id,
    new_data: {
      invoice_number: result.invoice_number,
      payment_number: result.payment_number,
      items: parsed.data.lines.length,
      total: result.total,
    },
  });

  revalidatePos();
  return { data: result };
}

export async function cancelPosCheckout(invoiceId: string, reason?: string) {
  const profile = await requireRole([...POS_ROLES]);

  const lock = await assertPeriodOpen(new Date().toISOString().slice(0, 10));
  if (lock.error) return { error: { _form: [lock.error] } };

  const supabase = await createClient();
  const { data, error } = await (supabase as any).rpc("cancel_pos_checkout", {
    p_invoice_id: invoiceId,
    p_reason: reason ?? null,
  });

  if (error) return { error: { _form: [error.message] } };

  const result = data as {
    invoice_number?: string;
    payment_number?: string;
    amount?: number;
  } | null;

  await logActivity({
    user_id: profile.id,
    action: "pos_cancel",
    entity_type: "sales_invoice",
    entity_id: invoiceId,
    new_data: {
      invoice_number: result?.invoice_number,
      payment_number: result?.payment_number,
      amount: result?.amount,
      reason,
    },
  });

  revalidatePos();
  return { data };
}
