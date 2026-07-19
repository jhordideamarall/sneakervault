"use server";

import { createClient } from "@sneakervault/supabase/server";
import { customerPaymentInputSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { revalidatePath } from "next/cache";
import { journalForCustomerPayment } from "../journal-engine";
import { assertPeriodOpen } from "@/lib/fiscal-periods";
import { deleteCustomerPaymentAtomic } from "./transaction-deletes";

const ROLES = ["owner", "finance"] as const;

export async function createCustomerPayment(input: unknown) {
  const profile = await requireRole([...ROLES]);
  const parsed = customerPaymentInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const lock = await assertPeriodOpen(parsed.data.payment_date);
  if (lock.error) return { error: { _form: [lock.error] } };

  const supabase = await createClient();

  const invoiceIds = parsed.data.allocations.map((a) => a.invoice_id);
  const { data: invs, error: invErr } = await supabase
    .from("sales_invoices")
    .select(
      "id, customer_id, customer_name, total, paid_amount, status, invoice_number",
    )
    .in("id", invoiceIds);
  if (invErr) return { error: { _form: [invErr.message] } };
  if (!invs || invs.length !== invoiceIds.length)
    return { error: { _form: ["Beberapa invoice tidak ditemukan"] } };

  // Validate: same customer (if customer_id set), valid status, amount ≤ remaining
  for (const inv of invs) {
    if (
      parsed.data.customer_id &&
      inv.customer_id &&
      inv.customer_id !== parsed.data.customer_id
    ) {
      return {
        error: {
          _form: [
            `Invoice ${inv.invoice_number} bukan milik customer terpilih`,
          ],
        },
      };
    }
    if (inv.status !== "issued" && inv.status !== "partial") {
      return {
        error: {
          _form: [
            `Invoice ${inv.invoice_number} bukan status outstanding (${inv.status})`,
          ],
        },
      };
    }
    const alloc = parsed.data.allocations.find((a) => a.invoice_id === inv.id);
    if (!alloc) continue;
    const remaining = Number(inv.total) - Number(inv.paid_amount);
    if (alloc.amount > remaining + 0.001) {
      return {
        error: {
          _form: [
            `Alokasi ke ${inv.invoice_number} (${alloc.amount}) melebihi sisa ${remaining}`,
          ],
        },
      };
    }
  }

  const totalAmount = parsed.data.allocations.reduce(
    (a, x) => a + x.amount,
    0,
  );

  // Validate bank account if non-cash
  let bankAcc: { id: string; current_balance: number; name: string } | null =
    null;
  if (parsed.data.bank_account_id) {
    const { data: ba } = await supabase
      .from("bank_accounts")
      .select("id, current_balance, name, is_active")
      .eq("id", parsed.data.bank_account_id)
      .single();
    if (!ba || !ba.is_active)
      return { error: { _form: ["Akun bank tidak aktif"] } };
    bankAcc = {
      id: ba.id,
      current_balance: Number(ba.current_balance),
      name: ba.name,
    };
  }
  if (parsed.data.payment_method !== "cash" && !parsed.data.bank_account_id) {
    return {
      error: {
        _form: ["Pilih akun bank untuk metode pembayaran selain tunai"],
      },
    };
  }

  // Generate number
  const { data: payNum, error: numErr } = await supabase.rpc(
    "generate_customer_payment_number",
  );
  if (numErr) return { error: { _form: [numErr.message] } };

  const { data: payment, error: payErr } = await supabase
    .from("customer_payments")
    .insert({
      payment_number: payNum,
      customer_id: parsed.data.customer_id || null,
      customer_name: parsed.data.customer_name,
      payment_date: parsed.data.payment_date,
      amount: totalAmount,
      payment_method: parsed.data.payment_method,
      bank_account_id: parsed.data.bank_account_id || null,
      reference_no: parsed.data.reference_no || null,
      notes: parsed.data.notes || null,
      attachment_url: parsed.data.attachment_url || null,
      created_by: profile.id,
    })
    .select()
    .single();
  if (payErr) return { error: { _form: [payErr.message] } };

  // Allocations
  const allocRows = parsed.data.allocations.map((a) => ({
    payment_id: payment.id,
    invoice_id: a.invoice_id,
    amount: a.amount,
  }));
  const { error: allocErr } = await supabase
    .from("customer_payment_allocations")
    .insert(allocRows);
  if (allocErr) {
    await supabase.from("customer_payments").delete().eq("id", payment.id);
    return { error: { _form: [allocErr.message] } };
  }

  // Update invoice paid_amount + status
  for (const alloc of parsed.data.allocations) {
    const inv = invs.find((i) => i.id === alloc.invoice_id)!;
    const newPaid = Number(inv.paid_amount) + alloc.amount;
    const total = Number(inv.total);
    const newStatus =
      newPaid >= total - 0.001
        ? "paid"
        : newPaid > 0
          ? "partial"
          : "issued";
    const { error: updErr } = await supabase
      .from("sales_invoices")
      .update({ paid_amount: newPaid, status: newStatus })
      .eq("id", alloc.invoice_id);
    if (updErr) return { error: { _form: [updErr.message] } };
  }

  // Credit bank balance + transaction
  if (bankAcc) {
    const newBal = bankAcc.current_balance + totalAmount;
    const { error: bankError } = await supabase
      .from("bank_accounts")
      .update({ current_balance: newBal })
      .eq("id", bankAcc.id);
    if (bankError) return { error: { _form: [bankError.message] } };

    const { error: transactionError } = await supabase.from("bank_transactions").insert({
      bank_account_id: bankAcc.id,
      transaction_date: parsed.data.payment_date,
      type: "credit",
      amount: totalAmount,
      balance_after: newBal,
      reference_no: parsed.data.reference_no || null,
      description: `Penerimaan customer ${payNum}`,
      related_entity_type: "customer_payment",
      related_entity_id: payment.id,
      created_by: profile.id,
    });
    if (transactionError) return { error: { _form: [transactionError.message] } };
  }

  // Auto-journal: Dr Kas-Bank / Cr Piutang
  const journal = await journalForCustomerPayment({
    payment_id: payment.id,
    payment_number: payNum as string,
    payment_date: parsed.data.payment_date,
    amount: totalAmount,
    bank_account_id: parsed.data.bank_account_id ?? null,
    user_id: profile.id,
  });
  if (journal.error) return { error: { _form: [journal.error] } };

  await logActivity({
    user_id: profile.id,
    action: "create",
    entity_type: "customer_payment",
    entity_id: payment.id,
    new_data: {
      payment_number: payNum,
      customer_name: parsed.data.customer_name,
      amount: totalAmount,
      allocations: parsed.data.allocations.length,
    },
  });

  revalidatePath("/penjualan/penerimaan-kas");
  revalidatePath("/penjualan/invoice");
  revalidatePath("/kas-bank/akun");
  revalidatePath("/buku-besar/journal");
  return { data: payment };
}

export async function deleteCustomerPayment(id: string) {
  return deleteCustomerPaymentAtomic(id);
}
