import { getCurrentUser } from "@/lib/actions/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, LogOut } from "lucide-react";
import { logout } from "@/lib/actions/auth";
import { canSeeFinancialDashboard } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";

export default async function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const roles = (profile.roles ?? []) as Role[];
  if (!canSeeFinancialDashboard(roles)) {
    redirect("/workspace");
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#1F1F1E]">
      {/* Minimal topbar — just back nav + user + logout */}
      <header className="flex-shrink-0 border-b border-white/[0.04] bg-[#1F1F1E]">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-8 py-4">
          <Link
            href="/workspace"
            className="inline-flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white/80"
          >
            <ArrowLeft size={16} />
            Kembali ke Workspace
          </Link>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-white">{profile.full_name}</p>
              <p className="text-[11px] capitalize text-white/40">
                {roles.includes("owner") ? "Owner" : "Finance"}
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-xs font-bold text-white/70">
              {(profile.full_name ?? "U").charAt(0).toUpperCase()}
            </div>
            <form action={logout}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-white/50 transition-all hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white/80"
                title="Keluar"
              >
                <LogOut size={13} />
                Keluar
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-8 py-10">{children}</div>
      </main>
    </div>
  );
}
