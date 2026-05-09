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
        "block w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#1a1a2e] focus:border-[#0f3460] focus:outline-none focus:ring-1 focus:ring-[#0f3460] disabled:bg-gray-50 disabled:cursor-not-allowed",
        className
      )}
    >
      {children}
    </select>
  );
}
