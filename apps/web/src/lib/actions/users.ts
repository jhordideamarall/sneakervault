"use server";

import { createClient } from "@sneakervault/supabase/server";
import { createServiceClient } from "@sneakervault/supabase";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";
import { ROLES } from "@sneakervault/shared";
import type { Role } from "@sneakervault/shared";

export async function createEmployee(params: {
  email: string;
  password: string;
  full_name: string;
  role: Role;
}) {
  const profile = await requireRole(["owner"]);

  if (!ROLES.includes(params.role)) return { error: "Role tidak valid" };
  if (params.password.length < 6) return { error: "Password minimal 6 karakter" };

  const supabase = createServiceClient();

  // Create user in Supabase Auth
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: params.email,
    password: params.password,
    email_confirm: true,
    user_metadata: { full_name: params.full_name },
  });

  if (authError) return { error: authError.message };

  // Update profile with role (trigger handle_new_user already created the profile row)
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ roles: [params.role], full_name: params.full_name })
    .eq("id", authUser.user.id);

  if (profileError) return { error: profileError.message };

  await logActivity({
    user_id: profile.id,
    action: "create",
    entity_type: "user",
    entity_id: authUser.user.id,
    new_data: { email: params.email, full_name: params.full_name, role: params.role },
  });

  return { success: true };
}

export async function listUsers() {
  await requireRole(["owner"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, roles, is_active, created_at")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function assignRoles(userId: string, roles: Role[]) {
  const profile = await requireRole(["owner"]);
  // Validate each role against allowed list.
  const invalid = roles.filter((r) => !ROLES.includes(r));
  if (invalid.length > 0) {
    return { error: `Role tidak valid: ${invalid.join(", ")}` };
  }

  const supabase = await createClient();
  // Capture old for audit.
  const { data: before } = await supabase
    .from("profiles")
    .select("roles")
    .eq("id", userId)
    .maybeSingle();

  const { error } = await supabase.from("profiles").update({ roles }).eq("id", userId);
  if (error) return { error: error.message };

  await logActivity({
    user_id: profile.id,
    action: "update",
    entity_type: "user",
    entity_id: userId,
    old_data: before ?? null,
    new_data: { roles },
  });

  return { success: true };
}

export async function setUserActive(userId: string, active: boolean) {
  const profile = await requireRole(["owner"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ is_active: active })
    .eq("id", userId);
  if (error) return { error: error.message };

  await logActivity({
    user_id: profile.id,
    action: active ? "update" : "delete_request",
    entity_type: "user",
    entity_id: userId,
    new_data: { is_active: active },
  });
  return { success: true };
}
