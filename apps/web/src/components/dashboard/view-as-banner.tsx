"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, X } from "lucide-react";
import { cn } from "@sneakervault/ui";
import { ROLES, ROLE_LABELS, type Role } from "@sneakervault/shared";
import { setViewAsRole } from "@/lib/actions/view-as";

// Owner is excluded — previewing "owner" = the full real view (reset).
const PREVIEW_ROLES: Role[] = ROLES.filter((r) => r !== "owner");

/**
 * Slim owner-only bar to preview the app as another division/role. Rendered by
 * the dashboard layout only when the REAL user is owner, so the owner can never
 * lock themselves out — Reset is always one click away.
 */
export function ViewAsBanner({ current }: { current: Role | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const previewing = current !== null;

  const pick = (role: Role | null) =>
    startTransition(async () => {
      await setViewAsRole(role);
      router.refresh();
    });

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 h-9 text-[11px] border-b shrink-0",
        previewing
          ? "bg-amber-500/[0.08] border-amber-500/20"
          : "bg-white/[0.02] border-white/[0.05]",
      )}
    >
      <span className="flex items-center gap-1.5 text-white/60 whitespace-nowrap">
        <Eye size={13} />
        {previewing ? "Melihat sebagai" : "Lihat sebagai"}
      </span>

      <div className="flex items-center gap-1 overflow-x-auto">
        {PREVIEW_ROLES.map((r) => (
          <button
            key={r}
            type="button"
            disabled={pending}
            onClick={() => pick(r)}
            className={cn(
              "rounded px-2 py-0.5 font-medium whitespace-nowrap transition-colors disabled:opacity-50",
              current === r
                ? "bg-amber-500/20 text-amber-200"
                : "text-white/60 hover:bg-white/[0.05] hover:text-white/85",
            )}
          >
            {ROLE_LABELS[r]}
          </button>
        ))}
      </div>

      {previewing && (
        <button
          type="button"
          disabled={pending}
          onClick={() => pick(null)}
          className="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-white/60 hover:bg-white/[0.06] hover:text-white whitespace-nowrap transition-colors disabled:opacity-50"
        >
          <X size={12} />
          Reset (Owner)
        </button>
      )}
    </div>
  );
}
