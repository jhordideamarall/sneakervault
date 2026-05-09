import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "success";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-white/[0.1] text-white border border-white/[0.08] hover:bg-white/[0.15]",
  secondary: "bg-white/[0.04] border border-white/[0.08] text-white/70 hover:bg-white/[0.08]",
  danger: "bg-red-500/20 text-red-400 border border-red-500/20 hover:bg-red-500/30",
  ghost: "bg-transparent text-white/50 hover:bg-white/[0.05] hover:text-white/80",
  success: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/30",
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]",
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </button>
  );
}
