import Link from "next/link";
import { ArrowLeft, Sparkles, CheckCircle2, Clock } from "lucide-react";
import type { ReactNode } from "react";

export interface ModuleSkeletonProps {
  title: string;
  description: string;
  icon: ReactNode;
  phase: "Phase 2" | "Phase 3" | "Phase 4";
  eta: string;
  features: string[];
  benefits?: string[];
  backHref?: string;
  backLabel?: string;
}

const phaseColors: Record<ModuleSkeletonProps["phase"], string> = {
  "Phase 2": "text-sky-300 bg-sky-500/10 border-sky-500/20",
  "Phase 3": "text-violet-300 bg-violet-500/10 border-violet-500/20",
  "Phase 4": "text-amber-300 bg-amber-500/10 border-amber-500/20",
};

export function ModuleSkeleton({
  title,
  description,
  icon,
  phase,
  eta,
  features,
  benefits,
  backHref = "/workspace",
  backLabel = "Kembali ke Workspace",
}: ModuleSkeletonProps) {
  return (
    <div className="space-y-8">
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-sm text-white/40 transition-colors hover:text-white/80"
      >
        <ArrowLeft size={14} strokeWidth={1.8} />
        {backLabel}
      </Link>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/[0.04] text-white/80">
            {icon}
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              {title}
            </h1>
            <p className="text-sm text-white/50">{description}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-[#262626] p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04]">
            <Sparkles size={18} strokeWidth={1.8} className="text-white/70" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${phaseColors[phase]}`}
              >
                <Clock size={11} strokeWidth={2.2} />
                {phase}
              </span>
              <span className="text-xs text-white/40">{eta}</span>
            </div>
            <p className="text-sm text-white/80">
              Modul ini sedang dipersiapkan dan akan segera tersedia.
            </p>
            <p className="text-xs text-white/40">
              Struktur menu sudah lengkap supaya tim bisa mempelajari alur kerja
              sistem dari sekarang.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-white/[0.06] bg-[#262626] p-6">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/40">
            Fitur yang akan hadir
          </h2>
          <ul className="space-y-3">
            {features.map((feat) => (
              <li key={feat} className="flex items-start gap-3 text-sm">
                <CheckCircle2
                  size={16}
                  strokeWidth={1.8}
                  className="mt-0.5 flex-shrink-0 text-emerald-400/70"
                />
                <span className="text-white/80">{feat}</span>
              </li>
            ))}
          </ul>
        </section>

        {benefits && benefits.length > 0 ? (
          <section className="rounded-xl border border-white/[0.06] bg-[#262626] p-6">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/40">
              Manfaat untuk operasional
            </h2>
            <ul className="space-y-3">
              {benefits.map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm">
                  <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-white/40" />
                  <span className="text-white/70">{b}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
