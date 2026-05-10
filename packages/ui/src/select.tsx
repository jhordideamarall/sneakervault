import type { SelectHTMLAttributes } from "react";
import { cn } from "./cn";

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={cn(
        "block w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white/90 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200",
        className
      )}
    >
      {children}
    </select>
  );
}
