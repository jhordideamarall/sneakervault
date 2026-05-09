"use client";

import { useEffect, useState } from "react";
import { createClient } from "@sneakervault/supabase/client";
import { User } from "lucide-react";

const actionLabels: Record<string, string> = {
  scan_in: "Scan Masuk",
  scan_out: "Scan Keluar",
  status_change: "Ubah Status",
  create: "Buat Baru",
  cancel_session: "Batalkan Sesi",
  initiate_return: "Ajukan Retur",
  verify_return: "Verifikasi Retur",
  process_return: "Proses Retur",
  approve_delete: "Approve Hapus",
};

const actionDots: Record<string, string> = {
  scan_in: "bg-blue-400",
  scan_out: "bg-indigo-400",
  status_change: "bg-amber-400",
  create: "bg-emerald-400",
  cancel_session: "bg-red-400",
  initiate_return: "bg-purple-400",
};

type ActivityEntry = {
  id: string;
  action: string;
  entity_type: string;
  created_at: string;
  profiles: { full_name: string } | null;
};

export function RightSidebar({ fullName, roles }: { fullName: string; roles: string[] }) {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const today = new Date();

  // Fetch recent activities
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("activity_logs")
      .select("id, action, entity_type, created_at, profiles:user_id(full_name)")
      .order("created_at", { ascending: false })
      .limit(8)
      .then(({ data }) => {
        if (data) setActivities(data as unknown as ActivityEntry[]);
      });

    // Realtime subscription
    const channel = supabase
      .channel("activity-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_logs" }, (payload) => {
        const entry = payload.new as ActivityEntry;
        setActivities((prev) => [entry, ...prev].slice(0, 8));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Profile */}
      <div className="px-5 pt-6 pb-5 border-b border-white/[0.04]">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-white/[0.25] to-white/[0.05] shadow-[inset_0_1px_2px_rgba(255,255,255,0.25),inset_0_-2px_4px_rgba(0,0,0,0.4)] ring-1 ring-white/[0.15] backdrop-blur-sm flex items-center justify-center text-white/70">
            <User size={20} strokeWidth={1.7} />
          </div>
          <div>
            <p className="text-sm font-medium text-white/85">{fullName}</p>
            <p className="text-[11px] capitalize text-white/35">{roles[0]?.replace("_", " ")}</p>
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div className="px-5 py-5 border-b border-white/[0.04]">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/25 mb-3">
          {today.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
        </p>
        <MiniCalendar today={today} />
      </div>

      {/* Activity Log Realtime */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/25 mb-4">Aktivitas Terbaru</p>
        <div className="space-y-3">
          {activities.length === 0 && (
            <p className="text-xs text-white/20">Belum ada aktivitas</p>
          )}
          {activities.map((a) => (
            <div key={a.id} className="flex items-start gap-3">
              <div className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${actionDots[a.action] ?? "bg-white/20"}`} />
              <div className="min-w-0">
                <p className="text-xs text-white/60 truncate">
                  <span className="font-medium text-white/80">{a.profiles?.full_name ?? "System"}</span>
                  {" · "}
                  {actionLabels[a.action] ?? a.action}
                </p>
                <p className="text-[10px] text-white/20">
                  {new Date(a.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniCalendar({ today }: { today: Date }) {
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayDate = today.getDate();

  const days = ["Mn", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const offset = firstDay === 0 ? 6 : firstDay - 1;

  return (
    <div>
      <div className="grid grid-cols-7 gap-0.5 mb-1.5">
        {days.map((d) => (
          <span key={d} className="text-center text-[10px] font-medium text-white/20">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: offset }).map((_, i) => (
          <span key={`e-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const isToday = day === todayDate;
          return (
            <span
              key={day}
              className={`flex h-7 w-7 items-center justify-center rounded-lg text-[11px] ${
                isToday
                  ? "bg-white/[0.12] font-semibold text-white"
                  : "text-white/40"
              }`}
            >
              {day}
            </span>
          );
        })}
      </div>
    </div>
  );
}
