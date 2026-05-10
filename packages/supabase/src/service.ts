import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Service-role client untuk operasi server-side yang butuh bypass RLS:
 * - Insert system notifications (via create_system_notification RPC)
 * - Cleanup jobs / cron tasks
 *
 * JANGAN expose ke client. Hanya pakai dari Server Actions / Route Handlers.
 * Service role key hanya tersedia di env server (tanpa NEXT_PUBLIC_ prefix).
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL not configured");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");

  return createClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
