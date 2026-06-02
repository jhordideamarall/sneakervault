"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Lock } from "lucide-react";
import { cn } from "@sneakervault/ui";
import { CONTAINER, MONO } from "./styles";
import { SectionLabel } from "./section-label";

const LOG_ROWS = [
  { who: "Rafi · Gudang", act: "Stok masuk", ref: "ADS-SAMBA-42 ×10", tag: null },
  { who: "Sari · Kasir", act: "Penjualan POS", ref: "INV-002391", tag: null },
  { who: "Dewi · Finance", act: "Void faktur", ref: "INV-002388", tag: "VOID" },
  { who: "Owner", act: "Tutup buku", ref: "Periode Mei 2026", tag: "LOCK" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Soft red glow + grid backdrop */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-10%] h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(229,72,77,0.10),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.025)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]" />
      </div>

      <div className={cn(CONTAINER, "grid gap-14 pb-20 pt-16 md:pb-28 md:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center")}>
        {/* Copy */}
        <div>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <SectionLabel>Sistem Operasi Bisnis Ritel</SectionLabel>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="mt-5 text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-neutral-950 sm:text-5xl md:text-6xl"
          >
            Stok, kasir, dan akuntansi —
            <br className="hidden sm:block" /> dalam satu sistem yang{" "}
            <span className="relative whitespace-nowrap text-[#E5484D]">
              tak bisa dicurangi
              <svg
                className="absolute -bottom-1 left-0 w-full"
                viewBox="0 0 300 12"
                fill="none"
                preserveAspectRatio="none"
                aria-hidden
              >
                <path d="M2 9 C 80 2, 220 2, 298 8" stroke="#E5484D" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </span>
            .
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12 }}
            className="mt-6 max-w-xl text-pretty text-base leading-7 text-neutral-600 md:text-lg"
          >
            Vault menyatukan inventory, POS, pembelian, penjualan online, kas & bank,
            dan akuntansi. Tiap transaksi otomatis menjurnal, tiap aksi terekam audit.
            Ganti alur Accurate yang terpisah dari stok.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18 }}
            className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <Link
              href="/login"
              className="group inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
            >
              Masuk ke sistem
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#fitur"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition-colors hover:border-neutral-400 hover:bg-neutral-50"
            >
              Lihat fitur
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.28 }}
            className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-neutral-500"
          >
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-[#E5484D]" /> Audit trail anti-fraud
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Lock className="size-4 text-[#E5484D]" /> Tutup buku terkunci
            </span>
          </motion.div>
        </div>

        {/* Product mock: live activity log */}
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          <div className="absolute -inset-4 -z-10 rounded-3xl bg-[radial-gradient(closest-side,rgba(229,72,77,0.08),transparent)]" />
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_24px_60px_-24px_rgba(0,0,0,0.25)]">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-[#E5484D]" />
                <span className="text-[13px] font-medium text-neutral-900">Activity Log</span>
              </div>
              <span className={cn(MONO, "text-[11px] uppercase tracking-widest text-neutral-400")}>
                Real-time
              </span>
            </div>
            <div className="divide-y divide-neutral-100">
              {LOG_ROWS.map((r, idx) => (
                <motion.div
                  key={r.ref}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.5 + idx * 0.12 }}
                  className="flex items-center justify-between gap-3 px-5 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-neutral-900">{r.act}</p>
                    <p className={cn(MONO, "mt-0.5 truncate text-[11px] text-neutral-400")}>{r.ref}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {r.tag ? (
                      <span
                        className={cn(
                          MONO,
                          "rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wider",
                          r.tag === "VOID"
                            ? "bg-[#E5484D]/10 text-[#E5484D]"
                            : "bg-neutral-900/5 text-neutral-600",
                        )}
                      >
                        {r.tag}
                      </span>
                    ) : null}
                    <span className="text-[11px] text-neutral-400">{r.who}</span>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50/60 px-5 py-3">
              <span className="text-[11px] text-neutral-500">Tak ada perubahan tanpa jejak.</span>
              <span className={cn(MONO, "text-[11px] text-neutral-400")}>148 hari ini</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
