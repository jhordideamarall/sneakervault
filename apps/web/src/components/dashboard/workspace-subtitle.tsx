"use client";

import { useEffect, useState } from "react";
import { createClient } from "@sneakervault/supabase/client";
import type { Role } from "@sneakervault/shared";

type Insight = { text: string; urgent: boolean };

export function WorkspaceSubtitle({ role, userId }: { role: Role; userId: string }) {
  const [insights, setInsights] = useState<Insight[]>([]);

  useEffect(() => {
    fetchInsights();
  }, []);

  async function fetchInsights() {
    const supabase = createClient();
    const today = new Date().toISOString().split("T")[0];
    const results: Insight[] = [];

    if (role === "owner") {
      const [{ count: pendingDeletes }, { count: pendingReturns }, { data: lowStock }] = await Promise.all([
        supabase.from("delete_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("returns").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true).lt("quantity", 3).gt("quantity", 0),
      ]);
      if (pendingDeletes && pendingDeletes > 0) results.push({ text: `${pendingDeletes} permintaan hapus menunggu`, urgent: true });
      if (pendingReturns && pendingReturns > 0) results.push({ text: `${pendingReturns} retur perlu diproses`, urgent: true });
      if (lowStock && lowStock.length > 0) results.push({ text: `${lowStock.length} produk stok rendah`, urgent: false });
    }

    if (role === "shopkeeper") {
      const { count: todaySessions } = await supabase
        .from("packing_sessions").select("id", { count: "exact", head: true })
        .eq("packed_by", userId).gte("created_at", `${today}T00:00:00`);
      results.push({ text: todaySessions ? `${todaySessions} sesi packing hari ini` : "Belum ada packing hari ini", urgent: false });
    }

    if (role === "admin_gudang") {
      const { count: pendingVerify } = await supabase
        .from("returns").select("id", { count: "exact", head: true }).eq("status", "pending");
      if (pendingVerify && pendingVerify > 0) results.push({ text: `${pendingVerify} retur menunggu verifikasi fisik`, urgent: true });
      else results.push({ text: "Tidak ada retur pending", urgent: false });
    }

    if (role === "admin_online") {
      const { count: shippedOrders } = await supabase
        .from("packing_sessions").select("id", { count: "exact", head: true }).eq("status", "shipped");
      if (shippedOrders && shippedOrders > 0) results.push({ text: `${shippedOrders} order menunggu konfirmasi selesai`, urgent: false });
      else results.push({ text: "Semua order up to date", urgent: false });
    }

    if (results.length === 0) results.push({ text: "Semua berjalan lancar hari ini", urgent: false });
    setInsights(results);
  }

  return (
    <p className="mt-1 text-sm text-white/40">
      <span className="capitalize">{role.replace("_", " ")}</span>
      {insights.length > 0 && (
        <span> · {insights.map((i, idx) => (
          <span key={idx}>
            {idx > 0 && " · "}
            <span className={i.urgent ? "text-amber-400/80" : ""}>{i.text}</span>
          </span>
        ))}</span>
      )}
    </p>
  );
}
