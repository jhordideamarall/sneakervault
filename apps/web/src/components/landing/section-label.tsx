import { cn } from "@sneakervault/ui";
import { MONO } from "./styles";

interface SectionLabelProps {
  children: React.ReactNode;
  className?: string;
}

/** Small mono eyebrow with a red dot — repeated above every section heading. */
export function SectionLabel({ children, className }: SectionLabelProps) {
  return (
    <div
      className={cn(
        MONO,
        "inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-neutral-500",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[#E5484D]" />
      {children}
    </div>
  );
}
