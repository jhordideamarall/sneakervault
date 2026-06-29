"use client";

import { useState } from "react";
import { Button, Card, Alert } from "@sneakervault/ui";
import {
  bulkImportMarketplaceProducts,
  bulkImportProducts,
} from "@/lib/actions/products";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";
import { Download, FileUp, Store, Upload } from "lucide-react";
import {
  parseMarketplaceProductTemplate,
  type ProductImportChannel,
} from "@/lib/marketplace/product-import";

type Result = {
  inserted: number;
  skipped: number;
  errors: { row: number; reason: string }[];
  rejected?: { row: number; reason: string }[];
};

type Source = "internal" | ProductImportChannel;

const REQUIRED_COLUMNS = ["brand", "model", "sku", "size"] as const;

const SOURCES: Array<{
  id: Source;
  label: string;
  hint: string;
  dot: string;
}> = [
  { id: "internal", label: "Template Produk", hint: "Excel internal", dot: "bg-sky-400" },
  { id: "shopee", label: "Shopee", hint: "Mass Update", dot: "bg-orange-500" },
  { id: "tiktok", label: "TikTok Shop", hint: "Batch Edit", dot: "bg-pink-500" },
  { id: "tokopedia", label: "Tokopedia", hint: "Order/SKU report", dot: "bg-emerald-500" },
];

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]/g, "");
}

function normalizeProductRows(rows: Record<string, unknown>[]) {
  return rows.map((row) => {
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[normalizeHeader(key)] = value;
    }
    return normalized;
  });
}

function missingProductColumns(rows: Record<string, unknown>[]) {
  const headers = new Set(rows.flatMap((row) => Object.keys(row).map(normalizeHeader)));
  return REQUIRED_COLUMNS.filter((column) => !headers.has(column));
}

function sourceDescription(source: Source) {
  if (source === "internal") {
    return (
      <>
        Upload Excel/CSV master produk dengan kolom{" "}
        <span className="font-mono text-white/70">
          brand, model, sku, size, color, quantity, hpp, sell_price, price_offline,
          price_website, price_shopee, price_tiktok, price_tokopedia
        </span>
        . Size boleh pecahan (mis. <span className="font-mono text-white/70">42 2/3</span>).
        Stok &amp; HPP dibaca sebagai saldo awal. <strong>Barcode auto-generate</strong> dari
        SKU+size kalau kosong. SKU/barcode yang sudah ada akan dilewati.
      </>
    );
  }

  if (source === "shopee") {
    return "Upload template Mass Update Sales Info dari Shopee. Produk dibuat per variasi size, stok dan harga dibaca dari template, HPP sementara 0.";
  }

  if (source === "tiktok") {
    return "Upload template Batch Edit All Information dari TikTok Shop. Produk dibuat dari seller SKU/SKU ID, stok dijumlah dari kolom warehouse, HPP sementara 0.";
  }

  return "Upload report Tokopedia yang berisi SKU produk. Produk dibuat dari seller SKU/SKU ID, stok awal 0 karena order report bukan sumber stok.";
}

export function BulkImportButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<Source>("internal");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [status, setStatus] = useState<{ tone: "info" | "success" | "warning" | "error"; message: string } | null>(null);

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      [
        "brand",
        "model",
        "sku",
        "size",
        "color",
        "quantity",
        "hpp",
        "sell_price",
        "price_offline",
        "price_website",
        "price_shopee",
        "price_tiktok",
        "price_tokopedia",
      ],
      // SKU sama = 1 colorway; tiap size = baris variant. Half-size pakai titik
      // (42.5), Adidas pecahan pakai spasi (42 2/3). Koma juga diterima (auto → titik).
      [
        "Nike",
        "Air Force 1 Low Triple White",
        "DH2920 111",
        "40",
        "White",
        5,
        596000,
        1399000,
        1399000,
        "",
        1500000,
        1650000,
        "",
      ],
      [
        "Nike",
        "Air Force 1 Low Triple White",
        "DH2920 111",
        "42.5",
        "White",
        3,
        596000,
        1399000,
        1399000,
        "",
        1500000,
        1650000,
        "",
      ],
      [
        "Adidas",
        "Samba OG Cloud White",
        "IE7096",
        "42 2/3",
        "White",
        2,
        2200000,
        5099000,
        5099000,
        "",
        5499000,
        5849000,
        "",
      ],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "sneakervault-import-template.xlsx");
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setProcessing(true);
    setResult(null);
    setStatus({ tone: "info", message: `Membaca file ${file.name}…` });

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const data = ev.target?.result;
      if (!data) {
        setStatus({ tone: "error", message: "Gagal membaca file. Coba export ulang file Excel/CSV lalu upload lagi." });
        toast.push("Gagal membaca file", "error");
        setProcessing(false);
        input.value = "";
        return;
      }

      try {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(data, { type: "array", cellDates: false });
        const sheetName = wb.SheetNames[0];
        const ws = sheetName ? wb.Sheets[sheetName] : undefined;
        if (!ws) {
          setStatus({ tone: "error", message: "Sheet tidak ditemukan. Template produk harus punya sheet pertama berisi header kolom produk." });
          toast.push("Sheet tidak ditemukan", "error");
          return;
        }

        let importResult: Result;
        if (source === "internal") {
          const rows = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];
          if (rows.length === 0) {
            setStatus({ tone: "error", message: "Tidak ada baris data. Isi minimal satu produk dengan brand, model, sku, size, quantity, hpp, dan harga jual." });
            toast.push("Tidak ada baris data", "error");
            return;
          }
          const missing = missingProductColumns(rows);
          if (missing.length > 0) {
            setStatus({
              tone: "error",
              message: `Format produk tidak diterima. Kolom wajib kurang: ${missing.join(", ")}. Header minimal: brand, model, sku, size. Kolom angka boleh format Rp/1.000.000 dan size boleh 40, 40.5, atau 42 2/3.`,
            });
            toast.push(
              `Ini bukan template produk inventory. Kolom wajib kurang: ${missing.join(", ")}`,
              "error",
            );
            return;
          }
          setStatus({ tone: "info", message: `${rows.length} baris produk terbaca. Mengimport ke inventory…` });
          importResult = await bulkImportProducts(normalizeProductRows(rows));
        } else {
          const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as unknown[][];
          const parsedTemplate = parseMarketplaceProductTemplate(source, aoa);
          const rows = parsedTemplate.rows;
          if (rows.length === 0) {
            setStatus({
              tone: "error",
              message:
                parsedTemplate.rejected.length > 0
                  ? `Tidak ada SKU size valid. Variasi harus size numerik seperti 40, 40.5, atau 42 2/3; contoh "Size Lain? Ready" tidak diterima.`
                  : `Template ${SOURCES.find((s) => s.id === source)?.label ?? "marketplace"} tidak dikenali. Upload template resmi marketplace untuk produk/stok, bukan order/settlement.`,
            });
            toast.push(
              parsedTemplate.rejected.length > 0
                ? `Tidak ada SKU size valid. Variasi seperti "Size Lain? Ready" wajib diubah menjadi size numerik.`
                : `Template ${SOURCES.find((s) => s.id === source)?.label ?? "marketplace"} tidak dikenali atau tidak punya SKU size valid`,
              "error",
            );
            if (parsedTemplate.rejected.length > 0) {
              setResult({
                inserted: 0,
                skipped: 0,
                errors: [],
                rejected: parsedTemplate.rejected,
              });
            }
            return;
          }
          setStatus({ tone: "info", message: `${rows.length} variasi produk marketplace terbaca. Mengimport SKU+size ke inventory…` });
          importResult = await bulkImportMarketplaceProducts(source, rows);
          importResult = {
            ...importResult,
            rejected: parsedTemplate.rejected,
            skipped: importResult.skipped + parsedTemplate.rejected.length,
          };
        }

        setResult(importResult);
        const hasWarnings = importResult.errors.length > 0 || (importResult.rejected?.length ?? 0) > 0;
        setStatus({
          tone: hasWarnings ? "warning" : "success",
          message: `${importResult.inserted} produk dibuat, ${importResult.skipped} dilewati. ${hasWarnings ? "Cek detail error/format di bawah sebelum lanjut import order." : "Format diterima dan data tersimpan."}`,
        });
        toast.push(
          `${importResult.inserted} produk dibuat, ${importResult.skipped} dilewati`,
          hasWarnings ? "info" : "success",
        );
        router.refresh();
      } catch (err) {
        setStatus({
          tone: "error",
          message: err instanceof Error ? err.message : "Gagal import produk. Pastikan file memakai template yang sesuai dan kolom angka/size valid.",
        });
        toast.push(
          err instanceof Error ? err.message : "Gagal import produk",
          "error",
        );
      } finally {
        setProcessing(false);
        input.value = "";
      }
    };
    reader.onerror = () => {
      setStatus({ tone: "error", message: "Gagal membaca file. File mungkin rusak atau tidak bisa dibuka browser." });
      toast.push("Gagal membaca file", "error");
      setProcessing(false);
      input.value = "";
    };
    reader.readAsArrayBuffer(file);
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Upload size={14} className="mr-1.5" />
        Import Produk
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setOpen(false);
              setResult(null);
              setStatus(null);
            }
          }}
        >
          <Card className="w-full max-w-2xl">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/70">
                <Store size={18} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Import Produk</h2>
                <p className="mt-1 text-xs leading-relaxed text-white/50">
                  Pilih sumber file. Untuk pesanan marketplace tetap pakai{" "}
                  <span className="font-medium text-white/70">Penjualan - Import Pesanan</span>.
                </p>
              </div>
            </div>

            <div className="mb-4 grid gap-2 sm:grid-cols-4">
              {SOURCES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSource(item.id);
                    setResult(null);
                    setStatus(null);
                  }}
                  className={
                    "rounded-xl border px-3 py-2.5 text-left transition-colors " +
                    (source === item.id
                      ? "border-white/20 bg-white/[0.08]"
                      : "border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.05]")
                  }
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-white/85">
                    <span className={`size-2 rounded-full ${item.dot}`} />
                    {item.label}
                  </div>
                  <div className="mt-1 text-[11px] text-white/35">{item.hint}</div>
                </button>
              ))}
            </div>

            <p className="mb-4 rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 text-xs leading-relaxed text-white/55">
              {sourceDescription(source)}
            </p>

            {source !== "internal" && (
              <Alert tone="warning" className="mb-4">
                Import marketplace ini untuk bootstrap data kosong. HPP masih 0 sampai diisi lewat Barang Masuk, Stock Opname, atau cutover Accurate.
              </Alert>
            )}

            {(status || processing) && (
              <Alert tone={status?.tone ?? "info"} className="mb-4 text-xs leading-relaxed">
                {processing && status?.tone === "info" ? "Memproses file. Jangan tutup modal sampai hasil muncul. " : ""}
                {status?.message ?? "Memproses file…"}
              </Alert>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {source === "internal" && (
                <Button size="sm" variant="ghost" onClick={downloadTemplate}>
                  <Download size={14} className="mr-1" />
                  Template Produk
                </Button>
              )}
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/10 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15">
                <FileUp size={14} />
                {processing ? "Memproses..." : `Pilih File ${SOURCES.find((s) => s.id === source)?.label}`}
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFile}
                  disabled={processing}
                  className="hidden"
                />
              </label>
            </div>

            {result && (
              <div className="mt-4 space-y-2">
                <Alert tone={result.errors.length > 0 || (result.rejected?.length ?? 0) > 0 ? "warning" : "success"}>
                  Berhasil: {result.inserted} · Dilewati: {result.skipped} ·
                  Format ditolak: {result.rejected?.length ?? 0} · Error: {result.errors.length}
                </Alert>
                {(result.rejected?.length ?? 0) > 0 && (
                  <Alert tone="warning" className="text-xs leading-relaxed">
                    Ada {result.rejected?.length} baris variasi tanpa size numerik. Contoh: "Size Lain? Ready".
                    Baris ini tidak bisa dibuat sebagai SKU inventory karena stok/HPP/jurnal harus melekat ke size spesifik.
                  </Alert>
                )}
                {(result.rejected?.length ?? 0) > 0 && (
                  <div className="max-h-32 overflow-y-auto rounded-lg border border-amber-500/15 bg-amber-500/[0.03] p-3 text-[11px] text-amber-100/80">
                    {result.rejected?.slice(0, 20).map((e, i) => (
                      <div key={i} className="font-mono">
                        <span className="text-amber-300">baris {e.row}:</span>{" "}
                        {e.reason}
                      </div>
                    ))}
                    {(result.rejected?.length ?? 0) > 20 && (
                      <div className="mt-2 text-white/40">
                        +{(result.rejected?.length ?? 0) - 20} baris lain disembunyikan.
                      </div>
                    )}
                  </div>
                )}
                {result.errors.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-white/[0.06] bg-black/20 p-3 text-[11px] text-white/70">
                    {result.errors.map((e, i) => (
                      <div key={i} className="font-mono">
                        <span className="text-amber-400">baris {e.row}:</span>{" "}
                        {e.reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  setResult(null);
                  setStatus(null);
                }}
              >
                Tutup
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
