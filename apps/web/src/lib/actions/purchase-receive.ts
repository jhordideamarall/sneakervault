"use server";

import { createClient } from "@sneakervault/supabase/server";
import { receivePurchaseOrderSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { revalidatePath } from "next/cache";
import {
  journalForPurchaseInvoice,
  journalForVendorPayment,
} from "../journal-engine";
import { assertPeriodOpen } from "@/lib/fiscal-periods";
import { createStockMovement } from "./stock-movements";

export async function receivePurchaseOrder(input: unknown) {
  const profile = await requireRole(["owner", "admin_gudang", "finance"]);
  const parsed = receivePurchaseOrderSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { po_id, lines, notes } = parsed.data;
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const lock = await assertPeriodOpen(today);
  if (lock.error) return { error: { _form: [lock.error] } };

  // Load PO + lines snapshot
  const { data: po, error: poErr } = await supabase
    .from("purchase_orders")
    .select("id, po_number, status")
    .eq("id", po_id)
    .single();
  if (poErr || !po) return { error: { _form: ["PO tidak ditemukan"] } };
  if (po.status !== "approved" && po.status !== "receiving") {
    return {
      error: { _form: ["PO ini tidak dalam status siap diterima"] },
    };
  }

  const { data: poLines, error: linesErr } = await supabase
    .from("purchase_order_lines")
    .select("id, product_id, ordered_qty, received_qty, unit_cost, new_brand, new_model, new_size, new_color, new_sku")
    .eq("po_id", po_id);
  if (linesErr || !poLines)
    return { error: { _form: ["Gagal membaca line PO"] } };

  // Validate each receive against remaining
  const lineMap = new Map(poLines.map((l) => [l.id, l]));
  const toProcess: {
    line_id: string;
    product_id: string;
    receive_qty: number;
    unit_cost: number;
    new_received: number;
    ordered_qty: number;
  }[] = [];

  for (const r of lines) {
    if (r.receive_qty <= 0) continue;
    const ln = lineMap.get(r.line_id);
    if (!ln) return { error: { _form: [`Line ${r.line_id} tidak ditemukan`] } };
    const remaining = ln.ordered_qty - ln.received_qty;
    if (r.receive_qty > remaining) {
      return {
        error: {
          _form: [
            `Qty diterima melebihi sisa untuk satu item (max ${remaining})`,
          ],
        },
      };
    }

    // Manual/new-product line: product doesn't exist yet — create it (or match an
    // existing SKU), then persist product_id onto the line so it syncs to
    // inventory now and future receives reuse it.
    let productId = ln.product_id as string | null;
    if (!productId) {
      const sku = (ln.new_sku ?? "").trim();
      if (!sku || !ln.new_brand || !ln.new_model || ln.new_size == null) {
        return { error: { _form: ["Item baru PO tidak lengkap (brand/model/size/SKU)"] } };
      }
      const { data: existingProd } = await supabase
        .from("products")
        .select("id")
        .eq("sku", sku)
        .maybeSingle();
      if (existingProd) {
        productId = existingProd.id;
      } else {
        const { data: created, error: cErr } = await supabase
          .from("products")
          .insert({
            brand: ln.new_brand,
            model: ln.new_model,
            size: ln.new_size,
            color: ln.new_color ?? null,
            sku,
            barcode: sku,
            hpp: 0,
            sell_price: Number(ln.unit_cost),
            price_offline: Number(ln.unit_cost),
            quantity: 0,
            is_active: true,
            first_inbound_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (cErr) return { error: { _form: [`Gagal membuat produk ${sku}: ${cErr.message}`] } };
        productId = created.id;
      }
      await supabase
        .from("purchase_order_lines")
        .update({ product_id: productId })
        .eq("id", ln.id);
    }

    toProcess.push({
      line_id: ln.id,
      product_id: productId as string,
      receive_qty: r.receive_qty,
      unit_cost: Number(ln.unit_cost),
      new_received: ln.received_qty + r.receive_qty,
      ordered_qty: ln.ordered_qty,
    });
  }

  if (toProcess.length === 0) {
    return { error: { _form: ["Tidak ada item yang diterima"] } };
  }

  // Process each line: increment stock, recalc HPP, log movement, update line
  const movementIds: string[] = [];
  for (const p of toProcess) {
    const { error: incErr } = await supabase.rpc("increment_product_quantity", {
      p_id: p.product_id,
      qty: p.receive_qty,
    });
    if (incErr) return { error: { _form: [incErr.message] } };

    const { error: hppErr } = await supabase.rpc("recalculate_hpp_by_sku", {
      p_product_id: p.product_id,
      p_new_qty: p.receive_qty,
      p_new_unit_cost: p.unit_cost,
    });
    if (hppErr) return { error: { _form: [hppErr.message] } };

    const movement = await createStockMovement(supabase, {
      product_id: p.product_id,
      type: "inbound",
      quantity: p.receive_qty,
      unit_cost: p.unit_cost,
      reference_type: "purchase_order_line",
      reference_id: p.line_id,
    });
    if (movement.error) return { error: { _form: [movement.error] } };
    if (movement.id) movementIds.push(movement.id);

    const { error: lineUpdErr } = await supabase
      .from("purchase_order_lines")
      .update({ received_qty: p.new_received })
      .eq("id", p.line_id);
    if (lineUpdErr) return { error: { _form: [lineUpdErr.message] } };
  }

  // Update PO status based on aggregate
  const { data: refreshed } = await supabase
    .from("purchase_order_lines")
    .select("ordered_qty, received_qty")
    .eq("po_id", po_id);
  const allComplete =
    (refreshed ?? []).every((l) => l.received_qty >= l.ordered_qty) &&
    (refreshed ?? []).length > 0;
  const anyReceived = (refreshed ?? []).some((l) => l.received_qty > 0);

  const newStatus = allComplete
    ? "completed"
    : anyReceived
      ? "receiving"
      : po.status;

  if (newStatus !== po.status) {
    await supabase
      .from("purchase_orders")
      .update({ status: newStatus })
      .eq("id", po_id);
  }

  // Auto-create draft Faktur Pembelian when PO is fully completed.
  // This removes the manual step — user can edit/cancel if vendor invoice differs.
  let autoInvoiceId: string | null = null;
  let autoPaymentId: string | null = null;
  let autoPaymentAmount = 0;

  if (newStatus === "completed") {
    const { data: existingInv } = await supabase
      .from("purchase_invoices")
      .select("id")
      .eq("po_id", po_id)
      .maybeSingle();

    if (!existingInv) {
      const { data: poFull, error: poFullErr } = await supabase
        .from("purchase_orders")
        .select(
          "supplier_id, order_date, subtotal, tax, total, po_number, payment_type, dp_amount, dp_bank_account_id",
        )
        .eq("id", po_id)
        .single();
      if (poFullErr || !poFull) {
        return { error: { _form: ["Gagal membaca detail PO"] } };
      }

      const { data: invNum, error: invNumErr } = await supabase.rpc(
        "generate_purchase_invoice_number",
      );
      if (invNumErr || !invNum) {
        return {
          error: {
            _form: [invNumErr?.message ?? "Gagal membuat nomor faktur pembelian"],
          },
        };
      }

      const f = poFull as {
        supplier_id: string;
        order_date: string;
        subtotal: number;
        tax: number;
        total: number;
        po_number: string;
        payment_type: "credit" | "cash" | "dp" | null;
        dp_amount: number | null;
        dp_bank_account_id: string | null;
      };
      const invDate = today;
      const invTotal = Number(f.total);

      const { data: newInv, error: newInvErr } = await supabase
        .from("purchase_invoices")
        .insert({
          invoice_number: invNum,
          supplier_id: f.supplier_id,
          po_id,
          invoice_date: invDate,
          due_date: null,
          subtotal: Number(f.subtotal),
          tax: Number(f.tax),
          total: invTotal,
          paid_amount: 0,
          status: "unpaid",
          notes: `Auto-generated dari ${f.po_number} saat penerimaan selesai`,
          created_by: profile.id,
        })
        .select("id")
        .single();
      if (newInvErr || !newInv) {
        return {
          error: {
            _form: [newInvErr?.message ?? "Gagal membuat faktur pembelian"],
          },
        };
      }

      autoInvoiceId = newInv.id;
      const purchaseJournal = await journalForPurchaseInvoice({
        invoice_id: newInv.id,
        invoice_number: invNum as string,
        invoice_date: invDate,
        subtotal: Number(f.subtotal),
        tax: Number(f.tax),
        user_id: profile.id,
      });
      if (purchaseJournal.error) {
        return { error: { _form: [purchaseJournal.error] } };
      }

      // Auto-create vendor payment based on PO payment terms
      const payType = f.payment_type ?? "credit";
      const dpAmount = Number(f.dp_amount ?? 0);
      const payAmount =
        payType === "cash"
          ? invTotal
          : payType === "dp"
            ? Math.min(dpAmount, invTotal)
            : 0;

      if (payAmount > 0 && f.dp_bank_account_id) {
        // Validate bank still active + has balance
        const { data: bank, error: bankErr } = await supabase
          .from("bank_accounts")
          .select("id, current_balance, type, name, is_active")
          .eq("id", f.dp_bank_account_id)
          .single();
        if (bankErr || !bank) {
          return { error: { _form: ["Akun kas/bank pembayaran tidak ditemukan"] } };
        }
        const b = bank as {
          id: string;
          current_balance: number;
          type: string;
          name: string;
          is_active: boolean;
        };

        if (!b.is_active) {
          return { error: { _form: ["Akun kas/bank pembayaran tidak aktif"] } };
        }
        if (Number(b.current_balance) < payAmount) {
          return {
            error: { _form: ["Saldo kas/bank tidak cukup untuk auto-bayar PO"] },
          };
        }

        const { data: payNum, error: payNumErr } = await supabase.rpc(
          "generate_vendor_payment_number",
        );
        if (payNumErr || !payNum) {
          return {
            error: {
              _form: [payNumErr?.message ?? "Gagal membuat nomor pembayaran vendor"],
            },
          };
        }
        const paymentMethod = b.type === "cash" ? "cash" : "bank_transfer";

        const { data: vp, error: vpErr } = await supabase
          .from("vendor_payments")
          .insert({
            payment_number: payNum,
            supplier_id: f.supplier_id,
            payment_date: invDate,
            payment_method: paymentMethod,
            bank_account_id: f.dp_bank_account_id,
            amount: payAmount,
            reference_no: null,
            notes:
              payType === "cash"
                ? `Auto-Bayar Lunas dari ${f.po_number}`
                : `Auto-DP dari ${f.po_number}`,
            attachment_url: null,
            created_by: profile.id,
          })
          .select("id")
          .single();
        if (vpErr || !vp) {
          return {
            error: {
              _form: [vpErr?.message ?? "Gagal membuat pembayaran vendor"],
            },
          };
        }

        autoPaymentId = vp.id;
        autoPaymentAmount = payAmount;

        // Insert allocation
        const { error: allocationErr } = await supabase
          .from("vendor_payment_allocations")
          .insert({
            payment_id: vp.id,
            invoice_id: newInv.id,
            amount: payAmount,
          });
        if (allocationErr) return { error: { _form: [allocationErr.message] } };

        // Update invoice paid_amount + status
        const newPaid = payAmount;
        const invoiceStatus = newPaid >= invTotal ? "paid" : "partial";
        const { error: invoicePayErr } = await supabase
          .from("purchase_invoices")
          .update({
            paid_amount: newPaid,
            status: invoiceStatus,
          })
          .eq("id", newInv.id);
        if (invoicePayErr) return { error: { _form: [invoicePayErr.message] } };

        // Decrement bank balance
        const { error: bankBalanceErr } = await supabase
          .from("bank_accounts")
          .update({
            current_balance: Number(b.current_balance) - payAmount,
          })
          .eq("id", b.id);
        if (bankBalanceErr) return { error: { _form: [bankBalanceErr.message] } };

        // Record bank transaction (debit = uang keluar)
        const { error: bankTxErr } = await supabase
          .from("bank_transactions")
          .insert({
            bank_account_id: b.id,
            transaction_date: invDate,
            type: "debit",
            amount: payAmount,
            description:
              payType === "cash"
                ? `Bayar Lunas Vendor - ${f.po_number}`
                : `DP Vendor - ${f.po_number}`,
            reference_no: payNum as string,
            related_entity_type: "vendor_payment",
            related_entity_id: vp.id,
            is_reconciled: false,
            created_by: profile.id,
          });
        if (bankTxErr) return { error: { _form: [bankTxErr.message] } };

        // Auto-journal Dr Hutang / Cr Kas-Bank
        const vendorPaymentJournal = await journalForVendorPayment({
          payment_id: vp.id,
          payment_number: payNum as string,
          payment_date: invDate,
          amount: payAmount,
          bank_account_id: b.id,
          user_id: profile.id,
        });
        if (vendorPaymentJournal.error) {
          return { error: { _form: [vendorPaymentJournal.error] } };
        }
      }
    } else {
      autoInvoiceId = (existingInv as { id: string }).id;
    }
  }

  if (notes) {
    const { data: existing } = await supabase
      .from("purchase_orders")
      .select("notes")
      .eq("id", po_id)
      .single();
    const merged = `${existing?.notes ?? ""}\n[Terima ${new Date().toLocaleDateString("id-ID")}]: ${notes}`.trim();
    await supabase
      .from("purchase_orders")
      .update({ notes: merged })
      .eq("id", po_id);
  }

  await logActivity({
    user_id: profile.id,
    action: "receive",
    entity_type: "purchase_order",
    entity_id: po_id,
    new_data: {
      po_number: po.po_number,
      received_lines: toProcess.length,
      total_qty: toProcess.reduce((a, p) => a + p.receive_qty, 0),
      new_status: newStatus,
      movements: movementIds,
    },
  });

  revalidatePath("/pembelian/purchase-order");
  revalidatePath("/pembelian/penerimaan");
  revalidatePath("/pembelian/faktur");
  revalidatePath("/pembelian/pembayaran");
  revalidatePath("/kas-bank/mutasi");
  revalidatePath("/kas-bank/akun");
  revalidatePath("/buku-besar/journal");
  revalidatePath("/inventory");
  return {
    success: true,
    new_status: newStatus,
    received_lines: toProcess.length,
    auto_invoice_id: autoInvoiceId,
    auto_payment_id: autoPaymentId,
    auto_payment_amount: autoPaymentAmount,
  };
}
