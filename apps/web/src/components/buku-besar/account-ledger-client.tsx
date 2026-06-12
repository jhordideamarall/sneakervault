"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input, Select } from "@sneakervault/ui";
import { COA_TYPE_LABELS, COA_TYPE_TONES } from "@sneakervault/shared";
import type { AccountLedgerResult } from "@/lib/queries";
import { QuickTip } from "@/components/ui/quick-tip";
import { formatRupiahAccounting as fmtRupiah, formatDate as fmtDate } from "@/lib/format";
import {
  ArrowLeft,
  Calendar,
  ScrollText,
  CheckCircle2,
  XCircle,
  Search,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

const sourceLabel: Record<string, string> = {
  manual: "Penyesuaian",
  purchase_invoice: "Faktur Pembelian",
  vendor_payment: "Bayar Vendor",
  sales_invoice: "Invoice Penjualan",
  customer_payment: "Terima Customer",
  stock_adjustment: "Penyesuaian Stok",
  opening_balance: "Saldo Awal",
  closing: "Tutup Buku",
  other: "Lainnya",
};


export function AccountLedgerClient({
  result,
  initialFrom,
  initialTo,
}: {
  result: AccountLedgerResult;
  initialFrom: string;
  initialTo: string;
}) {
  const router = useRouter();
  const { account, opening_balance, closing_balance, total_debit, total_credit, entries } = result;

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (sourceFilter !== "all" && e.source_type !== sourceFilter) return false;
      if (!q) return true;
      return (
        e.entry_number.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        (e.line_description ?? "").toLowerCase().includes(q)
      );
    });
  }, [entries, search, sourceFilter]);

  const sources = useMemo(() => Array.from(new Set(entries.map((e) => e.source_type))), [entries]);

  function applyDateFilter() {
    const url = new URL(window.location.href);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    router.push(url.pathname + "?" + url.searchParams.toString());
  }

  if (!account) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-white/40">
        <Link href="/buku-besar/coa" className="flex items-center gap-1 hover:text-white/70 transition-colors">
          <ArrowLeft size={12} strokeWidth={1.9} />
          Kembali ke Chart of Accounts
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] text-white/80">
            <ScrollText size={20} strokeWidth={1.7} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-white/50">{account.code}</span>
              <span
                className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-medium ${COA_TYPE_TONES[account.type]}`}
              >
                {COA_TYPE_LABELS[account.type]}
              </span>
              <span
                className={`text-[10px] font-medium uppercase tracking-wider ${
                  account.normal_balance === "debit" ? "text-sky-300" : "text-violet-300"
                }`}
              >
                Saldo Normal: {account.normal_balance === "debit" ? "Debit" : "Kredit"}
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              {account.name}
            </h1>
            <p className="text-sm text-white/50">
              Buku Besar Pembantu · Rincian semua transaksi yang menyentuh akun ini
            </p>
          </div>
        </div>
      </div>

      <QuickTip
        id="buku-besar-account-ledger"
        title="Cara baca halaman ini"
        tone="info"
      >
        Setiap baris di tabel bawah adalah <strong>1 posting jurnal</strong> yang menyentuh akun{" "}
        <strong>{account.code} — {account.name}</strong>. Kolom <em>Saldo Berjalan</em> menampilkan
        saldo kumulatif akun setelah posting tersebut. Klik nomor jurnal untuk lihat full entry.
      </QuickTip>

      {/* Date filter */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-white/[0.06] bg-[#262626] p-3">
        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wider text-white/40">Dari</label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-[150px]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wider text-white/40">Sampai</label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-[150px]"
          />
        </div>
        <button
          onClick={applyDateFilter}
          className="h-9 rounded-md bg-white/[0.06] px-4 text-xs font-medium text-white hover:bg-white/[0.10] transition-colors"
        >
          Terapkan Periode
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Saldo Awal Periode" value={fmtRupiah(opening_balance)} />
        <StatTile
          label="Total Debit Periode"
          value={fmtRupiah(total_debit)}
          tone="sky"
          icon={<TrendingUp size={13} strokeWidth={1.9} />}
        />
        <StatTile
          label="Total Kredit Periode"
          value={fmtRupiah(total_credit)}
          tone="violet"
          icon={<TrendingDown size={13} strokeWidth={1.9} />}
        />
        <StatTile
          label="Saldo Akhir Periode"
          value={fmtRupiah(closing_balance)}
          tone={closing_balance >= 0 ? "emerald" : "red"}
          highlight
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/[0.06] bg-[#262626] p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            strokeWidth={1.8}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
          />
          <Input
            placeholder="Cari deskripsi atau nomor jurnal…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="min-w-[180px]"
        >
          <option value="all">Semua sumber</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {sourceLabel[s] ?? s}
            </option>
          ))}
        </Select>
      </div>

      {/* Ledger table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-[#262626] px-6 py-16 text-center">
          <ScrollText size={32} strokeWidth={1.5} className="mx-auto mb-4 text-white/30" />
          <h3 className="text-base font-medium text-white">Belum ada transaksi</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-white/50">
            Belum ada posting jurnal yang menyentuh akun ini pada periode terpilih.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-[#262626]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-white/40">
                <th className="px-4 py-3 font-medium">Tanggal</th>
                <th className="px-4 py-3 font-medium">No Jurnal</th>
                <th className="px-4 py-3 font-medium">Deskripsi</th>
                <th className="px-4 py-3 font-medium">Sumber</th>
                <th className="px-4 py-3 text-right font-medium">Debit</th>
                <th className="px-4 py-3 text-right font-medium">Kredit</th>
                <th className="px-4 py-3 text-right font-medium">Saldo Berjalan</th>
                <th className="px-4 py-3 text-center font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {/* Opening row */}
              <tr className="border-b border-white/[0.08] bg-white/[0.02]">
                <td colSpan={6} className="px-4 py-2.5 text-xs italic text-white/50">
                  Saldo awal periode ({fmtDate(initialFrom)})
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-white">
                  {fmtRupiah(opening_balance)}
                </td>
                <td />
              </tr>
              {filtered.map((e) => (
                <tr
                  key={e.line_id}
                  className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-3 text-white/70">
                    <div className="flex items-center gap-1">
                      <Calendar size={11} strokeWidth={1.8} />
                      {fmtDate(e.entry_date)}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-white/80">
                    {e.entry_number}
                  </td>
                  <td className="px-4 py-3 text-white/80">
                    <div>{e.description}</div>
                    {e.line_description ? (
                      <div className="text-[11px] text-white/40">{e.line_description}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className="inline-flex rounded bg-white/[0.04] px-2 py-0.5 text-white/60">
                      {sourceLabel[e.source_type] ?? e.source_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {e.debit > 0 ? (
                      <span className="text-sky-300">{fmtRupiah(e.debit)}</span>
                    ) : (
                      <span className="text-white/20">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {e.credit > 0 ? (
                      <span className="text-violet-300">{fmtRupiah(e.credit)}</span>
                    ) : (
                      <span className="text-white/20">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-white">
                    {fmtRupiah(e.running_balance)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {e.status === "posted" ? (
                      <CheckCircle2 size={14} strokeWidth={2} className="mx-auto text-emerald-300" />
                    ) : e.status === "reversed" ? (
                      <XCircle size={14} strokeWidth={2} className="mx-auto text-amber-300" />
                    ) : (
                      <span className="text-xs text-white/30">Draft</span>
                    )}
                  </td>
                </tr>
              ))}
              {/* Closing row */}
              <tr className="bg-emerald-500/[0.04]">
                <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-white">
                  Saldo Akhir Periode ({fmtDate(initialTo)})
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-sky-300">
                  {fmtRupiah(total_debit)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-violet-300">
                  {fmtRupiah(total_credit)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-base font-semibold text-emerald-300">
                  {fmtRupiah(closing_balance)}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  tone?: "sky" | "violet" | "emerald" | "red";
  icon?: React.ReactNode;
  highlight?: boolean;
}) {
  const t =
    tone === "sky"
      ? "text-sky-300"
      : tone === "violet"
        ? "text-violet-300"
        : tone === "emerald"
          ? "text-emerald-300"
          : tone === "red"
            ? "text-red-300"
            : "text-white";
  return (
    <div
      className={`rounded-lg border bg-[#262626] p-4 ${
        highlight ? "border-emerald-500/20" : "border-white/[0.06]"
      }`}
    >
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/40">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${t}`}>{value}</div>
    </div>
  );
}
