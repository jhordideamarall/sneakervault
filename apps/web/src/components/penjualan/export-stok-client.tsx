"use client";

import { useRef, useState, useTransition } from "react";
import { Button, Card, Badge } from "@sneakervault/ui";
import { useToast } from "@/components/toast";
import { Download, FileUp, CheckCircle2, RefreshCw } from "lucide-react";
import {
  locateColumns,
  type ExportChannel,
} from "@/lib/marketplace/export";
import { getStockForExport, type StockExportRow } from "@/lib/actions/stock-export";

type ExportState = "upload" | "ready" | "done";

const CHANNELS: { id: ExportChannel; label: string; dot: string; hint: string }[] = [
  { id: "shopee", label: "Shopee", dot: "bg-orange-500", hint: "Mass Update — Stok & Harga" },
  { id: "tiktok", label: "TikTok", dot: "bg-pink-500", hint: "Batch Edit — All Information" },
];

type Loaded = {
  fileName: string;
  headerRow: number;
  skuCol: number;
  stockCols: number[];
  priceCols: number[];
  skus: string[];
};

export function ExportStokClient() {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ExportState>("upload");
  const [channel, setChannel] = useState<ExportChannel>("shopee");
  const [includePrice, setIncludePrice] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [stockMap, setStockMap] = useState<Record<string, StockExportRow>>({});
  const [writtenCount, setWrittenCount] = useState(0);

  // Non-serializable workbook kept across the parse -> generate steps.
  const wbRef = useRef<unknown>(null);
  const sheetNameRef = useRef<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const channelMeta = CHANNELS.find((c) => c.id === channel)!;
  const matched = loaded ? loaded.skus.filter((s) => s in stockMap).length : 0;
  const unmatched = loaded ? loaded.skus.length - matched : 0;

  function reset() {
    setState("upload");
    setLoaded(null);
    setStockMap({});
    setWrittenCount(0);
    setIncludePrice(false);
    wbRef.current = null;
    sheetNameRef.current = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const data = ev.target?.result;
      if (!data) return;
      try {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(data, { type: "array", cellStyles: true });
        const sheetName = wb.SheetNames[0];
        const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
        if (!sheet) {
          toast.push("File Excel tidak valid", "error");
          return;
        }

        const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][];
        const cols = locateColumns(aoa, channel);
        if (!cols) {
          toast.push(`Kolom SKU/stok ${channelMeta.label} tidak ditemukan. Pastikan template & tab sesuai.`, "error");
          return;
        }

        // Collect seller SKUs from data rows (rows after the header row).
        const skuSet = new Set<string>();
        for (let r = cols.headerRow + 1; r < aoa.length; r++) {
          const v = String(aoa[r]?.[cols.skuCol] ?? "").trim();
          if (v) skuSet.add(v);
        }
        const skus = Array.from(skuSet);
        if (skus.length === 0) {
          toast.push("Tidak ada SKU terbaca di file", "error");
          return;
        }

        wbRef.current = wb;
        sheetNameRef.current = sheetName!;

        startTransition(async () => {
          const map = await getStockForExport(channel, skus);
          setStockMap(map);
          setLoaded({ fileName: file.name, ...cols, skus });
          setState("ready");
        });
      } catch {
        toast.push("Gagal memproses file", "error");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleGenerate() {
    if (!loaded || !wbRef.current) return;
    startTransition(async () => {
      const XLSX = await import("xlsx");
      const wb = wbRef.current as import("xlsx").WorkBook;
      const ws = wb.Sheets[sheetNameRef.current]!;
      const ref = ws["!ref"];
      if (!ref) {
        toast.push("Sheet kosong", "error");
        return;
      }
      const range = XLSX.utils.decode_range(ref);
      let written = 0;

      for (let r = loaded.headerRow + 1; r <= range.e.r; r++) {
        const skuAddr = XLSX.utils.encode_cell({ r, c: loaded.skuCol });
        const sku = String(ws[skuAddr]?.v ?? "").trim();
        const row = stockMap[sku];
        if (!row) continue;

        for (const c of loaded.stockCols) {
          ws[XLSX.utils.encode_cell({ r, c })] = { t: "n", v: row.quantity };
        }
        if (includePrice) {
          for (const c of loaded.priceCols) {
            ws[XLSX.utils.encode_cell({ r, c })] = { t: "n", v: row.sell_price };
          }
        }
        written++;
      }

      const arr = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
      const blob = new Blob([arr], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const base = loaded.fileName.replace(/\.(xlsx|xls|csv)$/i, "");
      a.href = url;
      a.download = `${base}-updated.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      setWrittenCount(written);
      setState("done");
      toast.push(`${written} baris stok diisi`, "success");
    });
  }

  return (
    <div className="space-y-6">
      {state === "upload" && (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 rounded-full bg-white/5 p-4 text-white/40">
            <Download size={32} />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-white">Export Stok ke Template Marketplace</h2>
          <p className="mb-6 max-w-md text-sm text-white/50">
            Download template "Mass Update / Batch Edit" dari Seller Center, upload
            di sini — sistem mengisi kolom stok (& opsional harga) dari data sistem,
            lalu kamu download & upload balik ke marketplace.
          </p>

          <div className="mb-8 flex gap-2 rounded-lg border border-white/[0.06] bg-[#262626] p-1.5">
            {CHANNELS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setChannel(c.id)}
                className={
                  "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors " +
                  (channel === c.id ? "bg-white/[0.1] text-white" : "text-white/45 hover:bg-white/[0.04] hover:text-white/70")
                }
              >
                <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                {c.label}
              </button>
            ))}
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black transition-all hover:bg-white/90 active:scale-95">
            <FileUp size={18} />
            Upload Template {channelMeta.label}
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
          </label>
          <p className="mt-4 text-xs text-white/30">{channelMeta.hint}</p>
          {pending && <p className="mt-3 text-xs text-white/40">Memproses…</p>}
        </Card>
      )}

      {state === "ready" && loaded && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Badge className="bg-white/[0.06] text-white/60 border-white/10">{channelMeta.label}</Badge>
              <h2 className="text-xl font-bold text-white">Review Export</h2>
              <span className="text-xs text-white/30">{loaded.fileName}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={reset}>Batal</Button>
              <Button onClick={handleGenerate} disabled={pending || matched === 0}>
                <Download size={16} className="mr-1" />
                {pending ? "Membuat…" : `Generate (${matched})`}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Stat label="Cocok (akan diisi)" value={matched} tone="text-emerald-400" />
            <Stat label="Tidak ada di sistem" value={unmatched} tone="text-amber-400" />
            <Stat label="Total baris SKU" value={loaded.skus.length} tone="text-white/60" />
          </div>

          <label className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-[#262626] px-4 py-3">
            <input
              type="checkbox"
              checked={includePrice}
              onChange={(e) => setIncludePrice(e.target.checked)}
              className="size-4 accent-emerald-500"
              disabled={loaded.priceCols.length === 0}
            />
            <div>
              <div className="text-sm text-white/80">Ikut update harga jual</div>
              <div className="text-[11px] text-white/40">
                {loaded.priceCols.length === 0
                  ? "Kolom harga tidak ada di template ini — hanya stok."
                  : "Default mati: hanya kolom stok yang ditimpa. Centang untuk ikut menimpa harga jual sistem."}
              </div>
            </div>
          </label>

          {unmatched > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-xs text-amber-200/80">
              {unmatched} SKU di file tidak ditemukan di sistem (lewat SKU langsung / pemetaan). Baris itu dibiarkan apa adanya.
            </div>
          )}
        </div>
      )}

      {state === "done" && (
        <div className="mx-auto max-w-lg">
          <Card className="border-white/[0.06] bg-[#262626] p-8 text-center">
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-emerald-500/10 p-4 text-emerald-500"><CheckCircle2 size={48} /></div>
            </div>
            <h2 className="mb-2 text-2xl font-bold text-white">File Siap</h2>
            <p className="mb-6 text-white/50">
              {writtenCount} baris stok terisi. File ter-download — upload balik ke {channelMeta.label} Seller Center.
            </p>
            <Button variant="secondary" onClick={reset}>
              <RefreshCw size={16} className="mr-1" /> Export Lagi
            </Button>
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
