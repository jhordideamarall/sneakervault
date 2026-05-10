"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { createClient } from "@sneakervault/supabase/client";
import { User, Package, ShoppingBag, RotateCcw, ArrowRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const actionLabels: Record<string, string> = {
  scan_in: "Scan Masuk",
  scan_out: "Scan Keluar",
  status_change: "Ubah Status",
  create: "Buat Baru",
  update: "Update Data",
  finalize_session: "Selesai Packing",
  cancel_session: "Batalkan Sesi",
  initiate_return: "Ajukan Retur",
  verify_return: "Verifikasi Retur",
  process_return: "Proses Retur",
  approve_delete: "Approve Hapus",
};

const actionDots: Record<string, string> = {
  scan_in: "bg-blue-500",
  scan_out: "bg-indigo-500",
  status_change: "bg-amber-500",
  create: "bg-emerald-500",
  cancel_session: "bg-red-500",
  initiate_return: "bg-purple-500",
  process_return: "bg-emerald-600",
  update: "bg-sky-500",
};

type ActivityEntry = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
  new_data: any;
  profiles: { full_name: string; roles: string[] } | null;
};

export function RightSidebar({ 
  fullName, 
  roles,
  avatarUrl
}: { 
  fullName: string; 
  roles: string[]; 
  avatarUrl?: string | null;
}) {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [mounted, setMounted] = useState(false);
  const today = new Date();
  
  const fetchActivities = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("activity_logs")
      .select("id, action, entity_type, entity_id, created_at, new_data, profiles:user_id(full_name, roles)")
      .order("created_at", { ascending: false })
      .limit(10);
    
    if (data) setActivities(data as unknown as ActivityEntry[]);
  }, []);

  useEffect(() => {
    setMounted(true);
    fetchActivities();

    const supabase = createClient();
    const channel = supabase
      .channel("activity-realtime")
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
  }, [fetchActivities]);

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
        <p className="text-[12px] font-bold text-white/80 mb-4 px-1 italic opacity-70">
          {today.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
        </p>
        <MiniCalendar today={today} />
      </div>

      {/* Separator */}
      <div className="mx-5 border-t border-white/[0.06] flex-shrink-0" />

      {/* Activity Log Header - fixed above scroll */}
      <p className="flex-shrink-0 text-[11px] font-bold uppercase tracking-widest text-white/30 px-6 pt-4 pb-2">Aktivitas Terbaru</p>

      {/* Activity Log Timeline */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-5">
        
        <div className="relative">
          {activities.length > 1 && (
            <div className="absolute left-3 top-2 bottom-6 w-px bg-white/[0.08]" />
          )}

          <div className="space-y-4">
            {activities.length === 0 ? (
              <p className="text-xs text-white/40 px-2 italic text-center py-4">Belum ada aktivitas</p>
            ) : (
              activities.map((a) => (
                <ActivityItem key={a.id} activity={a} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityItem({ activity: a }: { activity: ActivityEntry }) {
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
                <span className="flex-shrink-0 text-[8px] uppercase tracking-tighter text-white/40 font-black border border-white/10 px-1.5 py-0.5 rounded bg-white/[0.03]">
                  {primaryRole}
                </span>
              </div>
              <p className="text-[10px] text-white/30 font-medium">
                {(() => {
                  const d = new Date(a.created_at);
                  const isToday = d.toDateString() === new Date().toDateString();
                  return isToday 
                    ? d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
                    : d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
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
  
  if (a.action === 'scan_in' || (a.action === 'create' && a.entity_type === 'product')) {
    return (
      <div className="space-y-0.5">
        <p className="text-white/90 font-bold">{d.brand} {d.model}</p>
        <p className="text-[9px] text-white/40 uppercase tracking-tighter">
          SKU: <span className="text-white/60">{d.sku || '-'}</span> · Size: <span className="text-white/60">{d.size || '-'}</span>
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-blue-400 font-bold">+{d.quantity || 0} unit</span>
          <span className="text-white/40">@ Rp{Number(d.unit_cost || 0).toLocaleString('id-ID')}</span>
        </div>
      </div>
    );
  }

  if (a.action === 'scan_out') {
    return (
      <div className="space-y-0.5">
        <p className="text-white/90 font-bold">{d.brand} {d.model}</p>
        <p className="text-[9px] text-white/40 uppercase tracking-tighter">
          Size: <span className="text-white/60">{d.size || '-'}</span> · <span className="text-white/60">{d.color || ''}</span>
        </p>
      </div>
    );
  }

  if (a.action === 'update' && d.manual_hpp) {
    return (
      <p>
        HPP <span className="text-white/40">{d.brand} {d.model}</span> set to <span className="text-amber-400 font-bold">Rp{Number(d.manual_hpp).toLocaleString('id-ID')}</span>
        {d.note && <span className="block mt-0.5 text-white/40 italic font-normal">"{d.note}"</span>}
      </p>
    );
  }

  if (a.action === 'status_change') {
    return (
      <div className="flex items-center gap-1.5 py-0.5">
        <span className="text-white/40 font-bold uppercase text-[9px]">Order {d.order_id || 'Sesi'}</span>
        <ArrowRight size={8} className="text-white/20" />
        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-400 font-black uppercase text-[8px] border border-emerald-500/20">
          {d.status}
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
            <span className="text-white/30 capitalize font-bold">{key.replace('_', ' ')}:</span>
            <span className="text-white/60 font-bold">{String(val)}</span>
          </div>
        );
      })}
    </div>
  );
}

function MiniCalendar({ today }: { today: Date }) {
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayDate = today.getDate();

  const days = ["S", "S", "R", "K", "J", "S", "M"];
  const offset = firstDay === 0 ? 6 : firstDay - 1;

  return (
    <div className="select-none">
      <div className="grid grid-cols-7 mb-2">
        {days.map((d, i) => (
          <span key={i} className="text-center text-[10px] font-bold text-white/40">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {Array.from({ length: offset }).map((_, i) => (
          <span key={`e-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const isToday = day === todayDate;
          return (
            <div key={day} className="flex items-center justify-center">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-[12px] transition-colors ${
                  isToday
                    ? "bg-red-500 font-black text-white shadow-lg shadow-red-500/20"
                    : "text-white/60 hover:bg-white/[0.08]"
                }`}
              >
                {day}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
