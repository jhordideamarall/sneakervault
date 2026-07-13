"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@sneakervault/supabase/server";
import { getCurrentUserCached } from "@/lib/auth-session";

export async function getFeatureTourState(
  tourKey: string,
): Promise<{ dismissed: boolean }> {
  const profile = await getCurrentUserCached();
  if (!profile) return { dismissed: true };

  const supabase = await createClient();
  const { data } = await supabase
    .from("user_feature_tour_states")
    .select("dismissed_at")
    .eq("user_id", profile.id)
    .eq("tour_key", tourKey)
    .maybeSingle();

  return { dismissed: Boolean(data?.dismissed_at) };
}

export async function dismissFeatureTour(
  tourKey: string,
): Promise<{ success?: true; error?: string }> {
  const profile = await getCurrentUserCached();
  if (!profile) return { error: "Sesi login tidak ditemukan" };

  const now = new Date().toISOString();
  const supabase = await createClient();
  const { error } = await supabase.from("user_feature_tour_states").upsert(
    {
      user_id: profile.id,
      tour_key: tourKey,
      dismissed_at: now,
      updated_at: now,
    },
    { onConflict: "user_id,tour_key" },
  );

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}
