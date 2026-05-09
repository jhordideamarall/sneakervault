"use server";

import { createClient } from "@sneakervault/supabase/server";
import { redirect } from "next/navigation";
import { loginSchema, registerSchema } from "@sneakervault/shared";
import type { Role } from "@sneakervault/shared";

export async function login(_prev: unknown, formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: { email: [error.message] } };

  redirect("/workspace");
}

export async function register(formData: FormData) {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    full_name: formData.get("full_name"),
  });
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.full_name } },
  });
  if (error) return { error: { email: [error.message] } };

  redirect("/workspace");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return profile;
}

export async function requireRole(allowedRoles: Role[]) {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const hasRole = profile.roles?.some((r: string) => allowedRoles.includes(r as Role));
  if (!hasRole) redirect("/workspace");

  return profile;
}
