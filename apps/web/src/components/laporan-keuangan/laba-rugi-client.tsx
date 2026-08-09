"use client";

import { useMemo, useState } from "react";
import { Input, Button } from "@sneakervault/ui";
import type { AccountBalance } from "@/lib/queries";
import { useRouter } from "next/navigation";
import { FileBarChart, TrendingUp, TrendingDown, Printer, Download } from "lucide-react";
import { exportToPDF, exportToExcel, type ReportSection } from "@/lib/export";
import { QuickTip } from "@/components/ui/quick-tip";
import { formatRupiahAccounting as fmtRupiah } from "@/lib/format";

function sumLeaves(accounts: AccountBalance[]): number {
  const idsWithChildren = new Set(
    accounts.map((a) => a.parent_id).filter(Boolean) as string[],
  );
  return accounts
    .filter((a) => !idsWithChildren.has(a.account_id))
    .reduce((sum, a) => sum + a.balance, 0);
}

function Section({
  title,
  accounts,
  tone,
}: {
  title: string;
  accounts: AccountBalance[];
  tone: "revenue" | "expense";
}) {
  const total = sumLeaves(accounts);
  const idsWithChildren = new Set(
    accounts.map((a) => a.parent_id).filter(Boolean) as string[],
  );
  const sorted = [...accounts].sort((a, b) => a.code.localeCompare(b.code));

  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#262626]">
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#1f1f1f] px-4 py-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
          {tone === "revenue" ? (
            <TrendingUp size={14} strokeWidth={1.8} className="text-emerald-300" />
          ) : (
            <TrendingDown size={14} strokeWidth={1.8} className="text-amber-300" />
          )}
          {title}
        </h3>
        <span
          className={`text-base font-semibold tabular-nums ${tone === "revenue" ? "text-emerald-300" : "text-amber-300"}`}
        >
          {fmtRupiah(total)}
        </span>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {sorted.map((a) => {
            const isParent = idsWithChildren.has(a.account_id);
            const depth = (a.code.match(/\./g) ?? []).length;
            return (
              <tr key={a.account_id} className="border-b border-white/[0.04] last:border-0">
                <td className="px-4 py-2 font-mono text-xs text-white/50">
                  {a.code}
                </td>
                <td
                  className={`px-2 py-2 ${isParent ? "font-medium text-white" : "text-white/70"}`}
                  style={{ paddingLeft: `${depth * 12 + 8}px` }}
                >
                  {a.name}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {isParent ? (
                    <span className="text-white/30">—</span>
                  ) : (
                    <span className="text-white">{fmtRupiah(a.balance)}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LabaRugiClient({
  initialBalances,
  initialFrom,
  initialTo,
}: {
  initialBalances: AccountBalance[];
  initialFrom: string;
  initialTo: string;
}) {
  const router = useRouter();
  const [fromDate, setFromDate] = useState(initialFrom);
  const [toDate, setToDate] = useState(initialTo);

  const revenues = useMemo(
    () => initialBalances.filter((a) => a.type === "revenue"),
    [initialBalances],
  );
  const cogs = useMemo(
    () => initialBalances.filter((a) => a.type === "cogs"),
    [initialBalances],
  );
  const expenses = useMemo(
    () => initialBalances.filter((a) => a.type === "expense"),
    [initialBalances],
  );

  const totalRevenue = useMemo(() => sumLeaves(revenues), [revenues]);
  const totalCogs = useMemo(() => sumLeaves(cogs), [cogs]);
  const totalExpense = useMemo(() => sumLeaves(expenses), [expenses]);
  const grossProfit = totalRevenue - totalCogs;
  const netIncome = grossProfit - totalExpense;
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  const netMargin = totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0;

  function reload() {
    router.push(`/laporan-keuangan/laba-rugi?from=${fromDate}&to=${toDate}`);
  }

  async function handleExport(format: "pdf" | "excel") {
    const mapToRows = (accounts: AccountBalance[]) => {
      const idsWithChildren = new Set(accounts.map((a) => a.parent_id).filter(Boolean) as string[]);
      return accounts.map((a, i) => [
        i + 1,
        a.code,
        a.name,
        idsWithChildren.has(a.account_id) ? "—" : a.balance
      ]);
    };

    const sections: ReportSection[] = [
      {
        title: "PENDAPATAN",
        columns: ["No", "Kode", "Nama Akun", "Saldo (Rp)"],
        rows: mapToRows(revenues),
        summary: [{ label: "Total Pendapatan", value: fmtRupiah(totalRevenue) }]
      },
      {
        title: "HARGA POKOK PENJUALAN",
        columns: ["No", "Kode", "Nama Akun", "Saldo (Rp)"],
        rows: mapToRows(cogs),
        summary: [{ label: "Total HPP", value: fmtRupiah(totalCogs) }]
      },
      {
        title: "BEBAN OPERASIONAL",
        columns: ["No", "Kode", "Nama Akun", "Saldo (Rp)"],
        rows: mapToRows(expenses),
        summary: [{ label: "Total Beban", value: fmtRupiah(totalExpense) }]
      }
    ];

    const params = {
      title: "Laporan Laba Rugi",
      period: `${new Date(fromDate).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })} — ${new Date(toDate).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}`,
      sections,
      summary: [
        { label: "Pendapatan", value: fmtRupiah(totalRevenue) },
        { label: "Laba Kotor", value: fmtRupiah(grossProfit) },
        { label: "Laba Bersih", value: fmtRupiah(netIncome) }
      ],
      filename: `LabaRugi-${fromDate}-to-${toDate}.pdf`
    };

    if (format === "pdf") {
      await exportToPDF(params);
    } else {
      await exportToExcel({ ...params, filename: `LabaRugi-${fromDate}-to-${toDate}.xlsx` });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] text-white/80">
            <FileBarChart size={20} strokeWidth={1.7} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Laporan Laba Rugi
            </h1>
            <p className="text-sm text-white/50">
              Periode{" "}
              {new Date(fromDate).toLocaleDateString("id-ID", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}{" "}
              —{" "}
              {new Date(toDate).toLocaleDateString("id-ID", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            aria-label="Tanggal mulai laporan laba rugi"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <span className="text-white/40">→</span>
          <Input
            aria-label="Tanggal selesai laporan laba rugi"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
          <Button onClick={reload} variant="ghost">
            Update
          </Button>
          <div className="h-8 w-px bg-white/10 mx-1" />
          <Button variant="secondary" size="sm" onClick={() => handleExport("pdf")}>
            <Printer size={14} className="mr-1.5" /> PDF
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleExport("excel")}>
            <Download size={14} className="mr-1.5" /> Excel
          </Button>
        </div>
      </div>

      <QuickTip
        id="laporan-laba-rugi-intro"
        title="Cara baca Laporan Laba Rugi"
        tone="info"
      >
        Rumus: <strong>Laba Kotor = Pendapatan − HPP</strong> · <strong>Laba Bersih = Laba Kotor − Beban Operasional</strong>.
        Periode bisa diubah lewat date picker di atas. Pendapatan dipecah per kanal (Shopee/TikTok/WA/Offline) jika ada di periode tersebut.
        Klik <em>PDF</em> / <em>Excel</em> untuk export.
      </QuickTip>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Summary label="Pendapatan" value={totalRevenue} tone="emerald" />
        <Summary label="HPP" value={totalCogs} tone="amber" />
        <Summary
          label="Laba Kotor"
          value={grossProfit}
          subValue={`Margin ${grossMargin.toFixed(1)}%`}
          tone={grossProfit >= 0 ? "emerald" : "red"}
        />
        <Summary
          label="Laba Bersih"
          value={netIncome}
          subValue={`Margin ${netMargin.toFixed(1)}%`}
          tone={netIncome >= 0 ? "emerald" : "red"}
          big
        />
      </div>

      <Section title="PENDAPATAN" accounts={revenues} tone="revenue" />
      <Section title="HARGA POKOK PENJUALAN" accounts={cogs} tone="expense" />

      <div className="rounded-lg border border-white/[0.06] bg-gradient-to-br from-emerald-500/[0.04] to-sky-500/[0.04] p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-white">LABA KOTOR</span>
          <span
            className={`text-lg font-semibold tabular-nums ${grossProfit >= 0 ? "text-emerald-300" : "text-red-300"}`}
          >
            {fmtRupiah(grossProfit)}
          </span>
        </div>
        {totalRevenue > 0 ? (
          <div className="mt-1 text-xs text-white/40">
            {grossMargin.toFixed(1)}% dari pendapatan
          </div>
        ) : null}
      </div>

      <Section title="BEBAN OPERASIONAL" accounts={expenses} tone="expense" />

      <div
        className={`rounded-lg border p-5 ${
          netIncome >= 0
            ? "border-emerald-500/20 bg-emerald-500/[0.06]"
            : "border-red-500/20 bg-red-500/[0.06]"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-white/60">
              {netIncome >= 0 ? "LABA BERSIH" : "RUGI BERSIH"}
            </div>
            <div className="mt-0.5 text-xs text-white/40">
              Pendapatan − HPP − Beban Operasional
            </div>
          </div>
          <div className="text-right">
            <div
              className={`text-3xl font-bold tabular-nums ${netIncome >= 0 ? "text-emerald-300" : "text-red-300"}`}
            >
              {fmtRupiah(netIncome)}
            </div>
            {totalRevenue > 0 ? (
              <div className="text-xs text-white/50">
                Net margin {netMargin.toFixed(1)}%
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Summary({
  label,
  value,
  subValue,
  tone,
  big,
}: {
  label: string;
  value: number;
  subValue?: string;
  tone: "emerald" | "amber" | "red";
  big?: boolean;
}) {
  const t =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "amber"
        ? "text-amber-300"
        : "text-red-300";
  return (
    <div
      className={`rounded-lg border p-4 ${
        big
          ? "border-white/[0.12] bg-gradient-to-br from-emerald-500/[0.04] to-sky-500/[0.04]"
          : "border-white/[0.06] bg-[#262626]"
      }`}
    >
      <div className="text-[11px] uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div className={`mt-1 ${big ? "text-2xl" : "text-xl"} font-semibold tabular-nums ${t}`}>
        {fmtRupiah(value)}
      </div>
      {subValue ? (
        <div className={`mt-0.5 text-xs ${t}`}>{subValue}</div>
      ) : null}
    </div>
  );
}
