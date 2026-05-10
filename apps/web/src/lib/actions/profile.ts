"use server";

import { createClient } from "@sneakervault/supabase/server";

export async function updateProfile(params: { full_name: string; avatar_url: string | null }): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Tidak terautentikasi" };

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: params.full_name, avatar_url: params.avatar_url })
      .eq("id", user.id);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Gagal update profil" };
  }
}

export async function updatePassword(newPassword: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Gagal update password" };
  }
}
