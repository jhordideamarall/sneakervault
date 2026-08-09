"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@sneakervault/supabase/server";
import { receivePurchaseOrderSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { deletePurchaseReceiptAtomic } from "./transaction-deletes";

type AtomicReceiveResult = {
  success: boolean;
  receipt_id: string;
  receipt_number: string;
  new_status: string;
  received_lines: number;
  total_qty: number;
  auto_invoice_id: string | null;
  auto_payment_id: string | null;
  auto_payment_amount: number;
};

function revalidateReceivingPaths() {
  const paths = [
    "/pembelian/purchase-order",
    "/pembelian/penerimaan",
    "/pembelian/faktur",
    "/pembelian/pembayaran",
    "/kas-bank/mutasi",
    "/kas-bank/akun",
    "/buku-besar/journal",
    "/inventory",
  ];
  for (const path of paths) revalidatePath(path);
}

export async function receivePurchaseOrder(input: unknown) {
  await requireRole(["owner", "admin_gudang", "finance"]);
  const parsed = receivePurchaseOrderSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { data, error } = await (supabase as any).rpc(
    "receive_purchase_order_with_advance_atomic",
    {
      p_payload: {
        po_id: parsed.data.po_id,
        notes: parsed.data.notes ?? null,
        lines: parsed.data.lines.map((line) => ({
          line_id: line.line_id,
          receive_qty: line.receive_qty,
        })),
      },
    },
  );

  if (error) return { error: { _form: [error.message] } };
  const result = data as AtomicReceiveResult;
  revalidateReceivingPaths();
  return result;
}

export async function deletePurchaseReceipt(id: string) {
  return deletePurchaseReceiptAtomic(id);
}
