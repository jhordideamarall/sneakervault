"use client";

import { useRealtimeRefresh } from "@/lib/use-realtime-refresh";

export function RealtimeProvider() {
  useRealtimeRefresh();
  return null;
}
