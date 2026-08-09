"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@sneakervault/supabase/server";
import { employeeInputSchema } from "@sneakervault/shared";
import { requireRole } from "./auth";
import { logActivity } from "./activity-log";

const ROLES = ["owner", "finance"] as const;

function revalidateEmployees() {
  revalidatePath("/employees");
  revalidatePath("/buku-besar/payroll");
}

export async function createEmployee(input: unknown) {
  const profile = await requireRole([...ROLES]);
  const parsed = employeeInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from("employees")
    .insert({
      ...parsed.data,
      employee_code: parsed.data.employee_code || null,
      job_title: parsed.data.job_title || null,
      department: parsed.data.department || null,
      bank_account_name: parsed.data.bank_account_name || null,
      bank_account_number: parsed.data.bank_account_number || null,
      tax_id: parsed.data.tax_id || null,
      hire_date: parsed.data.hire_date || null,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: { _form: [error?.message ?? "Karyawan gagal dibuat"] } };

  await logActivity({
    user_id: profile.id,
    action: "create",
    entity_type: "employee",
    entity_id: data.id,
    new_data: parsed.data,
  });
  revalidateEmployees();
  return { data };
}

export async function updateEmployee(id: string, input: unknown) {
  const profile = await requireRole([...ROLES]);
  const parsed = employeeInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { error } = await (supabase as any)
    .from("employees")
    .update({
      ...parsed.data,
      employee_code: parsed.data.employee_code || null,
      job_title: parsed.data.job_title || null,
      department: parsed.data.department || null,
      bank_account_name: parsed.data.bank_account_name || null,
      bank_account_number: parsed.data.bank_account_number || null,
      tax_id: parsed.data.tax_id || null,
      hire_date: parsed.data.hire_date || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: { _form: [error.message] } };

  await logActivity({
    user_id: profile.id,
    action: "update",
    entity_type: "employee",
    entity_id: id,
    new_data: parsed.data,
  });
  revalidateEmployees();
  return { success: true };
}

export async function deactivateEmployee(id: string) {
  const profile = await requireRole([...ROLES]);
  const supabase = await createClient();
  const { error } = await (supabase as any)
    .from("employees")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  await logActivity({
    user_id: profile.id,
    action: "deactivate",
    entity_type: "employee",
    entity_id: id,
  });
  revalidateEmployees();
  return { success: true };
}

export async function reactivateEmployee(id: string) {
  const profile = await requireRole([...ROLES]);
  const supabase = await createClient();
  const { error } = await (supabase as any)
    .from("employees")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  await logActivity({
    user_id: profile.id,
    action: "reactivate",
    entity_type: "employee",
    entity_id: id,
  });
  revalidateEmployees();
  return { success: true };
}
