"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@sneakervault/ui";
import type { Role } from "@sneakervault/shared";
import { routePermissions } from "@/config/permissions";
import { logout } from "@/lib/actions/auth";
import {
  LayoutDashboard, ShoppingCart, Package, ScrollText, BarChart3,
  PackagePlus, PackageMinus, DollarSign, RotateCcw, Truck,
  QrCode, Trash2, Settings, LogOut, ChevronDown,
} from "lucide-react";
import { MailInbox } from "./mail/mail-inbox";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@sneakervault/ui";

type NavItem = { href: string; label: string; icon: React.ReactNode };

const allItems: NavItem[] = [
  { href: "/workspace", label: "Workspace", icon: <LayoutDashboard size={19} strokeWidth={1.7} /> },
  { href: "/overview", label: "Overview", icon: <BarChart3 size={19} strokeWidth={1.7} /> },
  { href: "/orders", label: "Orders", icon: <ShoppingCart size={19} strokeWidth={1.7} /> },
  { href: "/inventory", label: "Inventori", icon: <Package size={19} strokeWidth={1.7} /> },
  { href: "/activity-log", label: "Activity Log", icon: <ScrollText size={19} strokeWidth={1.7} /> },
  { href: "/reports", label: "Laporan", icon: <BarChart3 size={19} strokeWidth={1.7} /> },
  { href: "/inbound", label: "Barang Masuk", icon: <PackagePlus size={19} strokeWidth={1.7} /> },
  { href: "/outbound", label: "Packing", icon: <PackageMinus size={19} strokeWidth={1.7} /> },
  { href: "/sold", label: "Terjual", icon: <DollarSign size={19} strokeWidth={1.7} /> },
  { href: "/returns", label: "Retur", icon: <RotateCcw size={19} strokeWidth={1.7} /> },
  { href: "/suppliers", label: "Supplier", icon: <Truck size={19} strokeWidth={1.7} /> },
  { href: "/barcode-generate", label: "Barcode", icon: <QrCode size={19} strokeWidth={1.7} /> },
  { href: "/delete-requests", label: "Req. Hapus", icon: <Trash2 size={19} strokeWidth={1.7} /> },
  { href: "/settings", label: "Pengaturan", icon: <Settings size={19} strokeWidth={1.7} /> },
];

const primaryMenuByRole: Record<Role, string[]> = {
  owner: ["/workspace", "/overview", "/orders", "/inventory", "/activity-log", "/reports"],
  admin_gudang: ["/workspace", "/inbound", "/inventory", "/suppliers"],
  admin_online: ["/workspace", "/orders", "/returns", "/sold"],
  shopkeeper: ["/workspace", "/outbound", "/orders"],
};

function getPrimaryHrefs(roles: Role[]): string[] {
  const set = new Set<string>();
  for (const role of roles) {
    for (const href of primaryMenuByRole[role] ?? []) set.add(href);
  }
  return Array.from(set);
}

export function Sidebar({ roles, fullName, userId }: { roles: Role[]; fullName?: string; userId: string }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const visibleItems = allItems.filter((item) => {
    const allowed = routePermissions[item.href];
    if (!allowed) return true;
    return allowed.some((r) => roles.includes(r));
  });

  const primaryHrefs = getPrimaryHrefs(roles);
  const primaryItems = visibleItems.filter((i) => primaryHrefs.includes(i.href));
  const secondaryItems = visibleItems.filter((i) => !primaryHrefs.includes(i.href));

  return (
    <aside className="flex h-full w-full flex-col md:flex overflow-hidden @container">
      {/* Logo */}
      <div className="px-6 @max-[120px]:px-0 pt-8 pb-10 overflow-hidden flex items-center @max-[120px]:justify-center min-h-[88px]">
        <span className="text-[15px] font-semibold tracking-tight text-white/90 truncate block @max-[120px]:hidden">SneakerVault.</span>
        <span className="text-[15px] font-bold tracking-tighter text-white/90 hidden @max-[120px]:block">SV.</span>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden">
        <ul className="space-y-2">
          {primaryItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link href={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-5 px-6 @max-[120px]:px-0 @max-[120px]:justify-center py-3 text-[15px] transition-all duration-200 whitespace-nowrap",
                      active
                        ? "bg-[#1c1c1e] text-white font-medium"
                        : "text-white/40 hover:scale-[1.03]"
                    )}
                  >
                    <span className={cn("flex-shrink-0", active ? "text-white" : "text-white/30")}>{item.icon}</span>
                    <span className="@max-[120px]:hidden">{item.label}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Secondary */}
        {secondaryItems.length > 0 && (
          <div className="mt-10 overflow-hidden">
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className="flex w-full items-center gap-5 px-6 @max-[120px]:px-0 @max-[120px]:justify-center py-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/20 hover:text-white/40 transition-colors whitespace-nowrap"
            >
              <span className="@max-[120px]:hidden">Lainnya</span>
              <motion.div animate={{ rotate: moreOpen ? 180 : 0 }} transition={{ duration: 0.2 }} className="@max-[120px]:hidden flex-shrink-0">
                <ChevronDown size={10} />
              </motion.div>
              <div className="hidden @max-[120px]:block flex-shrink-0">
                <ChevronDown size={16} className="text-white/30" />
              </div>
            </button>
            <AnimatePresence>
              {moreOpen && (
                <motion.ul
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="mt-2 space-y-2 overflow-hidden"
                >
                  {secondaryItems.map((item) => {
                    const active = pathname.startsWith(item.href);
                    return (
                      <li key={item.href}>
                        <Link href={item.href}>
                          <div
                            className={cn(
                              "flex items-center gap-5 px-6 @max-[120px]:px-0 @max-[120px]:justify-center py-3 text-[15px] transition-all duration-200 whitespace-nowrap",
                              active
                                ? "bg-[#1c1c1e] text-white font-medium"
                                : "text-white/30 hover:scale-[1.03]"
                            )}
                          >
                            <span className="flex-shrink-0">{item.icon}</span>
                            <span className="@max-[120px]:hidden">{item.label}</span>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        )}
      </nav>

      {/* Logout & Mail */}
      <div className="border-t border-white/[0.04] px-4 py-5 overflow-hidden">
        <div className="flex items-center gap-2 @max-[120px]:flex-col @max-[120px]:gap-4">
          <form action={logout} className="flex-1 @max-[120px]:w-full">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="submit" className="flex items-center gap-4 px-3 @max-[120px]:px-0 @max-[120px]:justify-center py-2.5 text-[13px] text-white/30 hover:text-white/60 transition-colors whitespace-nowrap w-full group">
                    <LogOut size={18} strokeWidth={1.7} className="flex-shrink-0" />
                    <span className="@max-[120px]:hidden">Keluar</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="hidden @max-[120px]:block">Keluar</TooltipContent>
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
                <TooltipContent side="right" className="hidden @max-[120px]:block">Pesan Internal (M)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
    </aside>
  );
}
