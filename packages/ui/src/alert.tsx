import type { HTMLAttributes } from "react";
import { cn } from "./cn";

type Tone = "info" | "warning" | "error" | "success";

const tones: Record<Tone, string> = {
  info: "border-blue-500/20 bg-blue-500/5 text-blue-400",
  warning: "border-amber-500/20 bg-amber-500/5 text-amber-400",
  error: "border-red-500/20 bg-red-500/5 text-red-400",
  success: "border-emerald-500/20 bg-emerald-500/5 text-emerald-400",
};

export function Alert({
  tone = "info",
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { tone?: Tone }) {
  return (
    <div
      {...rest}
      className={cn("rounded-lg border px-4 py-3 text-sm", tones[tone], className)}
    />
  );
}
