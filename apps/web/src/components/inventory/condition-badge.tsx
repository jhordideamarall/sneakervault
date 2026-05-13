"use client";

import { PRODUCT_CONDITIONS } from "@sneakervault/shared";
import type { ProductCondition } from "@sneakervault/shared";
import { cn } from "@sneakervault/ui";

const toneClasses: Record<string, string> = {
  neutral: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  danger: "bg-red-500/10 text-red-400 ring-red-500/20",
};

export function ConditionBadge({
  condition,
  className,
}: {
  condition: ProductCondition;
  className?: string;
}) {
  const meta = PRODUCT_CONDITIONS.find((c) => c.value === condition);
  if (!meta) return null;

  if (condition === "normal") {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
          toneClasses.neutral,
          className,
        )}
      >
        Normal
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
        toneClasses[meta.tone] ?? toneClasses.neutral,
        className,
      )}
      title={meta.description}
    >
      {meta.label}
    </span>
  );
}
