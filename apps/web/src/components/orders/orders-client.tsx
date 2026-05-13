"use client";

import { useState, useTransition } from "react";
import { updateSessionStatus } from "@/lib/actions/status";
import { Badge, Button, Select, Card } from "@sneakervault/ui";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { 
  ShoppingCart, 
  Search, 
  Truck, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Calendar,
  User,
  Hash,
  Package,
  ArrowRight
} from "lucide-react";

type Session = Record<string, unknown> & {
  id: string;
  status: string;
  platform: string;
  courier: string;
  platform_order_id: string | null;
  created_at: string;
  profiles?: { full_name: string } | null;
};

const statusTones: Record<string, "warning" | "info" | "success" | "danger" | "neutral"> = {
  packing: "warning",
  shipped: "info",
  completed: "success",
  has_return: "danger",
  cancelled: "neutral",
};

const statusLabel: Record<string, string> = {
  packing: "Packing",
  shipped: "Dikirim",
  completed: "Selesai",
  has_return: "Retur",
  cancelled: "Batal",
};

export function OrdersClient({
  sessions,
  roles,
}: {
  sessions: Session[];
  roles: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  // Live refresh on session status changes
  useLiveRefresh(["packing_sessions"]);

  const canShip = roles.includes("owner") || roles.includes("shopkeeper");
  const canComplete = roles.includes("owner") || roles.includes("admin_online");

  const filtered = sessions.filter((s) => {
    const matchStatus = filter ? s.status === filter : true;
    const matchSearch = search 
      ? (s.platform_order_id?.toLowerCase().includes(search.toLowerCase()) || 
         s.platform.toLowerCase().includes(search.toLowerCase()))
      : true;
    return matchStatus && matchSearch;
  });

  function handleTransition(id: string, status: "shipped" | "completed" | "has_return") {
    startTransition(async () => {
      const result = await updateSessionStatus({ session_id: id, status });
      if ("error" in result && result.error) {
        const msg = (result.error as { _form?: string[] })._form?.[0] ?? "Gagal update status";
        toast.push(msg, "error");
        return;
      }
      toast.push(`Status diubah ke ${statusLabel[status]}`, "success");
      router.refresh();
    });
  }

  // Stats
  const stats = {
    total: sessions.length,
    packing: sessions.filter(s => s.status === 'packing').length,
    shipped: sessions.filter(s => s.status === 'shipped').length,
    completed: sessions.filter(s => s.status === 'completed').length,
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
          <ShoppingCart className="text-white/40" size={28} />
          Order Masuk
        </h1>
        <p className="text-white/50">
          Kelola alur pengiriman barang dari packing sampai selesai.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Order" value={stats.total} icon={<ShoppingCart size={16} />} />
        <StatCard label="Dalam Packing" value={stats.packing} tone="warning" icon={<Package size={16} />} />
        <StatCard label="Dalam Pengiriman" value={stats.shipped} tone="info" icon={<Truck size={16} />} />
        <StatCard label="Selesai" value={stats.completed} tone="emerald" icon={<CheckCircle2 size={16} />} />
      </div>

      <Card className="border-white/[0.06] bg-[#262626] p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
            <input
              type="text"
              placeholder="Cari ID Pesanan atau Platform..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-white/20"
            />
          </div>
          <div className="w-full md:w-48">
            <select 
              value={filter} 
              onChange={(e) => setFilter(e.target.value)}
              className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] py-2.5 px-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 appearance-none"
            >
              <option value="">Semua status</option>
              <option value="packing">Packing</option>
              <option value="shipped">Dikirim</option>
              <option value="completed">Selesai</option>
              <option value="has_return">Retur</option>
              <option value="cancelled">Batal</option>
            </select>
          </div>
        </div>
      </Card>

      <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#262626]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02] text-[11px] uppercase tracking-wider text-white/40">
                <th className="px-4 py-3 font-medium">Order ID</th>
                <th className="px-4 py-3 font-medium">Platform / Kurir</th>
                <th className="px-4 py-3 font-medium">Petugas</th>
                <th className="px-4 py-3 font-medium text-center">Status</th>
                <th className="px-4 py-3 font-medium">Tanggal</th>
                <th className="px-4 py-3 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-4 font-mono text-xs font-semibold text-white/90">
                    <div className="flex items-center gap-2">
                      <Hash size={12} className="text-white/20" />
                      {s.platform_order_id ?? "N/A"}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col">
                      <span className="font-medium text-white capitalize">{s.platform}</span>
                      <span className="text-[10px] text-white/40 uppercase tracking-tight">{s.courier}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 text-white/70">
                      <User size={12} className="text-white/30" />
                      {s.profiles?.full_name ?? "System"}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <Badge tone={statusTones[s.status] ?? "default"} className="min-w-[80px] justify-center capitalize">
                      {statusLabel[s.status] ?? s.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-4 text-white/50">
                    <div className="flex items-center gap-2">
                      <Calendar size={12} />
                      {new Date(s.created_at).toLocaleDateString("id-ID", { day: '2-digit', month: 'short' })}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {s.status === "packing" && canShip && (
                        <Button 
                          size="sm" 
                          variant="secondary" 
                          className="h-8 text-[11px]" 
                          onClick={() => handleTransition(s.id, "shipped")} 
                          disabled={pending}
                        >
                          <Truck size={12} className="mr-1.5" />
                          Siap Kirim
                        </Button>
                      )}
                      {s.status === "shipped" && canComplete && (
                        <>
                          <Button 
                            size="sm" 
                            variant="success" 
                            className="h-8 text-[11px]" 
                            onClick={() => handleTransition(s.id, "completed")} 
                            disabled={pending}
                          >
                            <CheckCircle2 size={12} className="mr-1.5" />
                            Selesai
                          </Button>
                          <Button 
                            size="sm" 
                            variant="danger" 
                            className="h-8 text-[11px]" 
                            onClick={() => handleTransition(s.id, "has_return")} 
                            disabled={pending}
                          >
                            <AlertTriangle size={12} className="mr-1.5" />
                            Retur
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 opacity-20">
                      <ShoppingCart size={48} />
                      <p className="text-sm font-medium">Belum ada order untuk ditampilkan.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, tone = "default" }: { label: string; value: number; icon: React.ReactNode; tone?: string }) {
  const colorClass = 
    tone === "warning" ? "text-amber-400" : 
    tone === "info" ? "text-sky-400" : 
    tone === "emerald" ? "text-emerald-400" : 
    "text-white/60";

  return (
    <Card className="border-white/[0.06] bg-[#262626] p-4">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">
        {icon}
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${colorClass}`}>
        {value}
      </div>
    </Card>
  );
}
