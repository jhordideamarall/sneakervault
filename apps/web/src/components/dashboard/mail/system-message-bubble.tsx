"use client";

import { cn } from "@sneakervault/ui";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { useRouter } from "next/navigation";
import type { InternalMessage } from "@/lib/use-inbox";

const EVENT_ROUTE: Record<string, string> = {
  "packing.created": "/outbound",
  "packing.shipped": "/orders",
  "packing.completed": "/orders",
  "packing.has_return": "/returns",
  "return.initiated": "/returns",
  "return.verified": "/returns",
  "return.processed": "/returns",
  "inbound.batch_received": "/inbound",
  "low_stock.warning": "/inventory",
  "delete_request.submitted": "/delete-requests",
  "delete_request.reviewed": "/delete-requests",
};

const EVENT_COLOR: Record<string, string> = {
  "packing.created": "text-blue-400",
  "packing.shipped": "text-emerald-400",
  "packing.completed": "text-emerald-400",
  "packing.has_return": "text-orange-400",
  "return.initiated": "text-orange-400",
  "return.verified": "text-orange-400",
  "return.processed": "text-emerald-400",
  "inbound.batch_received": "text-purple-400",
  "low_stock.warning": "text-red-400",
  "delete_request.submitted": "text-red-400",
  "delete_request.reviewed": "text-amber-400",
};

export function SystemMessageBubble({ msg }: { msg: InternalMessage }) {
  const router = useRouter();
  const eventType = (msg.metadata as Record<string, unknown>)?.event_type as string | undefined;
  const route = EVENT_ROUTE[eventType ?? ""];
  const hasEntity = msg.related_entity_type && msg.related_entity_id;
  const subjectColor = EVENT_COLOR[eventType ?? ""] ?? "text-white/70";

  return (
    <div className="flex flex-col items-center my-4">
      <div className="max-w-[85%] px-4 py-3 rounded-2xl border border-white/[0.06] bg-white/[0.03]">
        {msg.subject && (
          <p className={`text-[12px] font-semibold mb-1 ${subjectColor}`}>{msg.subject}</p>
        )}
        <p className="text-[13px] leading-relaxed text-white/50">{msg.content}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-[10px] text-white/25">
            {format(new Date(msg.created_at!), "d MMM, HH:mm", { locale: id })}
          </span>
          {hasEntity && route && (
            <button
              onClick={() => router.push(route)}
              className="text-[10px] font-medium text-white/40 hover:text-white/70 transition-colors"
            >
              Buka detail →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
