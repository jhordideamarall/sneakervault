import { getCurrentUserCached } from "@/lib/auth-session";
import { listFeedback, getFeedback } from "@/lib/queries/feedback";
import { FeedbackDetail } from "@/components/feedback/feedback-detail";
import Link from "next/link";
import { ArrowRight, MessageSquareText } from "lucide-react";

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
const STATUS_LABEL: Record<string, string> = {
  baru: "Baru",
  diproses: "Sedang diproses",
  selesai: "Selesai",
  ditolak: "Ditolak",
};
const SEVERITY_LABEL: Record<string, string> = {
  blocker: "Menghambat",
  mengganggu: "Mengganggu",
  minor: "Minor",
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
  const openCount = reports.filter((report) => report.status === "baru").length;
  const progressCount = reports.filter((report) => report.status === "diproses").length;
  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
            <MessageSquareText size={20} className="text-white/55" />
            Feedback UAT
          </h1>
          <p className="mt-1 text-sm text-white/50">
            {isOwner ? "Buka laporan untuk membaca detail, membalas, dan mengubah status." : "Buka laporan untuk melihat balasan dan status penyelesaian."}
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-sky-200">{openCount} baru</span>
          <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-amber-200">{progressCount} diproses</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {reports.length === 0 && (
          <p className="text-white/60">Belum ada laporan.</p>
        )}
        {reports.map((r) => (
          <Link
            key={r.id}
            href={`/feedback?id=${r.id}`}
            className="group flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 transition-colors hover:border-sky-400/20 hover:bg-sky-500/[0.03]"
          >
            <span className="font-mono text-xs text-white/60">
              {r.report_no}
            </span>
            <span className="flex-1 truncate text-sm text-white/85">
              {r.title}
            </span>
            <span
              className={`rounded px-2 py-0.5 text-[11px] ${SEV_BADGE[r.severity] ?? ""}`}
            >
              {SEVERITY_LABEL[r.severity] ?? r.severity}
            </span>
            <span
              className={`rounded px-2 py-0.5 text-[11px] ${STATUS_BADGE[r.status] ?? ""}`}
            >
              {STATUS_LABEL[r.status] ?? r.status}
            </span>
            {isOwner && (
              <span className="hidden font-mono text-[11px] text-white/60 sm:inline">
                {r.reporter_role} · {r.page_path}
              </span>
            )}
            <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-sky-300">
              Buka laporan
              <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
