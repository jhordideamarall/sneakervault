import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth";
import { getActivityLogActors, getActivityLogs } from "@/lib/queries";
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
  Filter, 
  Calendar as CalendarIcon, 
  User, 
  Activity, 
  ChevronRight,
  ChevronLeft,
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
  create_and_issue: "Buat & Terbitkan",
  approve: "Setujui",
  receive: "Terima Barang",
  hard_delete: "Hapus Permanen",
  reactivate: "Aktifkan Kembali",
  login: "Login",
  cancel_session: "Batalkan Sesi",
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
  create_manual_journal: "Buat Jurnal Manual",
  update_manual_journal: "Perbarui Jurnal Manual",
  remove_item: "Hapus Item Packing",
  finalize_session: "Selesaikan Packing",
  initiate_return: "Ajukan Retur",
  verify_return: "Verifikasi Retur",
  process_return: "Proses Retur",
  pay: "Bayar",
  void: "Batalkan",
  transfer: "Transfer Dana",
  settlement: "Settlement Marketplace",
  settle_liability: "Lunasi Hutang",
  reconcile: "Rekonsiliasi",
  start: "Mulai",
  count: "Catat Hasil Hitung",
  pos_checkout: "Checkout POS",
  recognize_inventory: "Akui Persediaan",
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
  create_and_issue: "bg-emerald-500",
  approve: "bg-sky-500",
  receive: "bg-blue-500",
  hard_delete: "bg-red-500",
  reactivate: "bg-emerald-500",
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
  purchase_order: "Pembelian Barang",
  journal_entry: "Jurnal",
  internal_message: "Pesan Internal",
  bank_account: "Akun Bank",
  bank_transaction: "Mutasi Bank",
  marketplace_order: "Pesanan Marketplace",
  expense: "Beban",
  employee: "Karyawan",
  payroll_run: "Penggajian",
  feedback_report: "Laporan UAT",
  user: "User",
  transaction_deletion: "Penghapusan Transaksi",
  purchase_receipt: "Penerimaan Barang",
  chart_of_account: "Akun Buku Besar",
  stock_opname: "Stok Opname",
};

const detailFieldLabels: Record<string, string> = {
  amount: "Nominal",
  balance_after: "Saldo akhir",
  count: "Jumlah",
  entry_date: "Tanggal jurnal",
  invoice_number: "Nomor invoice",
  items_count: "Jumlah item",
  notes: "Catatan",
  payment_number: "Nomor pembayaran",
  platform: "Platform",
  quantity: "Qty",
  status: "Status",
};

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return `${value.length} item`;
  if (typeof value === "object") return "Detail tersimpan";
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (typeof value === "number") return value.toLocaleString("id-ID");
  return String(value);
}

export default async function ActivityLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const profile = await getCurrentUser();
  if (!profile?.roles?.includes("owner")) redirect("/workspace");

  const sp = await searchParams;
  const requestedPage = Number(sp.page ?? 1);
  const page = Number.isFinite(requestedPage) && requestedPage > 0
    ? Math.floor(requestedPage)
    : 1;

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

  const [{ data: logs, total }, actors] = await Promise.all([
    getActivityLogs({
      user_id: sp.user_id,
      action: sp.action,
      page,
      limit: 50,
      from,
      to,
    }),
    getActivityLogActors(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / 50));

  const pageHref = (nextPage: number) => {
    const params = new URLSearchParams();
    if (sp.action) params.set("action", sp.action);
    if (sp.user_id) params.set("user_id", sp.user_id);
    if (sp.date) params.set("date", sp.date);
    if (sp.month) params.set("month", sp.month);
    params.set("page", String(nextPage));
    return `/activity-log?${params.toString()}`;
  };

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
          <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
             <div className="relative flex-1">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                <select 
                  name="action" 
                  defaultValue={sp.action ?? ""} 
                  className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 appearance-none"
                >
                  <option value="">Semua aksi</option>
                  {Object.entries(actionLabels)
                    .sort(([, a], [, b]) => a.localeCompare(b, "id"))
                    .map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                </select>
             </div>
             <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                <select
                  name="user_id"
                  defaultValue={sp.user_id ?? ""}
                  className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 appearance-none"
                >
                  <option value="">Semua operator</option>
                  {actors.map((actor) => (
                    <option key={actor.id} value={actor.id}>
                      {actor.full_name || actor.email || "Tanpa nama"}
                    </option>
                  ))}
                </select>
             </div>
             <div className="relative">
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
                          {time.toLocaleTimeString("id-ID", {
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "Asia/Jakarta",
                          })}
                       </div>
                       <div className="text-[10px] text-white/30 font-medium">
                          {time.toLocaleDateString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            timeZone: "Asia/Jakarta",
                          })}
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

      {totalPages > 1 && (
        <nav className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-[#262626] px-4 py-3" aria-label="Halaman activity log">
          <p className="text-xs text-white/50">
            Halaman {Math.min(page, totalPages)} dari {totalPages} · {total} aktivitas
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/5">
                <ChevronLeft size={14} /> Sebelumnya
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/5">
                Berikutnya <ChevronRight size={14} />
              </Link>
            ) : null}
          </div>
        </nav>
      )}
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

          if (
            (action === "create_manual_journal" || action === "update_manual_journal")
            && nw
          ) {
            const lineCount = Array.isArray(nw.lines) ? nw.lines.length : 0;
            return (
              <span>
                {lineCount} baris jurnal
                {nw.entry_date ? ` · Tanggal ${String(nw.entry_date)}` : ""}
                {nw.notes ? ` · ${String(nw.notes)}` : ""}
              </span>
            );
          }

          // Create
          if (action === "create" && nw) {
            const name = nw.name ?? nw.brand ?? nw.platform ?? nw.invoice_number ?? nw.payment_number ?? "";
            return <span>{String(name)}</span>;
          }

          // Generic
          if (nw && Object.keys(nw).length > 0) {
            const summary = Object.entries(nw)
              .slice(0, 3)
              .map(([key, value]) => (
                `${detailFieldLabels[key] ?? key.replaceAll("_", " ")}: ${formatDetailValue(value)}`
              ))
              .join(" · ");
            return <span className="truncate max-w-md">{summary}</span>;
          }

          return null;
       })()}
    </div>
  );
}
