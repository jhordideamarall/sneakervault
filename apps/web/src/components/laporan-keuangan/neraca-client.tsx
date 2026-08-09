"use client";

import { useMemo, useState } from "react";
import { Input, Button } from "@sneakervault/ui";
import type { AccountBalance } from "@/lib/queries";
import { useRouter } from "next/navigation";
import { FileBarChart, Calendar, Download, Printer } from "lucide-react";
import { exportToPDF, exportToExcel, type ReportSection } from "@/lib/export";
import { QuickTip } from "@/components/ui/quick-tip";
import { formatRupiahAccounting as fmtRupiah } from "@/lib/format";

type GroupSection = {
  title: string;
  types: AccountBalance["type"][];
};

const ASSET_SECTION: GroupSection = { title: "ASET", types: ["asset"] };
const LIAB_SECTION: GroupSection = { title: "LIABILITAS", types: ["liability"] };
const EQUITY_SECTION: GroupSection = { title: "EKUITAS", types: ["equity"] };

function buildTree(
  accounts: AccountBalance[],
  types: AccountBalance["type"][],
): AccountBalance[] {
  return accounts
    .filter((a) => types.includes(a.type))
    .sort((a, b) => a.code.localeCompare(b.code));
}

function sumLeaves(accounts: AccountBalance[]): number {
  // Sum only leaf accounts (no children) to avoid double counting
  const idsWithChildren = new Set(
    accounts.map((a) => a.parent_id).filter(Boolean) as string[],
  );
  return accounts
    .filter((a) => !idsWithChildren.has(a.account_id))
    .reduce((sum, a) => sum + a.balance, 0);
}

function SectionTable({
  section,
  accounts,
}: {
  section: GroupSection;
  accounts: AccountBalance[];
}) {
  const filtered = buildTree(accounts, section.types);
  const total = sumLeaves(filtered);
  const idsWithChildren = new Set(
    filtered.map((a) => a.parent_id).filter(Boolean) as string[],
  );

  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#262626]">
      <div className="border-b border-white/[0.06] bg-[#1f1f1f] px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60">
            {section.title}
          </h3>
          <span className="text-base font-semibold tabular-nums text-white">
            {fmtRupiah(total)}
          </span>
        </div>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {filtered.map((a) => {
            const isParent = idsWithChildren.has(a.account_id);
            const depth = (a.code.match(/\./g) ?? []).length;
            return (
              <tr
                key={a.account_id}
                className="border-b border-white/[0.04] last:border-0"
              >
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
                    <span className={a.balance < 0 ? "text-red-300" : "text-white"}>
                      {fmtRupiah(a.balance)}
                    </span>
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

export function NeracaClient({
  initialBalances,
  initialTo,
  initialNetIncome,
}: {
  initialBalances: AccountBalance[];
  initialTo: string;
  initialNetIncome: number;
}) {
  const router = useRouter();
  const [toDate, setToDate] = useState(initialTo);

  const totalAsset = useMemo(
    () => sumLeaves(buildTree(initialBalances, ASSET_SECTION.types)),
    [initialBalances],
  );
  const totalLiab = useMemo(
    () => sumLeaves(buildTree(initialBalances, LIAB_SECTION.types)),
    [initialBalances],
  );
  const totalEquity = useMemo(
    () => sumLeaves(buildTree(initialBalances, EQUITY_SECTION.types)),
    [initialBalances],
  );

  // Must equal YTD P&L for the same year and selected closing date.
  const netIncome = initialNetIncome;

  const totalEquityWithIncome = totalEquity + netIncome;
  const totalLiabEquity = totalLiab + totalEquityWithIncome;
  const isBalanced = Math.abs(totalAsset - totalLiabEquity) < 1;

  function reload() {
    router.push(`/laporan-keuangan/neraca?to=${toDate}`);
  }

  async function handleExport(format: "pdf" | "excel") {
    const assetFiltered = buildTree(initialBalances, ASSET_SECTION.types);
    const liabFiltered = buildTree(initialBalances, LIAB_SECTION.types);
    const equityFiltered = buildTree(initialBalances, EQUITY_SECTION.types);

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
        title: "ASET",
        columns: ["No", "Kode", "Nama Akun", "Saldo (Rp)"],
        rows: mapToRows(assetFiltered),
        summary: [{ label: "Total Aset", value: fmtRupiah(totalAsset) }]
      },
      {
        title: "LIABILITAS",
        columns: ["No", "Kode", "Nama Akun", "Saldo (Rp)"],
        rows: mapToRows(liabFiltered),
        summary: [{ label: "Total Liabilitas", value: fmtRupiah(totalLiab) }]
      },
      {
        title: "EKUITAS",
        columns: ["No", "Kode", "Nama Akun", "Saldo (Rp)"],
        rows: [
          ...mapToRows(equityFiltered),
          ["", "", "Laba Tahun Berjalan", netIncome]
        ],
        summary: [{ label: "Total Ekuitas", value: fmtRupiah(totalEquityWithIncome) }]
      }
    ];

    const params = {
      title: "Laporan Neraca",
      period: `Per tanggal ${new Date(toDate).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}`,
      sections,
      filename: `Neraca-${toDate}.pdf`
    };

    if (format === "pdf") {
      await exportToPDF(params);
    } else {
      await exportToExcel({ ...params, filename: `Neraca-${toDate}.xlsx` });
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
              Neraca
            </h1>
            <p className="text-sm text-white/50">
              Posisi keuangan pada tanggal{" "}
              {new Date(toDate).toLocaleDateString("id-ID", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={14} strokeWidth={1.8} className="text-white/40" />
          <Input
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
        id="laporan-neraca-intro"
        title="Cara baca Neraca"
        tone="info"
      >
        Neraca menampilkan posisi keuangan pada <strong>satu tanggal</strong>. Aturan dasar:{" "}
        <strong>Total Aset = Total Liabilitas + Total Ekuitas</strong>. Banner balance otomatis
        muncul kalau sisi kiri ≠ sisi kanan (kalau merah, cek jurnal Anda). Klik <em>PDF</em>{" "}
        atau <em>Excel</em> untuk export — siap kirim ke jasa pajak / auditor.
      </QuickTip>

      <div
        className={`rounded-xl border p-4 ${
          isBalanced
            ? "border-emerald-500/15 bg-emerald-500/[0.04]"
            : "border-red-500/15 bg-red-500/[0.04]"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div
              className={`text-xs uppercase tracking-wider ${isBalanced ? "text-emerald-300" : "text-red-300"}`}
            >
              {isBalanced ? "Neraca Balance ✓" : "TIDAK BALANCE — periksa jurnal!"}
            </div>
            <div className="mt-1 text-sm text-white/60">
              Aset = Liabilitas + Ekuitas
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-xs text-white/50">
              {fmtRupiah(totalAsset)} = {fmtRupiah(totalLiabEquity)}
            </div>
            {!isBalanced ? (
              <div className="font-mono text-xs text-red-300">
                Δ {fmtRupiah(totalAsset - totalLiabEquity)}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <SectionTable section={ASSET_SECTION} accounts={initialBalances} />
        </div>
        <div className="space-y-4">
          <SectionTable section={LIAB_SECTION} accounts={initialBalances} />
          <SectionTable section={EQUITY_SECTION} accounts={initialBalances} />
          <div className="rounded-lg border border-white/[0.06] bg-[#262626] p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/60">Laba Tahun Berjalan</span>
              <span
                className={`tabular-nums font-medium ${netIncome >= 0 ? "text-emerald-300" : "text-red-300"}`}
              >
                {fmtRupiah(netIncome)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-white/[0.04] pt-2 text-base font-semibold">
              <span className="text-white">Total Liabilitas + Ekuitas</span>
              <span className="tabular-nums text-white">
                {fmtRupiah(totalLiabEquity)}
              </span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
