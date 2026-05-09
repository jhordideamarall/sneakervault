import { getActivityLogs } from "@/lib/queries";
import { Card } from "@sneakervault/ui";

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
  deactivate: "Nonaktifkan",
};

const actionColors: Record<string, string> = {
  scan_in: "bg-blue-500",
  scan_out: "bg-indigo-500",
  status_change: "bg-amber-500",
  update: "bg-gray-400",
  approve_delete: "bg-emerald-500",
  reject_delete: "bg-red-400",
  delete_request: "bg-red-500",
  create: "bg-emerald-500",
  cancel_session: "bg-red-400",
  remove_item: "bg-orange-400",
  finalize_session: "bg-blue-400",
  initiate_return: "bg-purple-500",
  verify_return: "bg-cyan-500",
  process_return: "bg-emerald-500",
};

const entityLabels: Record<string, string> = {
  product: "Produk",
  packing_session: "Sesi Packing",
  packing_item: "Item Packing",
  return: "Retur",
  supplier: "Supplier",
  delete_request: "Request Hapus",
};

export default async function ActivityLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const page = Number(sp.page ?? 1);
  const { data: logs, total } = await getActivityLogs({ action: sp.action, page, limit: 50 });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Activity Log</h1>
        <p className="mt-1 text-sm text-gray-500">Riwayat semua aktivitas di sistem — {total} kejadian tercatat</p>
      </div>

      {/* Filter */}
      <Card className="!p-4">
        <form className="flex items-center gap-3">
          <select name="action" defaultValue={sp.action ?? ""} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-gray-300 focus:outline-none">
            <option value="">Semua aksi</option>
            <option value="scan_in">Scan Masuk</option>
            <option value="scan_out">Scan Keluar</option>
            <option value="status_change">Perubahan Status</option>
            <option value="create">Buat Baru</option>
            <option value="cancel_session">Batalkan Sesi</option>
            <option value="initiate_return">Ajukan Retur</option>
            <option value="approve_delete">Approve Delete</option>
          </select>
          <button type="submit" className="rounded-xl bg-[#16162a] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1e1e3a] transition-colors">
            Filter
          </button>
        </form>
      </Card>

      {/* Timeline */}
      <div className="space-y-3">
        {(logs as Record<string, unknown>[]).map((l) => {
          const action = l.action as string;
          const profile = l.profiles as { full_name: string } | null;
          const userName = profile?.full_name ?? "System";
          const entity = l.entity_type as string;
          const time = new Date(l.created_at as string);

          return (
            <Card key={l.id as string} className="!p-5 hover:shadow-md transition-shadow duration-200">
              <div className="flex items-start gap-4">
                {/* Dot */}
                <div className={`mt-1 h-3 w-3 flex-shrink-0 rounded-full ${actionColors[action] ?? "bg-gray-400"}`} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{userName}</span>
                    <span className="text-gray-500">—</span>
                    <span className="text-gray-700">{actionLabels[action] ?? action}</span>
                    <span className="rounded-lg bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {entityLabels[entity] ?? entity}
                    </span>
                  </div>

                  {/* Detail - human readable */}
                  <DetailSummary action={action} oldData={l.old_data} newData={l.new_data} />
                </div>

                {/* Time */}
                <div className="flex-shrink-0 text-right">
                  <p className="text-xs font-medium text-gray-500">{time.toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</p>
                  <p className="text-xs text-gray-400">{time.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
              </div>
            </Card>
          );
        })}

        {logs.length === 0 && (
          <Card className="!py-16 text-center">
            <p className="text-gray-400 text-lg">Belum ada aktivitas tercatat</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function DetailSummary({ action, oldData, newData }: { action: string; oldData: unknown; newData: unknown }) {
  const old = oldData as Record<string, unknown> | null;
  const nw = newData as Record<string, unknown> | null;

  if (!old && !nw) return null;

  // Status change — show from → to
  if (action === "status_change" && old?.status && nw?.status) {
    return (
      <p className="mt-1 text-sm text-gray-500">
        Status: <span className="font-medium text-red-500">{String(old.status)}</span>
        {" → "}
        <span className="font-medium text-emerald-600">{String(nw.status)}</span>
      </p>
    );
  }

  // Scan in/out — show quantity and product info
  if ((action === "scan_in" || action === "scan_out") && nw) {
    const qty = nw.quantity ? `${nw.quantity} pcs` : "";
    const cost = nw.unit_cost ? `@ Rp ${Number(nw.unit_cost).toLocaleString("id-ID")}` : "";
    return qty ? <p className="mt-1 text-sm text-gray-500">{qty} {cost}</p> : null;
  }

  // Create — show what was created
  if (action === "create" && nw) {
    const name = nw.name ?? nw.brand ?? nw.platform ?? "";
    return name ? <p className="mt-1 text-sm text-gray-500">{String(name)}</p> : null;
  }

  // Generic — show key changes
  if (nw && Object.keys(nw).length > 0) {
    const summary = Object.entries(nw).slice(0, 3).map(([k, v]) => `${k}: ${String(v)}`).join(", ");
    return <p className="mt-1 text-sm text-gray-400 truncate">{summary}</p>;
  }

  return null;
}
