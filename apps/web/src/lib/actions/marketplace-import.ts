"use server";

import { createClient } from "@sneakervault/supabase/server";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { revalidatePath } from "next/cache";
import { journalForSalesInvoice } from "../journal-engine";

const ROLES = ["owner", "finance", "admin_online"] as const;

export type MarketplaceOrderLine = {
  sku: string;
  qty: number;
  unit_price: number;
  product_name: string;
};

export type MarketplaceOrder = {
  order_id: string;
  customer_name: string;
  order_date: string;
  channel: "shopee" | "tiktok";
  lines: MarketplaceOrderLine[];
  shipping_fee: number;
  discount: number;
  admin_fee: number;
  notes?: string;
};

export async function bulkImportMarketplaceOrders(orders: MarketplaceOrder[]) {
  const profile = await requireRole([...ROLES]);
  const supabase = await createClient();

  const results = {
    success: 0,
    skipped: 0,
    errors: [] as { order_id: string; reason: string }[],
  };

  for (const order of orders) {
    try {
      // 1. Check if order already exists to prevent double import
      const { data: existing } = await supabase
        .from("sales_invoices")
        .select("id")
        .eq("marketplace_order_id", order.order_id)
        .maybeSingle();

      if (existing) {
        results.skipped++;
        continue;
      }

      // 2. Resolve products by SKU
      const skus = order.lines.map((l) => l.sku);
      const { data: products } = await supabase
        .from("products")
        .select("id, sku, hpp, brand, model, color, size, quantity")
        .in("sku", skus);

      if (!products || products.length === 0) {
        results.errors.push({
          order_id: order.order_id,
          reason: "SKU tidak ditemukan di database",
        });
        continue;
      }

      // Map lines to products
      const validLines = [];
      let cogsTotal = 0;
      let orderSubtotal = 0;
      let stockIssue = false;

      for (const line of order.lines) {
        const prod = products.find((p) => p.sku === line.sku);
        if (!prod) {
          results.errors.push({
            order_id: order.order_id,
            reason: `SKU ${line.sku} tidak ditemukan`,
          });
          stockIssue = true;
          break;
        }

        // Check stock
        if (Number(prod.quantity) < line.qty) {
          results.errors.push({
            order_id: order.order_id,
            reason: `Stok ${prod.sku} tidak cukup (${prod.quantity} < ${line.qty})`,
          });
          stockIssue = true;
          break;
        }

        validLines.push({
          product_id: prod.id,
          product_label: `${prod.brand} ${prod.model} ${prod.color} • Size ${Number(prod.size)} • ${prod.sku}`,
          qty: line.qty,
          unit_price: line.unit_price,
          unit_cost: Number(prod.hpp),
          subtotal: line.qty * line.unit_price,
        });

        cogsTotal += Number(prod.hpp) * line.qty;
        orderSubtotal += line.qty * line.unit_price;
      }

      if (stockIssue) continue;

      // 3. Compute totals (total is net payout to AR)
      const total = orderSubtotal - order.discount + order.shipping_fee - order.admin_fee;

      // 4. Generate Invoice Number
      const { data: invNum } = await supabase.rpc("generate_sales_invoice_number");

      // 5. Insert Invoice (Status: Issued)
      const { data: invoice, error: invErr } = await supabase
        .from("sales_invoices")
        .insert({
          invoice_number: invNum,
          customer_name: order.customer_name,
          channel: order.channel,
          invoice_date: order.order_date,
          subtotal: orderSubtotal,
          discount: order.discount,
          shipping: order.shipping_fee,
          marketplace_fee: order.admin_fee,
          total,
          status: "issued",
          marketplace_order_id: order.order_id,
          notes: order.notes || `Import dari Excel ${order.channel.toUpperCase()}`,
          created_by: profile.id,
        })
        .select()
        .single();

      if (invErr) {
        results.errors.push({ order_id: order.order_id, reason: invErr.message });
        continue;
      }

      // 6. Insert Lines
      const { error: linesErr } = await supabase
        .from("sales_invoice_lines")
        .insert(validLines.map(l => ({ ...l, invoice_id: invoice.id })));

      if (linesErr) {
        await supabase.from("sales_invoices").delete().eq("id", invoice.id);
        results.errors.push({ order_id: order.order_id, reason: linesErr.message });
        continue;
      }

      // 7. Stock decrement & Auto-Journal
      for (const line of validLines) {
        await supabase.rpc("decrement_product_quantity", {
          p_id: line.product_id,
          qty: line.qty,
        });

        await supabase.from("stock_movements").insert({
          product_id: line.product_id,
          type: "outbound",
          quantity: line.qty,
          unit_cost: line.unit_cost,
          reference_type: "sales_invoice_line",
          reference_id: invoice.id,
          performed_by: profile.id,
        });
      }

      await journalForSalesInvoice({
        invoice_id: invoice.id,
        invoice_number: invNum as string,
        invoice_date: order.order_date,
        channel: order.channel,
        total,
        subtotal: orderSubtotal,
        discount: order.discount,
        shipping: order.shipping_fee,
        marketplace_fee: order.admin_fee,
        tax: 0,
        cogs_total: cogsTotal,
        user_id: profile.id,
      });

      results.success++;
    } catch (err) {
      results.errors.push({
        order_id: order.order_id,
        reason: err instanceof Error ? err.message : "Terjadi kesalahan internal",
      });
    }
  }

  if (results.success > 0) {
    await logActivity({
      user_id: profile.id,
      action: "bulk_import",
      entity_type: "sales_invoice",
      new_data: { count: results.success, platform: orders[0]?.channel },
    });

    revalidatePath("/penjualan/invoice");
    revalidatePath("/inventory");
    revalidatePath("/buku-besar/journal");
    revalidatePath("/laporan-keuangan");
  }

  return results;
}
