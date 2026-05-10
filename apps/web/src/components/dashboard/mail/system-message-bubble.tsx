"use client";

import { Package, Truck, RotateCcw, AlertTriangle, Trash2, BoxesIcon, Bell } from "lucide-react";
import { cn } from "@sneakervault/ui";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { useRouter } from "next/navigation";
import type { InternalMessage } from "@/lib/use-inbox";

const EVENT_CONFIG: Record<string, { icon: typeof Bell; color: string; route?: string }> = {
  "packing.created": { icon: Package, color: "text-blue-400 bg-blue-500/10 border-blue-500/20", route: "/outbound" },
  "packing.shipped": { icon: Truck, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", route: "/orders" },
  "packing.completed": { icon: Truck, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", route: "/orders" },
  "packing.has_return": { icon: RotateCcw, color: "text-orange-400 bg-orange-500/10 border-orange-500/20", route: "/returns" },
  "return.initiated": { icon: RotateCcw, color: "text-orange-400 bg-orange-500/10 border-orange-500/20", route: "/returns" },
  "return.verified": { icon: RotateCcw, color: "text-orange-400 bg-orange-500/10 border-orange-500/20", route: "/returns" },
  "return.processed": { icon: RotateCcw, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", route: "/returns" },
  "inbound.batch_received": { icon: BoxesIcon, color: "text-purple-400 bg-purple-500/10 border-purple-500/20", route: "/inbound" },
  "low_stock.warning": { icon: AlertTriangle, color: "text-red-400 bg-red-500/10 border-red-500/20", route: "/inventory" },
  "delete_request.submitted": { icon: Trash2, color: "text-red-400 bg-red-500/10 border-red-500/20", route: "/delete-requests" },
  "delete_request.reviewed": { icon: Trash2, color: "text-amber-400 bg-amber-500/10 border-amber-500/20", route: "/delete-requests" },
};

export function SystemMessageBubble({ msg }: { msg: InternalMessage }) {
  const router = useRouter();
  const eventType = (msg.metadata as Record<string, unknown>)?.event_type as string | undefined;
  const config = EVENT_CONFIG[eventType ?? ""] ?? { icon: Bell, color: "text-white/40 bg-white/5 border-white/10" };
  const Icon = config.icon;

  const hasEntity = msg.related_entity_type && msg.related_entity_id;

  return (
    <div className="flex flex-col items-center my-4">
      <div className={cn(
        "flex items-start gap-3 max-w-[85%] px-4 py-3 rounded-2xl border",
        config.color
      )}>
        <div className="shrink-0 mt-0.5">
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          {msg.subject && (
            <p className="text-[12px] font-bold mb-0.5 opacity-90">{msg.subject}</p>
          )}
          <p className="text-[13px] leading-relaxed opacity-80">{msg.content}</p>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-[10px] opacity-50">
              {format(new Date(msg.created_at!), "d MMM, HH:mm", { locale: id })}
            </span>
            {hasEntity && config.route && (
              <button
                onClick={() => router.push(config.route!)}
                className="text-[10px] font-bold uppercase tracking-wider opacity-70 hover:opacity-100 transition-opacity underline underline-offset-2"
              >
                Buka detail
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
