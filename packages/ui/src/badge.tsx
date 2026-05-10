import type { HTMLAttributes } from "react";
import { cn } from "./cn";

type Tone = "default" | "warning" | "info" | "success" | "danger" | "neutral";

const tones: Record<Tone, string> = {
  default: "bg-white/[0.08] text-white/70",
  warning: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  info: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  success: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  danger: "bg-red-500/10 text-red-400 border border-red-500/20",
  neutral: "bg-white/[0.04] text-white/40",
};

export function Badge({
  tone = "default",
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      {...rest}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className
      )}
    />
  );
}
