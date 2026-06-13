"use server";

import { createClient } from "@sneakervault/supabase/server";
import {
  feedbackInputSchema,
  feedbackCommentSchema,
  feedbackStatusSchema,
} from "@sneakervault/shared";
import { requireRole, requireOwner } from "./auth";
import { logActivity } from "./activity-log";
import { revalidatePath } from "next/cache";

const ALL_ROLES = [
  "owner",
  "finance",
  "admin_gudang",
  "admin_online",
  "shopkeeper",
] as const;

const BUCKET = "feedback-screenshots";

type UploadedFile = { file_path: string; file_name: string };

/** Create a feedback report. Manual fields validated; role+version added server-side. */
export async function createFeedback(
  input: unknown,
  attachments: UploadedFile[] = [],
) {
  const profile = await requireRole([...ALL_ROLES]);
  const parsed = feedbackInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { data: numberRow, error: numErr } = await supabase.rpc(
    "generate_feedback_number",
  );
  if (numErr || !numberRow)
    return { error: { _form: ["Gagal membuat nomor laporan"] } };

  const reporterRole = (profile.roles ?? []).join(",") || "unknown";
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

  const { data: report, error } = await supabase
    .from("feedback_reports")
    .insert({
      report_no: numberRow as string,
      title: parsed.data.title,
      description: parsed.data.description,
      severity: parsed.data.severity,
      page_path: parsed.data.page_path ?? null,
      reporter_role: reporterRole,
      app_version: appVersion,
      user_agent: parsed.data.user_agent ?? null,
      viewport: parsed.data.viewport ?? null,
      created_by: profile.id,
    })
    .select("id, report_no")
    .single();

  if (error || !report)
    return { error: { _form: ["Gagal menyimpan laporan"] } };

  if (attachments.length > 0) {
    const rows = attachments.map((a) => ({
      report_id: report.id,
      file_path: a.file_path,
      file_name: a.file_name,
      created_by: profile.id,
    }));
    await supabase.from("feedback_attachments").insert(rows);
  }

  await logActivity({
    user_id: profile.id,
    action: "create",
    entity_type: "feedback_report",
    entity_id: report.id,
    new_data: { report_no: report.report_no, severity: parsed.data.severity },
  });

  revalidatePath("/feedback");
  return { ok: true, id: report.id, report_no: report.report_no };
}

/** Add a comment to a report. RLS enforces visibility; we also attach files. */
export async function addFeedbackComment(
  input: unknown,
  attachments: UploadedFile[] = [],
) {
  const profile = await requireRole([...ALL_ROLES]);
  const parsed = feedbackCommentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { data: comment, error } = await supabase
    .from("feedback_comments")
    .insert({
      report_id: parsed.data.report_id,
      body: parsed.data.body,
      author_id: profile.id,
    })
    .select("id")
    .single();

  if (error || !comment)
    return { error: { _form: ["Gagal menyimpan komentar (cek akses)"] } };

  if (attachments.length > 0) {
    const rows = attachments.map((a) => ({
      report_id: parsed.data.report_id,
      comment_id: comment.id,
      file_path: a.file_path,
      file_name: a.file_name,
      created_by: profile.id,
    }));
    await supabase.from("feedback_attachments").insert(rows);
  }

  revalidatePath("/feedback");
  return { ok: true };
}

/** Owner-only: change report status; stamp resolver on terminal states. */
export async function updateFeedbackStatus(input: unknown) {
  const profile = await requireOwner();
  const parsed = feedbackStatusSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const terminal =
    parsed.data.status === "selesai" || parsed.data.status === "ditolak";
  const { error } = await supabase
    .from("feedback_reports")
    .update({
      status: parsed.data.status,
      updated_at: new Date().toISOString(),
      resolved_by: terminal ? profile.id : null,
      resolved_at: terminal ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.report_id);

  if (error) return { error: { _form: ["Gagal mengubah status"] } };

  await logActivity({
    user_id: profile.id,
    action: "update",
    entity_type: "feedback_report",
    entity_id: parsed.data.report_id,
    new_data: { status: parsed.data.status },
  });

  revalidatePath("/feedback");
  return { ok: true };
}

/** Short-lived signed URL for a private screenshot path. */
export async function getFeedbackScreenshotUrl(path: string) {
  await requireRole([...ALL_ROLES]);
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 300);
  if (error || !data) return { error: "Gagal membuat URL" };
  return { url: data.signedUrl };
}
