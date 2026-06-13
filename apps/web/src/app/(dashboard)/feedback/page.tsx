import { getCurrentUserCached } from "@/lib/auth-session";
import { listFeedback, getFeedback } from "@/lib/queries/feedback";
import { FeedbackDetail } from "@/components/feedback/feedback-detail";
import Link from "next/link";

const SEV_BADGE: Record<string, string> = {
  blocker: "bg-red-500/20 text-red-300",
  mengganggu: "bg-amber-500/20 text-amber-200",
  minor: "bg-emerald-500/20 text-emerald-200",
};
const STATUS_BADGE: Record<string, string> = {
  baru: "bg-sky-500/20 text-sky-200",
  diproses: "bg-amber-500/20 text-amber-200",
  selesai: "bg-emerald-500/20 text-emerald-200",
  ditolak: "bg-white/10 text-white/50",
};

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const profile = await getCurrentUserCached();
  const isOwner = (profile?.roles ?? []).includes("owner");

  if (id) {
    const detail = await getFeedback(id);
    if (!detail) {
      return (
        <div className="p-6 text-white/60">
          Laporan tidak ditemukan atau tidak punya akses.
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Link
          href="/feedback"
          className="mb-4 inline-block text-sm text-white/50 hover:text-white/80"
        >
          ← Semua laporan
        </Link>
        <FeedbackDetail
          report={detail.report}
          comments={detail.comments}
          attachments={detail.attachments}
          isOwner={isOwner}
        />
      </div>
    );
  }

  const reports = await listFeedback();
  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 text-xl font-semibold text-white">Feedback UAT</h1>
      <p className="mb-5 text-sm text-white/50">
        {isOwner ? "Semua laporan dari tester." : "Laporan yang kamu kirim."}
      </p>
      <div className="flex flex-col gap-2">
        {reports.length === 0 && (
          <p className="text-white/40">Belum ada laporan.</p>
        )}
        {reports.map((r) => (
          <Link
            key={r.id}
            href={`/feedback?id=${r.id}`}
            className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 hover:border-white/15"
          >
            <span className="font-mono text-xs text-white/35">
              {r.report_no}
            </span>
            <span className="flex-1 truncate text-sm text-white/85">
              {r.title}
            </span>
            <span
              className={`rounded px-2 py-0.5 text-[11px] ${SEV_BADGE[r.severity] ?? ""}`}
            >
              {r.severity}
            </span>
            <span
              className={`rounded px-2 py-0.5 text-[11px] ${STATUS_BADGE[r.status] ?? ""}`}
            >
              {r.status}
            </span>
            {isOwner && (
              <span className="hidden font-mono text-[11px] text-white/35 sm:inline">
                {r.reporter_role} · {r.page_path}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
