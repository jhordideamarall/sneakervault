import { createClient } from "@sneakervault/supabase/server";
import type { Role } from "@sneakervault/shared";

/**
 * Activity signals for sidebar menu items — a coloured dot ("ada sesuatu di
 * sini") that guides users to what needs attention without opening each page.
 * Keyed by route href. `urgent` → red dot (perlu tindakan), else amber dot
 * (perlu dipantau). Counts are lean count-head queries, gated by role so we
 * only query what the role can act on. Re-runs live via the dashboard layout
 * whenever `useRealtimeRefresh` fires router.refresh().
 */
export type SidebarSignals = Record<string, { urgent: boolean }>;

export async function getSidebarSignals(roles: Role[]): Promise<SidebarSignals> {
  const has = (...r: Role[]) => r.some((x) => roles.includes(x));
  const supabase = await createClient();
  const out: SidebarSignals = {};

  const jobs: Array<Promise<void>> = [];
  const mark = (href: string, urgent: boolean, count: number | null) => {
    if ((count ?? 0) > 0) out[href] = { urgent };
  };
  const headCount = (build: () => PromiseLike<{ count: number | null }>) =>
    Promise.resolve(build()).then((r) => r.count);

  // ── Gudang ────────────────────────────────────────────────────────────
  if (has("owner", "admin_gudang", "admin_online")) {
    jobs.push(
      headCount(() =>
        supabase.from("returns").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ).then((c) => mark("/returns", true, c)),
    );
  }
  if (has("owner", "admin_gudang")) {
    jobs.push(
      headCount(() =>
        supabase.from("products").select("id", { count: "exact", head: true })
          .eq("is_active", true).gt("quantity", 0).lt("quantity", 3),
      ).then((c) => mark("/inventory", false, c)),
    );
    jobs.push(
      headCount(() =>
        supabase.from("stock_opname_sessions").select("id", { count: "exact", head: true }).eq("status", "review"),
      ).then((c) => mark("/inventory/opname", false, c)),
    );
  }

  // ── Penjualan ─────────────────────────────────────────────────────────
  if (has("owner", "admin_online", "shopkeeper")) {
    jobs.push(
      headCount(() =>
        supabase.from("packing_sessions").select("id", { count: "exact", head: true }).eq("status", "packing"),
      ).then((c) => mark("/orders", true, c)),
    );
  }
  if (has("owner", "finance", "admin_online")) {
    jobs.push(
      headCount(() =>
        supabase.from("sales_invoices").select("id", { count: "exact", head: true }).in("status", ["issued", "partial"]),
      ).then((c) => mark("/penjualan/invoice", false, c)),
    );
  }
  if (has("owner", "finance")) {
    jobs.push(
      headCount(() =>
        supabase.from("sales_invoices").select("id", { count: "exact", head: true }).eq("settlement_status", "pending"),
      ).then((c) => mark("/penjualan/settlement", false, c)),
    );
  }

  // ── Pembelian ─────────────────────────────────────────────────────────
  if (has("owner", "finance")) {
    jobs.push(
      headCount(() =>
        supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("status", "draft"),
      ).then((c) => mark("/pembelian/purchase-order", true, c)),
    );
    jobs.push(
      headCount(() =>
        supabase.from("purchase_invoices").select("id", { count: "exact", head: true }).in("status", ["unpaid", "partial"]),
      ).then((c) => mark("/pembelian/faktur", false, c)),
    );
  }
  if (has("owner", "finance", "admin_gudang")) {
    jobs.push(
      headCount(() =>
        supabase.from("purchase_orders").select("id", { count: "exact", head: true }).in("status", ["approved", "receiving"]),
      ).then((c) => mark("/pembelian/penerimaan", false, c)),
    );
  }

  // ── Kas & Bank ────────────────────────────────────────────────────────
  if (has("owner", "finance")) {
    jobs.push(
      headCount(() =>
        supabase.from("bank_transactions").select("id", { count: "exact", head: true }).eq("is_reconciled", false),
      ).then((c) => mark("/kas-bank/rekonsiliasi", false, c)),
    );
  }

  // ── Audit ─────────────────────────────────────────────────────────────
  if (has("owner")) {
    jobs.push(
      headCount(() =>
        supabase.from("delete_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ).then((c) => mark("/delete-requests", true, c)),
    );
  }

  await Promise.all(jobs);
  return out;
}
