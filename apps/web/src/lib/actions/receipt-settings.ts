"use server";

import { createClient } from "@sneakervault/supabase/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "./auth";
import {
  RECEIPT_SETTINGS_KEY,
  mergeReceiptSettings,
  type ReceiptSettings,
} from "@/lib/receipt";

export async function getReceiptSettings(): Promise<ReceiptSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", RECEIPT_SETTINGS_KEY)
    .maybeSingle();
  return mergeReceiptSettings((data as { value?: unknown } | null)?.value);
}

export async function saveReceiptSettings(
  input: ReceiptSettings,
): Promise<{ success?: true; error?: string }> {
  const profile = await requireRole(["owner"]);
  const supabase = await createClient();
  const value = mergeReceiptSettings(input);

  const { error } = await supabase.from("app_settings").upsert(
    {
      key: RECEIPT_SETTINGS_KEY,
      value,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  if (error) return { error: error.message };
  revalidatePath("/penjualan/pos");
  return { success: true };
}
