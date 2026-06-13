"use client";

import { useEffect, useState } from "react";
import {
  addFeedbackComment,
  updateFeedbackStatus,
  getFeedbackScreenshotUrl,
} from "@/lib/actions/feedback";
import type { FeedbackStatus } from "@sneakervault/shared";

type Report = {
  id: string;
  report_no: string;
  title: string;
  description: string;
  severity: string;
  status: FeedbackStatus;
  page_path: string | null;
  reporter_role: string | null;
  app_version: string | null;
  user_agent: string | null;
  viewport: string | null;
  created_at: string;
};
type Comment = {
  id: string;
  body: string;
  author_id: string;
  created_at: string;
};
type Attachment = {
  id: string;
  comment_id: string | null;
  file_path: string;
  file_name: string;
};

const STATUSES: FeedbackStatus[] = ["baru", "diproses", "selesai", "ditolak"];

export function FeedbackDetail({
  report,
  comments,
  attachments,
  isOwner,
}: {
  report: Report;
  comments: Comment[];
  attachments: Attachment[];
  isOwner: boolean;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const next: Record<string, string> = {};
      for (const a of attachments) {
        const res = await getFeedbackScreenshotUrl(a.file_path);
        if ("url" in res && res.url) next[a.id] = res.url;
      }
      setUrls(next);
    })();
  }, [attachments]);

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    await addFeedbackComment({ report_id: report.id, body });
    setBody("");
    setBusy(false);
    location.reload();
  }

  async function setStatus(status: FeedbackStatus) {
    setBusy(true);
    await updateFeedbackStatus({ report_id: report.id, status });
    setBusy(false);
    location.reload();
  }

  const reportShots = attachments.filter((a) => !a.comment_id);

  return (
    <div className="flex flex-col gap-4 text-sm text-white/80">
      <div>
        <div className="text-xs text-white/40">{report.report_no}</div>
        <h1 className="text-lg font-semibold text-white">{report.title}</h1>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs">
        <Ctx k="Halaman" v={report.page_path} mono />
        <Ctx k="Role pelapor" v={report.reporter_role} />
        <Ctx k="Severity" v={report.severity} />
        <Ctx k="Versi app" v={report.app_version} mono />
        <Ctx k="Viewport" v={report.viewport} mono />
        <Ctx k="Waktu" v={new Date(report.created_at).toLocaleString("id-ID")} />
      </div>

      <p className="whitespace-pre-wrap">{report.description}</p>

      {reportShots.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {reportShots.map((a) =>
            urls[a.id] ? (
              <a key={a.id} href={urls[a.id]} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={urls[a.id]}
                  alt={a.file_name}
                  className="h-28 rounded-lg border border-white/10"
                />
              </a>
            ) : null,
          )}
        </div>
      )}

      {isOwner && (
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              disabled={busy || s === report.status}
              onClick={() => setStatus(s)}
              className={`rounded-lg border px-3 py-1.5 text-xs ${
                s === report.status
                  ? "border-amber-400 bg-amber-400/20 text-amber-200"
                  : "border-white/10 text-white/60 hover:bg-white/5"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-white/10 pt-3">
        <h3 className="text-xs uppercase tracking-wide text-white/40">Diskusi</h3>
        {comments.map((c) => (
          <div key={c.id} className="rounded-lg bg-white/[0.03] p-3">
            <div className="mb-1 text-[11px] text-white/35">
              {new Date(c.created_at).toLocaleString("id-ID")}
            </div>
            <p className="whitespace-pre-wrap">{c.body}</p>
          </div>
        ))}
        <textarea
          className="min-h-20 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Tulis balasan…"
        />
        <button
          disabled={busy || !body.trim()}
          onClick={send}
          className="self-start rounded-lg bg-white/90 px-4 py-2 font-medium text-black disabled:opacity-40"
        >
          Kirim
        </button>
      </div>
    </div>
  );
}

function Ctx({ k, v, mono }: { k: string; v: string | null; mono?: boolean }) {
  return (
    <div>
      <div className="text-white/35">{k}</div>
      <div className={mono ? "font-mono text-white/80" : "text-white/80"}>
        {v ?? "—"}
      </div>
    </div>
  );
}
