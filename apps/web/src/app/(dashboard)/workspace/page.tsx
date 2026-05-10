import { getCurrentUser } from "@/lib/actions/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { primaryRole } from "@/lib/auth-helpers";
import { Greeting } from "@/components/dashboard/greeting";
import { WorkspaceSubtitle } from "@/components/dashboard/workspace-subtitle";
import type { Role } from "@sneakervault/shared";

const quickActions: Record<Role, { href: string; label: string; icon: string }[]> = {
  owner: [
    { href: "/overview", label: "Lihat Dashboard", icon: "📊" },
    { href: "/inventory", label: "Cek Stok", icon: "📦" },
    { href: "/reports", label: "Laporan", icon: "📈" },
    { href: "/settings", label: "Kelola User", icon: "⚙️" },
  ],
  admin_gudang: [
    { href: "/inbound", label: "Scan Barang Masuk", icon: "📥" },
    { href: "/inventory", label: "Cek Stok", icon: "📦" },
    { href: "/suppliers", label: "Supplier", icon: "🏭" },
    { href: "/returns", label: "Verifikasi Retur", icon: "🔄" },
  ],
  admin_online: [
    { href: "/orders", label: "Update Status Order", icon: "🛒" },
    { href: "/returns", label: "Proses Retur", icon: "🔄" },
    { href: "/sold", label: "Riwayat Terjual", icon: "💰" },
    { href: "/inventory", label: "Cek Stok", icon: "📦" },
  ],
  shopkeeper: [
    { href: "/outbound", label: "Buat Sesi Packing", icon: "📤" },
    { href: "/orders", label: "Lihat Orders", icon: "🛒" },
    { href: "/inventory", label: "Cek Stok", icon: "📦" },
  ],
};

export default async function WorkspacePage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const role = primaryRole(profile.roles);
  const actions = quickActions[role];

  return (
    <div className="space-y-8">
      <div>
        <Greeting name={profile.full_name} />
        <WorkspaceSubtitle role={role} userId={profile.id} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-center transition-all hover:bg-white/[0.05] hover:border-white/[0.12]"
          >
            <span className="text-3xl">{action.icon}</span>
            <span className="text-sm font-medium text-white/80">{action.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
