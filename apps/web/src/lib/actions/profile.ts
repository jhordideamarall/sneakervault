"use server";

import { createClient } from "@sneakervault/supabase/server";

export async function updateProfile(params: { full_name: string; avatar_url: string | null }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Tidak terautentikasi" };

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: params.full_name, avatar_url: params.avatar_url })
    .eq("id", user.id);

  if (error) return { error: error.message };
  return { success: true };
}

export async function updatePassword(newPassword: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: error.message };
  return { success: true };
}
