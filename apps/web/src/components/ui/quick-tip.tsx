"use client";

import { useState, useEffect } from "react";
import { Lightbulb, X, ChevronDown, ChevronUp } from "lucide-react";

type QuickTipTone = "info" | "warn" | "success";

const toneStyles: Record<QuickTipTone, { border: string; bg: string; icon: string; text: string }> = {
  info: {
    border: "border-sky-500/15",
    bg: "bg-sky-500/[0.04]",
    icon: "text-sky-300",
    text: "text-sky-100/80",
  },
  warn: {
    border: "border-amber-500/15",
    bg: "bg-amber-500/[0.04]",
    icon: "text-amber-300",
    text: "text-amber-100/80",
  },
  success: {
    border: "border-emerald-500/15",
    bg: "bg-emerald-500/[0.04]",
    icon: "text-emerald-300",
    text: "text-emerald-100/80",
  },
};

export function QuickTip({
  id,
  title,
  children,
  tone = "info",
  dismissible = true,
  defaultOpen = true,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  tone?: QuickTipTone;
  dismissible?: boolean;
  defaultOpen?: boolean;
}) {
  const storageKey = `qt:${id}`;
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(defaultOpen);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setMounted(true);
      if (typeof window === "undefined") return;
      try {
        const v = window.localStorage.getItem(storageKey);
        if (v === "dismissed") setDismissed(true);
        if (v === "collapsed") setExpanded(false);
      } catch {
        // ignore
      }
    });
  }, [storageKey]);

  if (!mounted) return null;
  if (dismissed) return null;

  const s = toneStyles[tone];

  function handleDismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(storageKey, "dismissed");
    } catch {
      // ignore
    }
  }

  function handleToggle() {
    const next = !expanded;
    setExpanded(next);
    try {
      window.localStorage.setItem(storageKey, next ? "open" : "collapsed");
    } catch {
      // ignore
    }
  }

  return (
    <div className={`rounded-lg border ${s.border} ${s.bg} px-4 py-3`}>
      <div className="flex items-start gap-3">
        <Lightbulb size={15} strokeWidth={1.9} className={`mt-0.5 flex-shrink-0 ${s.icon}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className={`text-xs font-semibold uppercase tracking-wider ${s.icon}`}>
              {title}
            </h4>
            <div className="flex items-center gap-1">
              <button
                onClick={handleToggle}
                className={`flex h-6 w-6 items-center justify-center rounded ${s.text} opacity-50 hover:opacity-100 transition-opacity`}
                aria-label={expanded ? "Tutup" : "Buka"}
              >
                {expanded ? (
                  <ChevronUp size={14} strokeWidth={1.9} />
                ) : (
                  <ChevronDown size={14} strokeWidth={1.9} />
                )}
              </button>
              {dismissible ? (
                <button
                  onClick={handleDismiss}
                  className={`flex h-6 w-6 items-center justify-center rounded ${s.text} opacity-50 hover:opacity-100 transition-opacity`}
                  aria-label="Tutup permanen"
                >
                  <X size={14} strokeWidth={1.9} />
                </button>
              ) : null}
            </div>
          </div>
          {expanded ? (
            <div className={`mt-1.5 text-[13px] leading-relaxed ${s.text}`}>
              {children}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
