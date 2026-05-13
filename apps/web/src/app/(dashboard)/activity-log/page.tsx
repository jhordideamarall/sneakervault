import { getActivityLogs } from "@/lib/queries";
import { Card, Badge } from "@sneakervault/ui";
import {
  nowWIB,
  wibStartOfDay,
  wibEndOfDay,
  wibStartOfMonth,
  wibEndOfMonth,
} from "@/lib/timezone";
import { 
  ScrollText, 
  Search, 
  Filter, 
  Calendar as CalendarIcon, 
  User, 
  Clock, 
  Activity, 
  ChevronRight,
  Info
} from "lucide-react";

export const dynamic = "force-dynamic";

const actionLabels: Record<string, string> = {
  scan_in: "Scan Barang Masuk",
  scan_out: "Scan Barang Keluar",
  status_change: "Ubah Status",
  update: "Update Data",
  approve_delete: "Approve Hapus",
  reject_delete: "Tolak Hapus",
  delete_request: "Request Hapus",
  create: "Buat Baru",
  login: "Login",
  cancel_session: "Batalkan Sesi",
  remove_item: "Hapus Item",
  finalize_session: "Selesai Packing",
  initiate_return: "Ajukan Retur",
  verify_return: "Verifikasi Retur",
  process_return: "Proses Retur",
  return_initiated: "Return Diinisiasi",
  return_verified: "Return Diverifikasi",
  receive_stock: "Terima Stok",
  create_purchase_invoice: "Buat Faktur Pembelian",
  pay_vendor: "Bayar Vendor",
  create_sales_invoice: "Buat Invoice Penjualan",
  receive_customer_payment: "Terima Pembayaran Customer",
  notification_sent: "Kirim Notifikasi",
  review_dashboard: "Review Dashboard",
  demo_seed_started: "Seed Demo Dimulai",
  demo_seed_completed: "Seed Demo Selesai",
  deactivate: "Nonaktifkan",
  bulk_import: "Import Massal",
};

const actionColors: Record<string, string> = {
  scan_in: "bg-blue-500",
  scan_out: "bg-indigo-500",
  status_change: "bg-amber-500",
  update: "bg-white/20",
  approve_delete: "bg-emerald-500",
  reject_delete: "bg-red-400",
  delete_request: "bg-red-500",
  create: "bg-emerald-500",
  bulk_import: "bg-violet-500",
  cancel_session: "bg-red-400",
  remove_item: "bg-orange-400",
  finalize_session: "bg-blue-400",
  receive_stock: "bg-blue-500",
  pay_vendor: "bg-red-500",
  notification_sent: "bg-sky-500/30",
};

const entityLabels: Record<string, string> = {
  product: "Produk",
  packing_session: "Sesi Packing",
  packing_item: "Item Packing",
  return: "Retur",
  supplier: "Supplier",
  delete_request: "Request Hapus",
  sales_invoice: "Invoice Penjualan",
  purchase_invoice: "Faktur Pembelian",
  customer_payment: "Pembayaran Customer",
  vendor_payment: "Pembayaran Vendor",
  purchase_order: "Purchase Order",
  journal_entry: "Jurnal",
  internal_message: "Pesan Internal",
  bank_account: "Akun Bank",
};

export default async function ActivityLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const page = Number(sp.page ?? 1);

  // Compute WIB-aware range from calendar filter.
  let from: string | undefined;
  let to: string | undefined;
  let periodLabel: string;

  if (sp.date) {
    from = wibStartOfDay(sp.date);
    to = wibEndOfDay(sp.date);
    const [y, m, d] = sp.date.split("-").map(Number);
    periodLabel = new Date(Date.UTC(y!, m! - 1, d!))
      .toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  } else if (sp.month) {
    const [y, m] = sp.month.split("-").map(Number);
    from = wibStartOfMonth(y!, m! - 1);
    to = wibEndOfMonth(y!, m! - 1);
    periodLabel = new Date(Date.UTC(y!, m! - 1, 1))
      .toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });
  } else {
    const n = nowWIB();
    from = wibStartOfMonth(n.getUTCFullYear(), n.getUTCMonth());
    to = wibEndOfMonth(n.getUTCFullYear(), n.getUTCMonth());
    periodLabel = "Bulan ini";
  }

  const { data: logs, total } = await getActivityLogs({
    action: sp.action,
    page,
    limit: 50,
    from,
    to,
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
          <ScrollText className="text-white/40" size={28} />
          Activity Log
        </h1>
        <p className="text-white/50 text-sm">
          {periodLabel} — {total} kejadian tercatat dalam sistem.
        </p>
      </div>

      {/* Filter */}
      <Card className="border-white/[0.06] bg-[#262626] p-4">
        <form className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex flex-1 gap-2">
             <div className="relative flex-1">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                <select 
                  name="action" 
                  defaultValue={sp.action ?? ""} 
                  className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 appearance-none"
                >
                  <option value="">Semua aksi</option>
                  <option value="scan_in">Scan Masuk</option>
                  <option value="scan_out">Scan Keluar</option>
                  <option value="bulk_import">Import Marketplace</option>
                  <option value="status_change">Perubahan Status</option>
                  <option value="create">Buat Baru</option>
                  <option value="approve_delete">Approve Hapus</option>
                  <option value="reconcile">Rekonsiliasi Bank</option>
                </select>
             </div>
             <div className="relative w-48">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                <input 
                  type="date" 
                  name="date"
                  defaultValue={sp.date ?? ""}
                  className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20"
                />
             </div>
          </div>
          <button type="submit" className="rounded-xl bg-white px-6 py-2.5 text-sm font-semibold text-black hover:bg-white/90 transition-all active:scale-95">
            Terapkan Filter
          </button>
        </form>
      </Card>

      {/* Timeline */}
      <div className="space-y-4">
        {(logs as Record<string, unknown>[]).map((l) => {
          const action = l.action as string;
          const profile = l.profiles as { full_name: string } | null;
          const userName = profile?.full_name ?? "System";
          const entity = l.entity_type as string;
          const time = new Date(l.created_at as string);

          return (
            <div key={l.id as string} className="group relative flex gap-4">
              {/* Vertical line */}
              <div className="absolute left-[17px] top-10 bottom-0 w-px bg-white/[0.06] group-last:hidden" />
              
              {/* Dot Icon */}
              <div className={`z-10 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-[#1F1F1E] shadow-xl`}>
                 <div className={`h-2 w-2 rounded-full ${actionColors[action] ?? "bg-white/20"}`} />
              </div>

              {/* Content Card */}
              <Card className="flex-1 border-white/[0.06] bg-[#262626] p-4 transition-all hover:border-white/10 hover:bg-[#2a2a2a]">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white/90 flex items-center gap-1.5">
                        <User size={12} className="text-white/30" />
                        {userName}
                      </span>
                      <ChevronRight size={12} className="text-white/10" />
                      <span className="text-sm font-medium text-white/70">
                        {actionLabels[action] ?? action}
                      </span>
                      <Badge tone="neutral" className="bg-white/5 border-white/5 uppercase text-[9px] font-bold tracking-tight">
                        {entityLabels[entity] ?? entity}
                      </Badge>
                    </div>

                    <DetailSummary action={action} oldData={l.old_data} newData={l.new_data} />
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-3 text-right">
                    <div className="flex flex-col items-end">
                       <div className="text-[11px] font-bold text-white/60">
                          {time.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                       </div>
                       <div className="text-[10px] text-white/30 font-medium">
                          {time.toLocaleDateString("id-ID", { day: '2-digit', month: 'short' })}
                       </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          );
        })}

        {logs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 opacity-20">
            <Activity size={64} />
            <p className="mt-4 text-lg font-medium">Belum ada aktivitas tercatat</p>
          </div>
        )}
      </div>
      
      {/* Pagination info could go here if total > 50 */}
    </div>
  );
}

function DetailSummary({ action, oldData, newData }: { action: string; oldData: unknown; newData: unknown }) {
  const old = oldData as Record<string, unknown> | null;
  const nw = newData as Record<string, unknown> | null;

  if (!old && !nw) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-white/40">
       <Info size={12} strokeWidth={2.5} />
       {(() => {
          // Status change
          if (action === "status_change" && old?.status && nw?.status) {
            return (
              <span>
                Status: <span className="text-red-400 font-mono">{String(old.status)}</span>
                {" → "}
                <span className="text-emerald-400 font-mono">{String(nw.status)}</span>
              </span>
            );
          }

          // Scan in/out
          if ((action === "scan_in" || action === "scan_out") && nw) {
            const qty = nw.quantity ? `${nw.quantity} pcs` : "";
            const cost = nw.unit_cost ? `@ Rp ${Number(nw.unit_cost).toLocaleString("id-ID")}` : "";
            return <span>{qty} {cost}</span>;
          }

          // Bulk Import
          if (action === "bulk_import" && nw) {
             return <span>Berhasil import {String(nw.count)} order dari {String(nw.platform).toUpperCase()}</span>;
          }

          // Create
          if (action === "create" && nw) {
            const name = nw.name ?? nw.brand ?? nw.platform ?? nw.invoice_number ?? nw.payment_number ?? "";
            return <span>{String(name)}</span>;
          }

          // Generic
          if (nw && Object.keys(nw).length > 0) {
            const summary = Object.entries(nw).slice(0, 3).map(([k, v]) => `${k}: ${String(v)}`).join(", ");
            return <span className="truncate max-w-md">{summary}</span>;
          }

          return null;
       })()}
    </div>
  );
}
