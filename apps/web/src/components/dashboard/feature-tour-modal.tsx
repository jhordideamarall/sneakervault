"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  cn,
} from "@sneakervault/ui";
import { dismissFeatureTour } from "@/lib/actions/feature-tour";
import type { VisibleFeatureTourStep } from "@/lib/feature-tour";

export function FeatureTourModal({
  tourKey,
  steps,
}: {
  tourKey: string;
  steps: VisibleFeatureTourStep[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (steps.length === 0) return null;

  const current = steps[Math.min(index, steps.length - 1)]!;
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  function skipForNow() {
    setOpen(false);
  }

  function goToFeature() {
    setOpen(false);
    router.push(current.ctaHref);
  }

  function dismissPermanently() {
    setError(null);
    startTransition(async () => {
      const result = await dismissFeatureTour(tourKey);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(next) : skipForNow())}>
      <DialogContent
        aria-describedby="feature-tour-description"
        className="max-w-2xl border-white/[0.08] bg-[#171717] p-0"
      >
        <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
          <DialogHeader className="pr-10">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200/80">
              <Sparkles size={14} strokeWidth={1.8} />
              Fitur baru Dewinst
            </div>
            <DialogTitle className="text-xl leading-tight">
              Highlight revisi terbaru
            </DialogTitle>
            <DialogDescription id="feature-tour-description">
              Ringkasan singkat fitur tambahan yang sudah siap dipakai sesuai
              akses akunmu.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="grid gap-0 md:grid-cols-[180px_1fr]">
          <aside className="border-b border-white/[0.06] bg-white/[0.02] p-4 md:border-b-0 md:border-r">
            <div className="mb-3 text-xs font-medium text-white/65">
              Langkah {index + 1} dari {steps.length}
            </div>
            <div className="space-y-2">
              {steps.map((step, stepIndex) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setIndex(stepIndex)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition-colors",
                    stepIndex === index
                      ? "bg-white/[0.08] text-white"
                      : "text-white/65 hover:bg-white/[0.04] hover:text-white/90",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                      stepIndex === index
                        ? "border-amber-300/40 bg-amber-300/15 text-amber-100"
                        : "border-white/[0.08] text-white/65",
                    )}
                  >
                    {stepIndex + 1}
                  </span>
                  <span className="line-clamp-2">{step.eyebrow}</span>
                </button>
              ))}
            </div>
          </aside>

          <section className="p-5 sm:p-6" aria-live="polite">
            <div className="mb-4 inline-flex rounded-full border border-amber-300/15 bg-amber-300/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-100/80">
              {current.eyebrow}
            </div>
            <h3 className="max-w-xl text-2xl font-semibold leading-tight text-white">
              {current.title}
            </h3>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/58">
              {current.summary}
            </p>

            <div className="mt-5 space-y-3">
              {current.bullets.map((bullet) => (
                <div key={bullet} className="flex gap-3 text-sm text-white/72">
                  <CheckCircle2
                    size={16}
                    strokeWidth={1.8}
                    className="mt-0.5 shrink-0 text-emerald-300"
                    aria-hidden="true"
                  />
                  <span className="leading-relaxed">{bullet}</span>
                </div>
              ))}
            </div>

            {error ? (
              <p className="mt-5 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                Gagal menyimpan pilihan: {error}
              </p>
            ) : null}
          </section>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={isFirst || pending}
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
            >
              <ArrowLeft size={15} />
              Kembali
            </Button>
            <Button
              type="button"
              variant={isLast ? "primary" : "secondary"}
              disabled={pending}
              onClick={() =>
                isLast
                  ? skipForNow()
                  : setIndex((value) => Math.min(steps.length - 1, value + 1))
              }
            >
              {isLast ? "Selesai" : "Lanjut"}
              {!isLast ? <ArrowRight size={15} /> : null}
            </Button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={skipForNow}
            >
              Lewati dulu
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={dismissPermanently}
            >
              {pending ? "Menyimpan..." : "Jangan munculkan lagi"}
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={goToFeature}
            >
              {current.ctaLabel}
              <ExternalLink size={14} />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
