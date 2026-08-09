"use client";

import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import Image from "next/image";
import { createClient } from "@sneakervault/supabase/client";
import { User, ArrowRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useDateFilter } from "@/lib/use-date-filter";
import {
  daysInWIBMonth,
  firstWeekdayOfWIBMonth,
  getWIBDay,
  nowWIB,
  wibStartOfMonth,
  wibStartOfNextMonth,
} from "@/lib/timezone";

const actionLabels: Record<string, string> = {
  scan_in: "Scan Masuk",
  scan_out: "Scan Keluar",
  status_change: "Ubah Status",
  create: "Buat Baru",
  create_and_issue: "Buat & Terbitkan Invoice",
  approve: "Setujui",
  receive: "Terima Barang",
  hard_delete: "Hapus Permanen",
  deactivate: "Nonaktifkan",
  reactivate: "Aktifkan Kembali",
  delete_request: "Minta Hapus",
  bulk_import: "Import Massal",
  update: "Update Data",
  finalize_session: "Selesai Packing",
  cancel_session: "Batalkan Sesi",
  initiate_return: "Ajukan Retur",
  verify_return: "Verifikasi Retur",
  process_return: "Proses Retur",
  return_initiated: "Return Masuk",
  return_verified: "Return Dicek",
  receive_stock: "Terima Stok",
  create_purchase_invoice: "Faktur Pembelian",
  pay_vendor: "Bayar Vendor",
  create_sales_invoice: "Invoice Penjualan",
  receive_customer_payment: "Terima Kas",
  notification_sent: "Kirim Notifikasi",
  review_dashboard: "Review Dashboard",
  approve_delete: "Approve Hapus",
};

const actionDots: Record<string, string> = {
  scan_in: "bg-blue-500",
  scan_out: "bg-indigo-500",
  status_change: "bg-amber-500",
  create: "bg-emerald-500",
  create_and_issue: "bg-emerald-500",
  approve: "bg-sky-500",
  receive: "bg-blue-500",
  hard_delete: "bg-red-500",
  deactivate: "bg-white/30",
  reactivate: "bg-emerald-500",
  delete_request: "bg-red-400",
  bulk_import: "bg-violet-500",
  cancel_session: "bg-red-500",
  initiate_return: "bg-purple-500",
  process_return: "bg-emerald-600",
  update: "bg-sky-500",
  return_initiated: "bg-purple-500",
  return_verified: "bg-cyan-500",
  receive_stock: "bg-blue-500",
  create_purchase_invoice: "bg-amber-500",
  pay_vendor: "bg-red-500",
  create_sales_invoice: "bg-emerald-500",
  receive_customer_payment: "bg-emerald-500",
  notification_sent: "bg-sky-500",
  review_dashboard: "bg-white",
};

type ActivityEntry = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
  new_data: Record<string, unknown> | null;
  profiles: { full_name: string; roles: string[] } | null;
};

function subscribeMounted(onStoreChange: () => void) {
  onStoreChange();
  return () => {};
}

function getClientMountedSnapshot() {
  return true;
}

function getServerMountedSnapshot() {
  return false;
}

function getTodayWIBKey() {
  return nowWIB().toISOString().slice(0, 10);
}

export function RightSidebar({ 
  fullName, 
  roles,
  avatarUrl,
}: { 
  fullName: string; 
  roles: string[]; 
  avatarUrl?: string | null;
  userId: string;
}) {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const mounted = useSyncExternalStore(
    subscribeMounted,
    getClientMountedSnapshot,
    getServerMountedSnapshot,
  );
  const { from: filterFrom, to: filterTo, filter } = useDateFilter();
  const nowTime = nowWIB().getTime();
  const nowDayWIB = getTodayWIBKey();

  // Realtime is only safe when the filter range includes "now" (current month,
  // or today's date). Otherwise new inserts don't belong in the filtered view.
  const filterIncludesNow =
    new Date(filterFrom).getTime() <= nowTime &&
    new Date(filterTo).getTime() >= nowTime;

  const fetchActivities = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("activity_logs")
      .select("id, action, entity_type, entity_id, created_at, new_data, profiles:user_id(full_name, roles)")
      .gte("created_at", filterFrom)
      .lte("created_at", filterTo)
      .order("created_at", { ascending: false })
      .limit(10);
    
    if (data) setActivities(data as unknown as ActivityEntry[]);
  }, [filterFrom, filterTo]);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchActivities();
    });

    if (!filterIncludesNow) return;

    const supabase = createClient();
    const channelName = `activity-realtime:${crypto.randomUUID()}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_logs" }, async (payload) => {
        const { data: fullEntry } = await supabase
          .from("activity_logs")
          .select("id, action, entity_type, entity_id, created_at, new_data, profiles:user_id(full_name, roles)")
          .eq("id", payload.new.id)
          .single();

        if (fullEntry) {
          setActivities((prev) => [fullEntry as unknown as ActivityEntry, ...prev].slice(0, 10));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchActivities, filterIncludesNow]);

  // Prevent hydration mismatch by showing skeleton or nothing until mounted
  if (!mounted) {
    return (
      <div className="flex h-full flex-col bg-[#262626] animate-pulse">
        <div className="px-5 pt-6 pb-5 border-b border-white/[0.04]">
          <div className="h-12 w-12 rounded-lg bg-white/5" />
        </div>
        <div className="mx-3 my-4 h-48 rounded-2xl bg-white/5" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#262626]">
      {/* Profile Section */}
      <div className="px-5 pt-6 pb-5 border-b border-white/[0.04]">
        <div className="flex items-center gap-3">
          {avatarUrl ? (
            <Image 
              src={avatarUrl} 
              alt={fullName}
              width={48}
              height={48}
              priority
              className="h-12 w-12 rounded-lg object-cover ring-1 ring-white/10"
            />
          ) : (
            <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-white/[0.25] to-white/[0.05] shadow-[inset_0_1px_2px_rgba(255,255,255,0.25),inset_0_-2px_4px_rgba(0,0,0,0.4)] ring-1 ring-white/[0.15] backdrop-blur-sm flex items-center justify-center text-white/70">
              <User size={20} strokeWidth={1.7} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{fullName}</p>
            <p className="text-[11px] capitalize text-white/50">{roles[0]?.replace("_", " ") || "user"}</p>
          </div>
        </div>
      </div>

      {/* Apple-style Calendar */}
      <div className="mx-3 my-4 rounded-2xl bg-[#1C1C1E] border border-white/[0.04] px-4 py-4 shadow-xl text-white flex-shrink-0">
        <MiniCalendar />
      </div>

      {/* Separator */}
      <div className="mx-5 border-t border-white/[0.06] flex-shrink-0" />

      {/* Activity Log Header - fixed above scroll */}
      <p className="flex-shrink-0 text-[11px] font-bold uppercase tracking-widest text-white/60 px-6 pt-4 pb-2">
        {filter.date ? "Aktivitas Hari Itu" : filterIncludesNow ? "Aktivitas Terbaru" : "Aktivitas Bulan Itu"}
      </p>

      {/* Activity Log Timeline */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-5">
        
        <div className="relative">
          {activities.length > 1 && (
            <div className="absolute left-3 top-2 bottom-6 w-px bg-white/[0.08]" />
          )}

          <div className="space-y-4">
            {activities.length === 0 ? (
              <p className="text-xs text-white/60 px-2 italic text-center py-4">Belum ada aktivitas</p>
            ) : (
              activities.map((a) => (
                <ActivityItem key={a.id} activity={a} nowDayWIB={nowDayWIB} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityItem({ activity: a, nowDayWIB }: { activity: ActivityEntry; nowDayWIB: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const primaryRole = (a.profiles?.roles?.[0] || "system").replace("_", " ");

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="relative flex cursor-pointer items-start gap-3 rounded-xl p-2 transition-all hover:bg-white/[0.05] group text-left w-full">
          <div className={`relative z-10 mt-1.5 h-2 w-2 flex-shrink-0 rounded-full border-2 border-[#262626] ${actionDots[a.action] ?? "bg-white/40"}`} />
          
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 overflow-hidden">
                <p className="text-[12px] font-bold text-white/90 truncate group-hover:text-white transition-colors">
                  {a.profiles?.full_name ?? "System"}
                </p>
                <span className="flex-shrink-0 text-[8px] uppercase tracking-tighter text-white/65 font-black border border-white/10 px-1.5 py-0.5 rounded bg-white/[0.03]">
                  {primaryRole}
                </span>
              </div>
              <p className="text-[10px] text-white/60 font-medium">
                {(() => {
                  const d = new Date(a.created_at);
                  const activityDayWIB = new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
                  const isToday = nowDayWIB === activityDayWIB;
                  const timeStr = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
                  return isToday
                    ? timeStr
                    : d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", timeZone: "Asia/Jakarta" }) + " " + timeStr;
                })()}
              </p>
            </div>
            <p className="text-[11px] text-white/60 font-medium">
              {actionLabels[a.action] ?? a.action}
            </p>
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent className="ml-7 pr-2 pb-1">
        <div className="text-[10px] leading-relaxed text-white/70 font-medium animate-in fade-in slide-in-from-top-1 duration-200">
          {renderSimpleContent(a)}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function renderSimpleContent(a: ActivityEntry) {
  const d = a.new_data || {};
  const text = (key: string, fallback = "") => {
    const value = d[key];
    return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
  };
  const num = (key: string) => {
    const value = d[key];
    return typeof value === "number" ? value : typeof value === "string" ? Number(value) || 0 : 0;
  };
  
  if (a.action === 'scan_in' || (a.action === 'create' && a.entity_type === 'product')) {
    return (
      <div className="space-y-0.5">
        <p className="text-white/90 font-bold">{text("brand")} {text("model")}</p>
        <p className="text-[9px] text-white/65 uppercase tracking-tighter">
          SKU: <span className="text-white/60">{text("sku", "-")}</span> · Size: <span className="text-white/60">{text("size", "-")}</span>
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-blue-400 font-bold">+{num("quantity")} unit</span>
          <span className="text-white/40">@ Rp{num("unit_cost").toLocaleString('id-ID')}</span>
        </div>
      </div>
    );
  }

  if (a.action === 'scan_out') {
    return (
      <div className="space-y-0.5">
        <p className="text-white/90 font-bold">{text("brand")} {text("model")}</p>
        <p className="text-[9px] text-white/65 uppercase tracking-tighter">
          Size: <span className="text-white/60">{text("size", "-")}</span> · <span className="text-white/60">{text("color")}</span>
        </p>
      </div>
    );
  }

  if (a.action === 'update' && num("manual_hpp") > 0) {
    return (
      <p>
        HPP <span className="text-white/40">{text("brand")} {text("model")}</span> set to <span className="text-amber-400 font-bold">Rp{num("manual_hpp").toLocaleString('id-ID')}</span>
        {text("note") && <span className="block mt-0.5 text-white/40 italic font-normal">"{text("note")}"</span>}
      </p>
    );
  }

  if (a.action === 'status_change') {
    return (
      <div className="flex items-center gap-1.5 py-0.5">
        <span className="text-white/40 font-bold uppercase text-[9px]">Order {text("order_id", "Sesi")}</span>
        <ArrowRight size={8} className="text-white/20" />
        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-400 font-black uppercase text-[8px] border border-emerald-500/20">
          {text("status")}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {Object.entries(d).map(([key, val]) => {
        if (typeof val === 'object' || key === 'id' || key === 'note' || key === 'brand' || key === 'model') return null;
        return (
          <div key={key} className="flex gap-2">
            <span className="text-white/60 capitalize font-bold">{key.replace('_', ' ')}:</span>
            <span className="text-white/60 font-bold">{String(val)}</span>
          </div>
        );
      })}
    </div>
  );
}

function MiniCalendar() {
  const { filter, setDate, setMonth, prevMonth, nextMonth } = useDateFilter();
  const year = filter.year;
  const month = filter.month;
  const firstDay = firstWeekdayOfWIBMonth(year, month);
  const daysInMonth = daysInWIBMonth(year, month);

  // "Today" must be computed in WIB — `new Date().getDate()` would use the host
  // timezone (UTC on Vercel), so we derive from the WIB-shifted Date instead.
  const todayWIBDate = nowWIB();
  const todayDate = todayWIBDate.getUTCDate();
  const todayMonth = todayWIBDate.getUTCMonth();
  const todayYear = todayWIBDate.getUTCFullYear();
  const isCurrentMonth = todayYear === year && todayMonth === month;

  const [activityDays, setActivityDays] = useState<Record<number, "sale" | "return" | "both">>({});

  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const days = ["S", "S", "R", "K", "J", "S", "M"];
  const offset = firstDay === 0 ? 6 : firstDay - 1;

  // Fetch activity heatmap for current month (WIB)
  // - Sales dot: based on packing_sessions.completed_at (barang keluar/terjual).
  //   Only sessions that actually reached shipped/completed/has_return count.
  // - Return dot: based on returns.created_at.
  useEffect(() => {
    async function fetchHeatmap() {
      const supabase = createClient();
      const from = wibStartOfMonth(year, month);
      const to = wibStartOfNextMonth(year, month);

      const [{ data: sales }, { data: returns }] = await Promise.all([
        supabase
          .from("packing_sessions")
          .select("completed_at")
          .in("status", ["shipped", "completed", "has_return"])
          .not("completed_at", "is", null)
          .gte("completed_at", from)
          .lt("completed_at", to),
        supabase
          .from("returns")
          .select("created_at")
          .gte("created_at", from)
          .lt("created_at", to),
      ]);

      const map: Record<number, "sale" | "return" | "both"> = {};
      for (const s of sales ?? []) {
        if (!s.completed_at) continue;
        const d = getWIBDay(s.completed_at);
        map[d] = map[d] === "return" ? "both" : "sale";
      }
      for (const r of returns ?? []) {
        const d = getWIBDay(r.created_at);
        map[d] = map[d] === "sale" ? "both" : "return";
      }
      setActivityDays(map);
    }
    fetchHeatmap();
  }, [year, month]);

  // Parse selected date string manually (timezone-independent)
  const selectedDay = filter.date ? Number(filter.date.split("-")[2]) : null;
  const selectedMonth = filter.date ? Number(filter.date.split("-")[1]) - 1 : null;
  const selectedYear = filter.date ? Number(filter.date.split("-")[0]) : null;
  const isSelectedMonth = filter.date ? selectedMonth === month && selectedYear === year : false;

  return (
    <div className="select-none">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4 px-1">
        <button onClick={prevMonth} className="text-white/40 hover:text-white/80 transition-colors text-sm">‹</button>
        <button onClick={() => setMonth(month, year)} className="text-[12px] font-bold text-white/80 hover:text-white transition-colors">
          {monthNames[month]} {year}
        </button>
        <button onClick={nextMonth} className="text-white/40 hover:text-white/80 transition-colors text-sm">›</button>
      </div>

      <div className="grid grid-cols-7 mb-2">
        {days.map((d, i) => (
          <span key={i} className="text-center text-[10px] font-bold text-white/60">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {Array.from({ length: offset }).map((_, i) => (
          <span key={`e-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const isToday = isCurrentMonth && day === todayDate;
          const isSelected = isSelectedMonth && day === selectedDay;
          const activity = activityDays[day];
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

          return (
            <div key={day} className="flex flex-col items-center">
              <button
                onClick={() => setDate(isSelected ? null : dateStr)}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-[12px] transition-all ${
                  isSelected
                    ? "bg-white font-black text-black shadow-lg"
                    : isToday
                    ? "bg-red-500 font-black text-white shadow-lg shadow-red-500/20"
                    : "text-white/60 hover:bg-white/[0.08]"
                }`}
              >
                {day}
              </button>
              {activity && (
                <div className="flex gap-0.5 mt-0.5">
                  {(activity === "sale" || activity === "both") && <span className="h-1 w-1 rounded-full bg-emerald-500" />}
                  {(activity === "return" || activity === "both") && <span className="h-1 w-1 rounded-full bg-red-500" />}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-3 px-1">
        <div className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="text-[9px] text-white/60">Penjualan</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          <span className="text-[9px] text-white/60">Retur</span>
        </div>
      </div>
    </div>
  );
}
