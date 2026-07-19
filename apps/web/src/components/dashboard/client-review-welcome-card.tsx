"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileDown,
  Landmark,
  ListChecks,
  ReceiptText,
  Sparkles,
  X,
} from "lucide-react";
import { hasRouteAccess } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";

type WelcomeChange = {
  id: string;
  title: string;
  summary: string;
  icon: typeof ReceiptText;
  routes: { href: string; label: string }[];
};

const WELCOME_STORAGE_PREFIX =
  "sv:client-review-welcome:2026-07-19-ordered-delete-v2";

const CLIENT_REVIEW_CHANGES: WelcomeChange[] = [
  {
    id: "purchase-invoice-download",
    title: "Download faktur sekarang per invoice",
    summary:
      "Faktur pembelian bisa diunduh satu per satu untuk dikirim ke supplier atau customer.",
    icon: FileDown,
    routes: [{ href: "/pembelian/faktur", label: "Buka Faktur Pembelian" }],
  },
  {
    id: "sales-payment-shortcut",
    title: "Invoice penjualan langsung ke penerimaan",
    summary:
      "Dari invoice, user bisa lanjut ke penerimaan pembayaran tanpa buka menu satu per satu.",
    icon: ReceiptText,
    routes: [
      { href: "/penjualan/invoice", label: "Buka Invoice" },
      { href: "/penjualan/penerimaan-kas", label: "Buka Penerimaan" },
    ],
  },
  {
    id: "ordered-transaction-delete",
    title: "Hapus transaksi berurutan",
    summary:
      "Koreksi pembelian dan penjualan kini memakai hapus permanen dari tahap terakhir, dengan petunjuk transaksi penghambat.",
    icon: ListChecks,
    routes: [
      { href: "/pembelian/pembayaran", label: "Pembayaran Vendor" },
      { href: "/pembelian/faktur", label: "Faktur Pembelian" },
      { href: "/pembelian/penerimaan", label: "Penerimaan Barang" },
      { href: "/pembelian/purchase-order", label: "Pembelian Barang" },
      { href: "/penjualan/penerimaan-kas", label: "Penerimaan Customer" },
      { href: "/penjualan/invoice", label: "Invoice Penjualan" },
    ],
  },
  {
    id: "ledger-payroll-asset",
    title: "Buku besar, payroll, dan aset lebih lengkap",
    summary:
      "COA bisa dihapus jika aman, payroll bisa diedit, histori akun bisa diunduh, dan aset dapat diposting ke kas/bank.",
    icon: Landmark,
    routes: [
      { href: "/buku-besar/coa", label: "Buka COA" },
      { href: "/buku-besar/payroll", label: "Buka Payroll" },
      { href: "/aset", label: "Buka Aset" },
    ],
  },
  {
    id: "mandatory-reports",
    title: "Laporan wajib client sudah tersedia",
    summary:
      "Reports sekarang mencakup buku besar, jurnal, penjualan, kartu stock, serta utang piutang.",
    icon: CheckCircle2,
    routes: [{ href: "/reports", label: "Buka Reports" }],
  },
];

export function ClientReviewWelcomeCard({
  roles,
  userId,
}: {
  roles: Role[];
  userId: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [hidden, setHidden] = useState(false);
  const storageKey = `${WELCOME_STORAGE_PREFIX}:${userId}`;

  const visibleChanges = useMemo(
    () =>
      CLIENT_REVIEW_CHANGES.flatMap((change) => {
        const routes = change.routes.filter((route) =>
          hasRouteAccess(route.href, roles),
        );
        return routes.length ? [{ ...change, routes }] : [];
      }),
    [roles],
  );

  useEffect(() => {
    queueMicrotask(() => {
      setMounted(true);
      try {
        setHidden(window.localStorage.getItem(storageKey) === "dismissed");
      } catch {
        // localStorage can be unavailable in restricted browser modes.
      }
    });
  }, [storageKey]);

  if (!mounted || hidden || visibleChanges.length === 0) return null;

  const quickLinks = visibleChanges
    .flatMap((change) => change.routes)
    .filter(
      (route, index, allRoutes) =>
        allRoutes.findIndex((candidate) => candidate.href === route.href) ===
        index,
    )
    .slice(0, 4);

  function hideForNow() {
    setHidden(true);
  }

  function dismissPermanently() {
    setHidden(true);
    try {
      window.localStorage.setItem(storageKey, "dismissed");
    } catch {
      // ignore
    }
  }

  return (
    <section
      aria-label="Ringkasan revisi client terbaru"
      className="relative overflow-hidden rounded-2xl border border-emerald-300/15 bg-gradient-to-br from-emerald-300/[0.09] via-white/[0.025] to-sky-300/[0.07] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.18)]"
    >
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-emerald-300/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-10 h-52 w-52 rounded-full bg-sky-300/10 blur-3xl" />

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/80">
            <Sparkles size={13} strokeWidth={1.8} />
            Update revisi client
          </div>
          <h2 className="text-xl font-semibold leading-tight text-white">
            Welcome back, perubahan terakhir sudah live
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/62">
            Ringkasan ini membantu tim langsung mencoba fitur yang baru
            ditambahkan dari hasil review: pembelian, penjualan, buku besar,
            aset, payroll, dan reports.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={hideForNow}
            className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/60 transition hover:bg-white/[0.08] hover:text-white"
          >
            Tutup dulu
          </button>
          <button
            type="button"
            onClick={dismissPermanently}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/60 transition hover:bg-white/[0.08] hover:text-white"
            aria-label="Jangan tampilkan welcome card revisi ini lagi"
          >
            <X size={13} strokeWidth={1.9} />
            Jangan tampilkan lagi
          </button>
        </div>
      </div>

      <div className="relative mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {visibleChanges.map((change) => {
          const Icon = change.icon;
          return (
            <div
              key={change.id}
              className="rounded-xl border border-white/[0.07] bg-black/[0.12] p-4"
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.06] text-emerald-200">
                <Icon size={17} strokeWidth={1.85} />
              </div>
              <h3 className="text-sm font-semibold leading-snug text-white">
                {change.title}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-white/52">
                {change.summary}
              </p>
            </div>
          );
        })}
      </div>

      {quickLinks.length ? (
        <div className="relative mt-5 flex flex-wrap items-center gap-2">
          {quickLinks.map((route) => (
            <Link
              key={route.href}
              href={route.href}
              className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white/72 transition hover:bg-white/[0.1] hover:text-white"
            >
              {route.label}
              <ArrowRight size={13} strokeWidth={1.9} />
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
