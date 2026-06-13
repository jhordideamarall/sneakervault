import { createClient } from "@sneakervault/supabase/server";
import type { FeedbackSeverity, FeedbackStatus } from "@sneakervault/shared";

export type FeedbackReportRow = {
  id: string;
  report_no: string;
  title: string;
  severity: FeedbackSeverity;
  status: FeedbackStatus;
  page_path: string | null;
  reporter_role: string | null;
  app_version: string | null;
  created_at: string;
  created_by: string;
};

export async function listFeedback(filters?: {
  status?: FeedbackStatus;
  severity?: FeedbackSeverity;
}): Promise<FeedbackReportRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("feedback_reports")
    .select(
      "id, report_no, title, severity, status, page_path, reporter_role, app_version, created_at, created_by",
    )
    .order("created_at", { ascending: false });
  if (filters?.status) q = q.eq("status", filters.status);
  if (filters?.severity) q = q.eq("severity", filters.severity);
  const { data } = await q;
  return (data ?? []) as FeedbackReportRow[];
}

export async function getFeedback(id: string) {
  const supabase = await createClient();
  const { data: report } = await supabase
    .from("feedback_reports")
    .select("*")
    .eq("id", id)
    .single();
  if (!report) return null;

  const { data: comments } = await supabase
    .from("feedback_comments")
    .select("id, body, author_id, created_at")
    .eq("report_id", id)
    .order("created_at", { ascending: true });

  const { data: attachments } = await supabase
    .from("feedback_attachments")
    .select("id, comment_id, file_path, file_name")
    .eq("report_id", id);

  return { report, comments: comments ?? [], attachments: attachments ?? [] };
}
