import Link from "next/link";
import { cn } from "@sneakervault/ui";

interface WordmarkProps {
  className?: string;
  /** Render on a dark surface (inverts colors). */
  invert?: boolean;
}

/** Vault wordmark: a black tile with a white "V" + red accent, beside the name. */
export function Wordmark({ className, invert = false }: WordmarkProps) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "relative grid size-7 place-items-center rounded-[8px]",
          invert ? "bg-white" : "bg-neutral-950",
        )}
      >
        <span
          className={cn(
            "text-[13px] font-bold leading-none",
            invert ? "text-neutral-950" : "text-white",
          )}
        >
          V
        </span>
        <span className="absolute bottom-1 h-[2px] w-3 rounded-full bg-[#E5484D]" />
      </span>
      <span
        className={cn(
          "text-[15px] font-semibold tracking-tight",
          invert ? "text-white" : "text-neutral-950",
        )}
      >
        Vault
      </span>
    </Link>
  );
}
