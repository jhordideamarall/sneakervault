"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@sneakervault/supabase/server";
import { requireRole } from "./auth";

export type TransactionDeleteResult = {
  deleted: boolean;
  reference_number: string;
  blocker_stage: string | null;
  blocker_numbers: string[];
  blocker_href: string | null;
  blocker_message: string | null;
};

type DeleteRpc =
  | "delete_vendor_payment_atomic"
  | "delete_purchase_invoice_atomic"
  | "delete_purchase_receipt_atomic"
  | "delete_purchase_order_atomic"
  | "delete_customer_payment_atomic"
  | "delete_sales_invoice_atomic";

const BLOCKER_ROUTES: Record<string, string> = {
  vendor_payment: "/pembelian/pembayaran",
  purchase_invoice: "/pembelian/faktur",
  purchase_receipt: "/pembelian/penerimaan?tab=history",
  customer_payment: "/penjualan/penerimaan-kas",
};

const BLOCKER_LABELS: Record<string, string> = {
  vendor_payment: "Pembayaran Vendor",
  purchase_invoice: "Faktur Pembelian",
  purchase_receipt: "Penerimaan Barang",
  customer_payment: "Penerimaan Customer",
};

function blockerMessage(result: TransactionDeleteResult) {
  const numbers = result.blocker_numbers.join(", ");
  if (result.blocker_stage && BLOCKER_LABELS[result.blocker_stage]) {
    return `Hapus ${BLOCKER_LABELS[result.blocker_stage]} ${numbers} terlebih dahulu.`;
  }
  if (result.blocker_stage === "closed_period") {
    return `Transaksi berada di periode fiskal tertutup (${numbers}) dan tidak dapat dihapus.`;
  }
  if (result.blocker_stage === "bank_reconciliation") {
    return `Mutasi kas/bank ${numbers} sudah direkonsiliasi dan tidak dapat dihapus.`;
  }
  if (result.blocker_stage === "stock_usage") {
    return `Stok dari transaksi ini sudah terpakai. Stok tidak cukup untuk menghapus: ${numbers}.`;
  }
  if (result.blocker_stage === "unsupported_sales_flow") {
    return `Transaksi ${numbers} berasal dari POS, marketplace, packing, retur, atau settlement dan tidak dapat dihapus dari flow accounting.`;
  }
  return result.blocker_stage
    ? `Transaksi tertahan pada tahap ${result.blocker_stage}${numbers ? `: ${numbers}` : ""}.`
    : null;
}

function revalidateTransactionPaths() {
  const paths = [
    "/pembelian/purchase-order",
    "/pembelian/penerimaan",
    "/pembelian/faktur",
    "/pembelian/pembayaran",
    "/penjualan/invoice",
    "/penjualan/penerimaan-kas",
    "/kas-bank/akun",
    "/kas-bank/mutasi",
    "/buku-besar/journal",
    "/inventory",
    "/pre-order",
    "/activity-log",
  ];
  for (const path of paths) revalidatePath(path);
}

async function runDelete(
  rpc: DeleteRpc,
  id: string,
): Promise<{ data?: TransactionDeleteResult; error?: string }> {
  await requireRole(["owner", "finance"]);
  const supabase = await createClient();
  const response = (() => {
    switch (rpc) {
      case "delete_vendor_payment_atomic":
        return supabase.rpc(rpc, { p_payment_id: id });
      case "delete_purchase_invoice_atomic":
        return supabase.rpc(rpc, { p_invoice_id: id });
      case "delete_purchase_receipt_atomic":
        return supabase.rpc(rpc, { p_receipt_id: id });
      case "delete_purchase_order_atomic":
        return supabase.rpc(rpc, { p_po_id: id });
      case "delete_customer_payment_atomic":
        return supabase.rpc(rpc, { p_payment_id: id });
      case "delete_sales_invoice_atomic":
        return supabase.rpc(rpc, { p_invoice_id: id });
    }
  })();
  const { data, error } = await response;

  if (error) return { error: error.message };
  if (!data || typeof data !== "object") {
    return { error: "Database tidak mengembalikan hasil penghapusan" };
  }

  const raw = data as {
    deleted?: boolean;
    reference_number?: string;
    blocker_stage?: string | null;
    blocker_numbers?: unknown;
  };
  const result: TransactionDeleteResult = {
    deleted: raw.deleted === true,
    reference_number: String(raw.reference_number ?? ""),
    blocker_stage: raw.blocker_stage ? String(raw.blocker_stage) : null,
    blocker_numbers: Array.isArray(raw.blocker_numbers)
      ? raw.blocker_numbers.map(String)
      : [],
    blocker_href: raw.blocker_stage
      ? (BLOCKER_ROUTES[String(raw.blocker_stage)] ?? null)
      : null,
    blocker_message: null,
  };
  result.blocker_message = blockerMessage(result);

  if (result.deleted) revalidateTransactionPaths();
  return { data: result };
}

export async function deleteVendorPaymentAtomic(id: string) {
  return runDelete("delete_vendor_payment_atomic", id);
}

export async function deletePurchaseInvoiceAtomic(id: string) {
  return runDelete("delete_purchase_invoice_atomic", id);
}

export async function deletePurchaseReceiptAtomic(id: string) {
  return runDelete("delete_purchase_receipt_atomic", id);
}

export async function deletePurchaseOrderAtomic(id: string) {
  return runDelete("delete_purchase_order_atomic", id);
}

export async function deleteCustomerPaymentAtomic(id: string) {
  return runDelete("delete_customer_payment_atomic", id);
}

export async function deleteSalesInvoiceAtomic(id: string) {
  return runDelete("delete_sales_invoice_atomic", id);
}
