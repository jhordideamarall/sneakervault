import { logout } from "@/lib/actions/auth";
import { Search, Bell } from "lucide-react";

const roleBadgeColors: Record<string, string> = {
  owner: "bg-emerald-50 text-emerald-600 border-emerald-200",
  admin_gudang: "bg-blue-50 text-blue-600 border-blue-200",
  admin_online: "bg-purple-50 text-purple-600 border-purple-200",
  shopkeeper: "bg-amber-50 text-amber-600 border-amber-200",
};

export function Topbar({ fullName, roles }: { fullName?: string; roles?: string[] }) {
  const primaryRole = roles?.[0] ?? "user";
  const roleLabel = primaryRole.replace("_", " ");

  return (
    <header className="flex h-16 items-center justify-between border-b border-white/[0.06] bg-[#0a0a14] px-8">
      {/* Search */}
      <div className="relative w-72">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          placeholder="Cari produk, order..."
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-2.5 pl-10 pr-4 text-sm text-white/80 placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.06] focus:outline-none transition-all duration-200"
        />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        <button className="relative rounded-xl p-2.5 text-white/30 hover:bg-white/[0.05] hover:text-white/60 transition-colors">
          <Bell size={18} />
        </button>
        <div className="h-6 w-px bg-white/[0.08]" />
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium text-white/80">{fullName ?? "User"}</p>
            <p className="text-[11px] capitalize text-white/30">{roleLabel}</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-xs font-bold text-white/70">
            {(fullName ?? "U").charAt(0).toUpperCase()}
          </div>
        </div>
      </div>
    </header>
  );
}
