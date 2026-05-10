import Link from "next/link";
import { createClient } from "@sneakervault/supabase/server";

const statusStyle: Record<string, string> = {
  packing: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  shipped: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  completed: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  has_return: "bg-red-500/10 text-red-400 border border-red-500/20",
  cancelled: "bg-white/5 text-white/30 border border-white/10",
};

const statusLabel: Record<string, string> = {
  packing: "Packing",
  shipped: "Dikirim",
  completed: "Selesai",
  has_return: "Retur",
  cancelled: "Batal",
};

export async function RecentOrdersTable() {
  const supabase = await createClient();

  const { data: sessions } = await supabase
    .from("packing_sessions")
    .select("id, platform, platform_order_id, status, courier, created_at, profiles:packed_by(full_name), packing_items(count)")
    .order("created_at", { ascending: false })
    .limit(8);

  if (!sessions || sessions.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
        <p className="text-sm text-white/30">Belum ada order</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <div className="px-6 py-4 border-b border-white/[0.04] flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white/80">Order Terbaru</p>
          <p className="text-[11px] text-white/30">Monitoring flow barang keluar</p>
        </div>
        <Link href="/orders" className="text-[11px] font-medium text-white/30 hover:text-white/60 transition-colors">
          Lihat semua →
        </Link>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/[0.04] text-[11px] uppercase tracking-wider text-white/30">
            <th className="px-6 py-3 text-left font-medium">Order</th>
            <th className="px-6 py-3 text-left font-medium">Platform</th>
            <th className="px-6 py-3 text-left font-medium">Packer</th>
            <th className="px-6 py-3 text-left font-medium">Item</th>
            <th className="px-6 py-3 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => {
            const profile = s.profiles as any;
            const itemCount = (s.packing_items as any)?.[0]?.count ?? 0;
            return (
              <tr key={s.id} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                <td className="px-6 py-3 text-[13px] text-white/70 font-medium">
                  {s.platform_order_id ? `#${s.platform_order_id}` : "—"}
                </td>
                <td className="px-6 py-3 text-[12px] text-white/50 capitalize">{s.platform ?? "—"}</td>
                <td className="px-6 py-3 text-[12px] text-white/40">{profile?.full_name ?? "—"}</td>
                <td className="px-6 py-3 text-[12px] text-white/40">{itemCount} pcs</td>
                <td className="px-6 py-3 text-right">
                  <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${statusStyle[s.status] ?? statusStyle.cancelled}`}>
                    {statusLabel[s.status] ?? s.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
