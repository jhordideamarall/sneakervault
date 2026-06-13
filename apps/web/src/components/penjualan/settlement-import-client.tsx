"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Card, Badge } from "@sneakervault/ui";
import { useToast } from "@/components/toast";
import { FileUp, Wallet, CheckCircle2, AlertCircle } from "lucide-react";
import {
  parseSettlementWorkbook,
  type SettlementParseResult,
  type SettlementRow,
} from "@/lib/marketplace/settlement-parsers";
import type { MarketplaceChannel } from "@/lib/marketplace/parsers";
import {
  reconcileSettlement,
  commitSettlement,
  listActiveBankAccounts,
  type SettlementReconcile,
  type SettlementResult,
  type BankOption,
} from "@/lib/actions/settlement-import";

type State = "upload" | "review" | "result";

const CHANNELS: { id: MarketplaceChannel; label: string; dot: string }[] = [
  { id: "shopee", label: "Shopee", dot: "bg-orange-500" },
  { id: "tokopedia", label: "Tokopedia", dot: "bg-emerald-500" },
  { id: "tiktok", label: "TikTok", dot: "bg-pink-500" },
];

const fmt = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

function settlementTemplateHint(channel: MarketplaceChannel) {
  if (channel === "shopee") {
    return "Template settlement Shopee tidak dikenali. Pakai file resmi Shopee Income Report dengan sheet Income dan kolom No. Pesanan + Total Penghasilan.";
  }
  return "Template settlement tidak dikenali. Pakai file resmi TikTok/Tokopedia dengan sheet Detail pesanan dan kolom ID Pesanan/Penyesuaian + Jumlah penyelesaian pembayaran + Total Biaya.";
}

export function SettlementImportClient() {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<State>("upload");
  const [channel, setChannel] = useState<MarketplaceChannel>("shopee");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [diff, setDiff] = useState<SettlementReconcile | null>(null);
  const [result, setResult] = useState<SettlementResult | null>(null);
  const [parseInfo, setParseInfo] = useState<SettlementParseResult | null>(null);
  const [banks, setBanks] = useState<BankOption[]>([]);
  const [bankId, setBankId] = useState<string>("");
  const [settledDate, setSettledDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [ref, setRef] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listActiveBankAccounts().then((b) => {
      setBanks(b);
      const def = b.find((x) => x.type !== "marketplace_balance") ?? b[0];
      if (def) setBankId(def.id);
    });
  }, []);

  function reset() {
    setState("upload");
    setRows([]);
    setDiff(null);
    setResult(null);
    setParseInfo(null);
    setFileName("");
    setRef("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const data = ev.target?.result;
      if (!data) return;
      try {
        const XLSX = await import("xlsx");
        const isCsv = file.name.toLowerCase().endsWith(".csv");
        const wb = XLSX.read(data, { type: isCsv ? "string" : "array" });
        const sheets = wb.SheetNames.map((sheetName) => {
          const sheet = wb.Sheets[sheetName];
          const rows = sheet
            ? (XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "", blankrows: false }) as unknown[][])
            : [];
          return { name: sheetName, rows };
        });
        if (sheets.length === 0) {
          toast.push("File tidak valid", "error");
          return;
        }
        const parsed = parseSettlementWorkbook(channel, sheets);
        if (parsed.rows.length === 0) {
          toast.push(settlementTemplateHint(channel), "error");
          return;
        }
        setRows(parsed.rows);
        setParseInfo(parsed);
        startTransition(async () => {
          const r = await reconcileSettlement(channel, parsed.rows);
          setDiff(r);
          setState("review");
        });
      } catch {
        toast.push("Gagal memproses file", "error");
      }
    };
    if (file.name.toLowerCase().endsWith(".csv")) reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  }

  function handleCommit() {
    startTransition(async () => {
      const r = await commitSettlement({
        channel,
        bankAccountId: bankId,
        settledDate,
        settlementRef: ref || null,
        rows,
        fileName,
      });
      if (r.error) {
        toast.push(r.error, "error");
        return;
      }
      setResult(r);
      setState("result");
      toast.push(`${r.matched} order direkonsiliasi`, "success");
    });
  }

  return (
    <div className="space-y-6">
      {state === "upload" && (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 rounded-full bg-white/5 p-4 text-white/40"><Wallet size={32} /></div>
          <h2 className="mb-2 text-lg font-semibold text-white">Rekonsiliasi Dana Marketplace</h2>
          <p className="mb-6 max-w-md text-sm text-white/50">
            Pakai setelah dana marketplace dilepas. Sistem akan membuat penerimaan penjualan,
            melunasi faktur yang cocok, mencatat kas/bank, dan membukukan biaya marketplace aktual.
          </p>
          <p className="mb-6 max-w-xl rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-white/45">
            Format harus dari template resmi marketplace. Shopee dibaca dari sheet <b className="text-white/70">Income</b>;
            TikTok/Tokopedia dari sheet <b className="text-white/70">Detail pesanan</b>. Sheet ringkasan, penjelasan biaya, dan fee detail tidak dihitung ulang.
          </p>

          {/* Channel selector */}
          <div className="mb-8 flex gap-2 rounded-lg border border-white/[0.06] bg-[#262626] p-1.5">
            {CHANNELS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setChannel(c.id)}
                className={"flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors " + (channel === c.id ? "bg-white/[0.1] text-white" : "text-white/45 hover:bg-white/[0.04] hover:text-white/70")}
              >
                <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                {c.label}
              </button>
            ))}
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black transition-all hover:bg-white/90 active:scale-95">
            <FileUp size={18} />
            Upload Laporan Settlement
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
          </label>
          {pending && <p className="mt-3 text-xs text-white/40">Memproses…</p>}
        </Card>
      )}

      {state === "review" && diff && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                Dana Cair
              </Badge>
              <h2 className="text-xl font-bold text-white">Review Settlement</h2>
              <span className="text-xs text-white/30">{fileName}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={reset}>Batal</Button>
              <Button onClick={handleCommit} disabled={pending || diff.summary.apply === 0 || !bankId}>
                {pending ? "Memproses…" : `Terapkan (${diff.summary.apply})`}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Stat label="Akan diterapkan" value={diff.summary.apply} tone="text-emerald-400" />
            <Stat label="Dilewati" value={diff.summary.skip} tone="text-white/50" />
            <Stat label="Tak ada invoice" value={diff.summary.unmatched} tone="text-amber-400" />
          </div>

          {parseInfo && (
            <div className="rounded-lg border border-white/[0.06] bg-[#262626] px-4 py-3 text-xs text-white/45">
              Terbaca sebagai <span className="font-medium text-white/70">{parseInfo.templateLabel}</span> dari sheet{" "}
              <span className="font-mono text-white/70">{parseInfo.sourceSheet}</span> baris header {parseInfo.headerRow}.
              {parseInfo.ignoredSheets.length > 0 && (
                <span> Sheet lain diabaikan: {parseInfo.ignoredSheets.join(", ")}.</span>
              )}
            </div>
          )}

          <div className="grid gap-3 rounded-lg border border-white/[0.06] bg-[#262626] p-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-white/50">
              Bank tujuan pencairan
              <select value={bankId} onChange={(e) => setBankId(e.target.value)} className="rounded-md border border-white/10 bg-[#1F1F1E] px-3 py-2 text-sm text-white focus:border-white/25 focus:outline-none">
                {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-white/50">
              Tanggal cair
              <input type="date" value={settledDate} onChange={(e) => setSettledDate(e.target.value)} className="rounded-md border border-white/10 bg-[#1F1F1E] px-3 py-2 text-sm text-white focus:border-white/25 focus:outline-none" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-white/50">
              No. Referensi (opsional)
              <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="No. pencairan" className="rounded-md border border-white/10 bg-[#1F1F1E] px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-white/25 focus:outline-none" />
            </label>
          </div>

          <div className="overflow-hidden rounded-lg border border-white/[0.06]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#262626] text-white/40">
                <tr>
                  <th className="px-3 py-2 font-medium">Order ID</th>
                  <th className="px-3 py-2 font-medium text-right">Net</th>
                  <th className="px-3 py-2 font-medium text-right">Biaya</th>
                  <th className="px-3 py-2 font-medium text-right">Invoice</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {diff.rows.slice(0, 100).map((r) => (
                  <tr key={r.order_id} className="border-t border-white/[0.04]">
                    <td className="px-3 py-2 font-mono text-white/70">{r.order_id}</td>
                    <td className="px-3 py-2 text-right text-white/70">{fmt(r.net)}</td>
                    <td className="px-3 py-2 text-right text-white/50">{fmt(r.fee)}</td>
                    <td className="px-3 py-2 text-right text-white/50">{r.invoice_total != null ? fmt(r.invoice_total) : "—"}</td>
                    <td className="px-3 py-2">
                      {r.action === "apply" && <span className="text-emerald-400">Terapkan</span>}
                      {r.action === "skip" && <span className="text-white/40">{r.reason ?? "Dilewati"}</span>}
                      {r.action === "unmatched" && <span className="text-amber-400">Tak ada invoice</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {diff.rows.length > 100 && (
              <div className="bg-[#262626] px-3 py-2 text-center text-[11px] text-white/30">+ {diff.rows.length - 100} baris lagi</div>
            )}
          </div>
        </div>
      )}

      {state === "result" && result && (
        <div className="mx-auto max-w-lg">
          <Card className="border-white/[0.06] bg-[#262626] p-8 text-center">
            <div className="mb-4 flex justify-center">
              {result.unmatched.length === 0 ? (
                <div className="rounded-full bg-emerald-500/10 p-4 text-emerald-500"><CheckCircle2 size={48} /></div>
              ) : (
                <div className="rounded-full bg-amber-500/10 p-4 text-amber-500"><AlertCircle size={48} /></div>
              )}
            </div>
            <h2 className="mb-2 text-2xl font-bold text-white">Settlement Selesai</h2>
            <p className="mb-6 text-white/50">
              {result.matched} order direkonsiliasi · {result.skipped} dilewati · {result.unmatched.length} tak ada invoice.
            </p>
            <Button variant="secondary" onClick={reset}>Upload Lagi</Button>
          </Card>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-white/[0.04] bg-[#262626] p-4">
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/30">{label}</div>
    </div>
  );
}
