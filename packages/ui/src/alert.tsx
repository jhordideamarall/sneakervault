import type { HTMLAttributes } from "react";
import { cn } from "./cn";

type Tone = "info" | "warning" | "error" | "success";

const tones: Record<Tone, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-800",
  warning: "border-yellow-200 bg-yellow-50 text-yellow-800",
  error: "border-red-200 bg-red-50 text-red-800",
  success: "border-green-200 bg-green-50 text-green-800",
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
