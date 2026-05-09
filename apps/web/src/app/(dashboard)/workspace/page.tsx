import { getCurrentUser } from "@/lib/actions/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { primaryRole } from "@/lib/auth-helpers";
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">
          Selamat datang, {profile.full_name} 👋
        </h1>
        <p className="mt-1 text-sm text-muted">
          Role: <span className="font-medium capitalize">{role.replace("_", " ")}</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-white p-6 text-center transition-shadow hover:shadow-md"
          >
            <span className="text-3xl">{action.icon}</span>
            <span className="text-sm font-medium text-primary">{action.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
