import type { HTMLAttributes } from "react";
import { cn } from "./cn";

type Tone = "default" | "warning" | "info" | "success" | "danger" | "neutral";

const tones: Record<Tone, string> = {
  default: "bg-gray-100 text-gray-700",
  warning: "bg-yellow-100 text-yellow-800",
  info: "bg-blue-100 text-blue-800",
  success: "bg-green-100 text-green-800",
  danger: "bg-red-100 text-red-800",
  neutral: "bg-gray-100 text-gray-600",
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
