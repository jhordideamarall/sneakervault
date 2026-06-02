"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@sneakervault/ui";
import type { Role } from "@sneakervault/shared";
import { routePermissions } from "@/config/permissions";
import { logout } from "@/lib/actions/auth";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  ScrollText,
  BarChart3,
  PackagePlus,
  PackageMinus,
  DollarSign,
  RotateCcw,
  Truck,
  QrCode,
  Trash2,
  Settings,
  LogOut,
  ChevronRight,
  ClipboardList,
  Receipt,
  Wallet,
  BookOpen,
  FileBarChart,
  Landmark,
  Users,
  Building2,
  FileText,
  Banknote,
  Upload,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  Calculator,
  Database,
} from "lucide-react";
import { MailInbox } from "./mail/mail-inbox";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@sneakervault/ui";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
};

type NavGroup = {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: NavItem[];
  defaultOpen?: boolean;
};

const i = (Comp: React.ComponentType<{ size?: number; strokeWidth?: number }>) => (
  <Comp size={17} strokeWidth={1.7} />
);

const navGroups: NavGroup[] = [
  {
    id: "dasbor",
    label: "Dasbor",
    icon: i(LayoutDashboard),
    defaultOpen: true,
    items: [
      { href: "/workspace", label: "Workspace", icon: i(LayoutDashboard) },
      { href: "/overview", label: "Overview", icon: i(BarChart3) },
    ],
  },
  {
    id: "pembelian",
    label: "Pembelian",
    icon: i(ClipboardList),
    items: [
      { href: "/pembelian/purchase-order", label: "Purchase Order", icon: i(ClipboardList) },
      { href: "/pembelian/penerimaan", label: "Penerimaan Barang", icon: i(PackagePlus) },
      { href: "/pembelian/faktur", label: "Faktur Pembelian", icon: i(Receipt) },
      { href: "/pembelian/pembayaran", label: "Bayar Vendor", icon: i(Banknote) },
    ],
  },
  {
    id: "penjualan",
    label: "Penjualan",
    icon: i(ShoppingCart),
    items: [
      { href: "/orders", label: "Order Masuk", icon: i(ShoppingCart) },
      { href: "/penjualan/pos", label: "POS Kasir", icon: i(Calculator) },
      { href: "/penjualan/invoice", label: "Invoice Penjualan", icon: i(FileText) },
      { href: "/penjualan/penerimaan-kas", label: "Penerimaan Kas", icon: i(Wallet) },
      { href: "/penjualan/import-marketplace", label: "Import Marketplace", icon: i(Upload) },
      { href: "/sold", label: "Terjual", icon: i(DollarSign) },
    ],
  },
  {
    id: "gudang",
    label: "Gudang",
    icon: i(Package),
    items: [
      { href: "/inventory", label: "Inventori", icon: i(Package) },
      { href: "/inbound", label: "Barang Masuk", icon: i(QrCode) },
      { href: "/inventory/opname", label: "Stock Opname", icon: i(ClipboardList) },
      { href: "/outbound", label: "Packing / Outbound", icon: i(PackageMinus) },
      { href: "/returns", label: "Retur", icon: i(RotateCcw) },
    ],
  },
  {
    id: "kas-bank",
    label: "Kas & Bank",
    icon: i(Wallet),
    items: [
      { href: "/kas-bank/akun", label: "Akun Bank", icon: i(Landmark) },
      { href: "/kas-bank/penerimaan", label: "Penerimaan", icon: i(ArrowDownLeft) },
      { href: "/kas-bank/pengeluaran", label: "Pengeluaran", icon: i(ArrowUpRight) },
      { href: "/kas-bank/mutasi", label: "Semua Mutasi", icon: i(ScrollText) },
    ],
  },
  {
    id: "buku-besar",
    label: "Buku Besar",
    icon: i(BookOpen),
    items: [
      { href: "/buku-besar/coa", label: "Chart of Accounts", icon: i(BookOpen) },
      { href: "/buku-besar/journal", label: "Jurnal Penyesuaian", icon: i(ScrollText) },
      { href: "/buku-besar/periode", label: "Tutup Buku", icon: i(CalendarClock) },
    ],
  },
  {
    id: "laporan",
    label: "Laporan",
    icon: i(FileBarChart),
    items: [
      { href: "/reports", label: "Laporan Operasional", icon: i(BarChart3) },
      { href: "/laporan-keuangan/neraca", label: "Neraca", icon: i(FileBarChart) },
      { href: "/laporan-keuangan/laba-rugi", label: "Laba Rugi", icon: i(FileBarChart) },
      { href: "/laporan-keuangan/perubahan-ekuitas", label: "Perubahan Ekuitas", icon: i(FileBarChart) },
      { href: "/laporan-keuangan/arus-kas", label: "Arus Kas", icon: i(FileBarChart) },
    ],
  },
  {
    id: "master-data",
    label: "Master Data",
    icon: i(Building2),
    items: [
      { href: "/suppliers", label: "Supplier", icon: i(Truck) },
      { href: "/customers", label: "Customer", icon: i(Users) },
    ],
  },
  {
    id: "audit",
    label: "Audit & Pengaturan",
    icon: i(Settings),
    items: [
      { href: "/activity-log", label: "Activity Log", icon: i(ScrollText) },
      { href: "/delete-requests", label: "Req. Hapus", icon: i(Trash2) },
      { href: "/settings/data-sync", label: "Sinkronisasi Data", icon: i(Database) },
      { href: "/settings", label: "Pengaturan", icon: i(Settings) },
    ],
  },
];

const phaseBadgeStyles: Record<string, string> = {
  P2: "bg-sky-500/15 text-sky-300 border-sky-500/20",
  P3: "bg-violet-500/15 text-violet-300 border-violet-500/20",
  P4: "bg-amber-500/15 text-amber-300 border-amber-500/20",
};

function filterGroupsByRole(roles: Role[]): NavGroup[] {
  if (roles.includes("owner")) return navGroups;

  return navGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => {
        const allowed = routePermissions[it.href];
        if (!allowed) return true;
        return allowed.some((r) => roles.includes(r));
      }),
    }))
    .filter((g) => g.items.length > 0);
}

function activeGroupId(pathname: string, groups: NavGroup[]): string | null {
  for (const g of groups) {
    if (g.items.some((it) => pathname.startsWith(it.href))) return g.id;
  }
  return null;
}

// Shows a spinner on the menu item being navigated to, so a click gives instant
// feedback and users don't double-/spam-click while the next route loads.
function NavSpinner() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span className="size-3.5 flex-shrink-0 animate-spin rounded-full border-[1.5px] border-white/25 border-t-white/80 @max-[120px]:hidden" />
  );
}

export function Sidebar({
  roles,
  userId,
}: {
  roles: Role[];
  fullName?: string;
  userId: string;
}) {
  const pathname = usePathname();
  const groups = filterGroupsByRole(roles);
  const initiallyActive = activeGroupId(pathname, groups);
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () =>
      new Set(
        groups
          .filter((g) => g.defaultOpen || g.id === initiallyActive)
          .map((g) => g.id),
      ),
  );

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <aside className="flex h-full w-full flex-col md:flex overflow-hidden @container">
      <div className="px-6 @max-[120px]:px-0 pt-7 pb-6 overflow-hidden flex items-center @max-[120px]:justify-center min-h-[72px]">
        <span className="text-[15px] font-semibold tracking-tight text-white/90 truncate block @max-[120px]:hidden">
          Dewins.id
        </span>
        <span className="text-[15px] font-bold tracking-tighter text-white/90 hidden @max-[120px]:block">
          D.
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden">
        <ul className="space-y-1 px-2 pb-4">
          {groups.map((group) => {
            const isOpen = openGroups.has(group.id);
            const hasActive = group.items.some((it) =>
              pathname.startsWith(it.href),
            );

            return (
              <li key={group.id}>
                <button
                  onClick={() => toggleGroup(group.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-[12px] font-medium uppercase tracking-[0.08em] transition-colors @max-[120px]:justify-center @max-[120px]:px-0",
                    hasActive
                      ? "text-white/80"
                      : "text-white/35 hover:text-white/60",
                  )}
                >
                  <span className="flex-shrink-0">{group.icon}</span>
                  <span className="flex-1 text-left @max-[120px]:hidden">
                    {group.label}
                  </span>
                  <motion.span
                    animate={{ rotate: isOpen ? 90 : 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex-shrink-0 @max-[120px]:hidden"
                  >
                    <ChevronRight size={12} strokeWidth={2} />
                  </motion.span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen ? (
                    <motion.ul
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      {group.items.map((item) => {
                        const active = pathname === item.href || pathname.startsWith(item.href + "/");
                        return (
                          <li key={item.href}>
                            <Link href={item.href}>
                              <div
                                className={cn(
                                  "ml-2 mr-1 flex items-center gap-3 rounded-md px-3 py-2 text-[13px] transition-colors @max-[120px]:ml-0 @max-[120px]:mr-0 @max-[120px]:justify-center @max-[120px]:px-0",
                                  active
                                    ? "bg-white/[0.06] text-white font-medium"
                                    : "text-white/50 hover:bg-white/[0.03] hover:text-white/80",
                                )}
                              >
                                <span
                                  className={cn(
                                    "flex-shrink-0",
                                    active ? "text-white" : "text-white/40",
                                  )}
                                >
                                  {item.icon}
                                </span>
                                <span className="flex-1 truncate @max-[120px]:hidden">
                                  {item.label}
                                </span>
                                {item.badge ? (
                                  <span
                                    className={cn(
                                      "flex-shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold tracking-wider @max-[120px]:hidden",
                                      phaseBadgeStyles[item.badge] ??
                                        "bg-white/10 text-white/40 border-white/10",
                                    )}
                                  >
                                    {item.badge}
                                  </span>
                                ) : null}
                                <NavSpinner />
                              </div>
                            </Link>
                          </li>
                        );
                      })}
                    </motion.ul>
                  ) : null}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-white/[0.04] px-4 py-4 overflow-hidden">
        <div className="flex items-center gap-2 @max-[120px]:flex-col @max-[120px]:gap-4">
          <form action={logout} className="flex-1 @max-[120px]:w-full">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13px] text-white/40 hover:bg-white/[0.03] hover:text-white/70 transition-colors whitespace-nowrap @max-[120px]:px-0 @max-[120px]:justify-center"
                  >
                    <LogOut size={16} strokeWidth={1.7} className="flex-shrink-0" />
                    <span className="@max-[120px]:hidden">Keluar</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="hidden @max-[120px]:block">
                  Keluar
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </form>

          <div className="flex-shrink-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MailInbox userId={userId} />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="hidden @max-[120px]:block">
                  Pesan Internal (M)
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
    </aside>
  );
}
