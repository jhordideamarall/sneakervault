"use client";

import { useState, useTransition } from "react";
import { updateSessionStatus } from "@/lib/actions/status";
import { Badge, Button, Select } from "@sneakervault/ui";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";
import { useLiveRefresh } from "@/lib/use-live-refresh";

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

  // Live refresh on session status changes
  useLiveRefresh(["packing_sessions"]);

  const canShip = roles.includes("owner") || roles.includes("shopkeeper");
  const canComplete = roles.includes("owner") || roles.includes("admin_online");

  const filtered = filter ? sessions.filter((s) => s.status === filter) : sessions;

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1a1a2e]">🛒 Orders</h1>
        <div className="w-48">
          <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Semua status</option>
            <option value="packing">Packing</option>
            <option value="shipped">Dikirim</option>
            <option value="completed">Selesai</option>
            <option value="has_return">Retur</option>
            <option value="cancelled">Batal</option>
          </Select>
        </div>
      </div>

      <div className="rounded-xl border border-[#e5e7eb] bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-[#e5e7eb] bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Order ID</th>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Platform</th>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Kurir</th>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Packed by</th>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Status</th>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Tanggal</th>
              <th className="px-4 py-3 text-right font-medium text-[#6b7280]">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e7eb]">
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs">{s.platform_order_id ?? "—"}</td>
                <td className="px-4 py-3 capitalize">{s.platform}</td>
                <td className="px-4 py-3 uppercase">{s.courier}</td>
                <td className="px-4 py-3">{s.profiles?.full_name ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge tone={statusTones[s.status] ?? "default"}>
                    {statusLabel[s.status] ?? s.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-[#6b7280]">
                  {new Date(s.created_at).toLocaleDateString("id-ID")}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    {s.status === "packing" && canShip && (
                      <Button size="sm" variant="secondary" onClick={() => handleTransition(s.id, "shipped")} disabled={pending}>
                        Tandai Dikirim
                      </Button>
                    )}
                    {s.status === "shipped" && canComplete && (
                      <>
                        <Button size="sm" variant="success" onClick={() => handleTransition(s.id, "completed")} disabled={pending}>
                          Selesai
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => handleTransition(s.id, "has_return")} disabled={pending}>
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
                <td colSpan={7} className="px-4 py-8 text-center text-[#6b7280]">
                  Belum ada order.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
