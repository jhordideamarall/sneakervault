"use server";

import { createClient } from "@sneakervault/supabase/server";
import { vendorPaymentInputSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { revalidatePath } from "next/cache";
import { journalForVendorPayment, reverseJournalBySource } from "../journal-engine";

const ROLES = ["owner", "finance"] as const;

export async function createVendorPayment(input: unknown) {
  const profile = await requireRole([...ROLES]);
  const parsed = vendorPaymentInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();

  // Validate allocations vs invoices
  const invoiceIds = parsed.data.allocations.map((a) => a.invoice_id);
  const { data: invs, error: invErr } = await supabase
    .from("purchase_invoices")
    .select("id, supplier_id, total, paid_amount, status, invoice_number")
    .in("id", invoiceIds);
  if (invErr) return { error: { _form: [invErr.message] } };
  if (!invs || invs.length !== invoiceIds.length)
    return { error: { _form: ["Beberapa faktur tidak ditemukan"] } };

  for (const inv of invs) {
    if (inv.supplier_id !== parsed.data.supplier_id)
      return {
        error: {
          _form: [
            `Faktur ${inv.invoice_number} bukan milik vendor terpilih`,
          ],
        },
      };
    if (inv.status === "paid" || inv.status === "cancelled")
      return {
        error: {
          _form: [`Faktur ${inv.invoice_number} sudah ${inv.status}`],
        },
      };
    const alloc = parsed.data.allocations.find((a) => a.invoice_id === inv.id);
    if (!alloc) continue;
    const remaining = Number(inv.total) - Number(inv.paid_amount);
    if (alloc.amount > remaining + 0.001)
      return {
        error: {
          _form: [
            `Alokasi ke ${inv.invoice_number} (${alloc.amount}) melebihi sisa ${remaining}`,
          ],
        },
      };
  }

  const totalAmount = parsed.data.allocations.reduce(
    (a, x) => a + x.amount,
    0,
  );

  // Validate bank account if non-cash method
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
    if (bankAcc.current_balance < totalAmount)
      return {
        error: {
          _form: [
            `Saldo ${bankAcc.name} (${bankAcc.current_balance}) tidak cukup untuk pembayaran ${totalAmount}`,
          ],
        },
      };
  }
  if (parsed.data.payment_method !== "cash" && !parsed.data.bank_account_id) {
    return {
      error: {
        _form: ["Pilih akun bank untuk metode pembayaran selain tunai"],
      },
    };
  }

  // Generate payment number
  const { data: payNum, error: numErr } = await supabase.rpc(
    "generate_vendor_payment_number",
  );
  if (numErr) return { error: { _form: [numErr.message] } };

  // Insert payment header
  const { data: payment, error: payErr } = await supabase
    .from("vendor_payments")
    .insert({
      payment_number: payNum,
      supplier_id: parsed.data.supplier_id,
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

  // Insert allocations
  const allocRows = parsed.data.allocations.map((a) => ({
    payment_id: payment.id,
    invoice_id: a.invoice_id,
    amount: a.amount,
  }));
  const { error: allocErr } = await supabase
    .from("vendor_payment_allocations")
    .insert(allocRows);
  if (allocErr) {
    await supabase.from("vendor_payments").delete().eq("id", payment.id);
    return { error: { _form: [allocErr.message] } };
  }

  // Update each invoice paid_amount + status
  for (const alloc of parsed.data.allocations) {
    const inv = invs.find((i) => i.id === alloc.invoice_id)!;
    const newPaid = Number(inv.paid_amount) + alloc.amount;
    const total = Number(inv.total);
    const newStatus =
      newPaid >= total - 0.001
        ? "paid"
        : newPaid > 0
          ? "partial"
          : "unpaid";
    const { error: updErr } = await supabase
      .from("purchase_invoices")
      .update({ paid_amount: newPaid, status: newStatus })
      .eq("id", alloc.invoice_id);
    if (updErr) return { error: { _form: [updErr.message] } };
  }

  // Update bank account balance + record transaction
  if (bankAcc) {
    const newBal = bankAcc.current_balance - totalAmount;
    await supabase
      .from("bank_accounts")
      .update({ current_balance: newBal })
      .eq("id", bankAcc.id);

    await supabase.from("bank_transactions").insert({
      bank_account_id: bankAcc.id,
      transaction_date: parsed.data.payment_date,
      type: "debit",
      amount: totalAmount,
      balance_after: newBal,
      reference_no: parsed.data.reference_no || null,
      description: `Pembayaran vendor ${payNum}`,
      related_entity_type: "vendor_payment",
      related_entity_id: payment.id,
      created_by: profile.id,
    });
  }

  // Auto-journal: Dr Hutang Usaha / Cr Kas-Bank
  await journalForVendorPayment({
    payment_id: payment.id,
    payment_number: payNum as string,
    payment_date: parsed.data.payment_date,
    amount: totalAmount,
    bank_account_id: parsed.data.bank_account_id ?? null,
    user_id: profile.id,
  });

  await logActivity({
    user_id: profile.id,
    action: "create",
    entity_type: "vendor_payment",
    entity_id: payment.id,
    new_data: {
      payment_number: payNum,
      supplier_id: parsed.data.supplier_id,
      amount: totalAmount,
      allocations: parsed.data.allocations.length,
    },
  });

  revalidatePath("/pembelian/pembayaran");
  revalidatePath("/pembelian/faktur");
  revalidatePath("/kas-bank/akun");
  revalidatePath("/kas-bank/mutasi");
  revalidatePath("/buku-besar/journal");
  return { data: payment };
}

export async function reverseVendorPayment(id: string, reason?: string) {
  const profile = await requireRole([...ROLES]);
  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("vendor_payments")
    .select(
      "id, payment_number, amount, bank_account_id, vendor_payment_allocations(invoice_id, amount)",
    )
    .eq("id", id)
    .single();
  if (!payment) return { error: "Pembayaran tidak ditemukan" };

  const allocs = (payment.vendor_payment_allocations ?? []) as Array<{
    invoice_id: string;
    amount: number;
  }>;

  // Reverse each invoice
  for (const a of allocs) {
    const { data: inv } = await supabase
      .from("purchase_invoices")
      .select("paid_amount, total, status")
      .eq("id", a.invoice_id)
      .single();
    if (!inv) continue;
    const newPaid = Math.max(0, Number(inv.paid_amount) - Number(a.amount));
    const newStatus =
      newPaid <= 0.001
        ? "unpaid"
        : newPaid >= Number(inv.total) - 0.001
          ? "paid"
          : "partial";
    await supabase
      .from("purchase_invoices")
      .update({ paid_amount: newPaid, status: newStatus })
      .eq("id", a.invoice_id);
  }

  // Restore bank balance + insert reversing credit transaction
  if (payment.bank_account_id) {
    const { data: ba } = await supabase
      .from("bank_accounts")
      .select("current_balance")
      .eq("id", payment.bank_account_id)
      .single();
    if (ba) {
      const restored = Number(ba.current_balance) + Number(payment.amount);
      await supabase
        .from("bank_accounts")
        .update({ current_balance: restored })
        .eq("id", payment.bank_account_id);
      await supabase.from("bank_transactions").insert({
        bank_account_id: payment.bank_account_id,
        transaction_date: new Date().toISOString().slice(0, 10),
        type: "credit",
        amount: Number(payment.amount),
        balance_after: restored,
        description: `Reverse pembayaran ${payment.payment_number}${reason ? ` — ${reason}` : ""}`,
        related_entity_type: "vendor_payment_reversal",
        related_entity_id: payment.id,
        created_by: profile.id,
      });
    }
  }

  // Reverse journal
  await reverseJournalBySource("vendor_payment", id, reason);

  // Delete payment (cascade deletes allocations)
  await supabase.from("vendor_payments").delete().eq("id", id);

  await logActivity({
    user_id: profile.id,
    action: "reverse",
    entity_type: "vendor_payment",
    entity_id: id,
    new_data: { payment_number: payment.payment_number, reason },
  });

  revalidatePath("/pembelian/pembayaran");
  revalidatePath("/pembelian/faktur");
  revalidatePath("/kas-bank/akun");
  revalidatePath("/kas-bank/mutasi");
  return { success: true };
}
