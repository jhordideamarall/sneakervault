"use client";

import { useState, useTransition } from "react";
import { Button, Card, Alert } from "@sneakervault/ui";
import { bulkImportProducts } from "@/lib/actions/products";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";
import { Upload, Download, FileUp } from "lucide-react";

type Result = {
  inserted: number;
  skipped: number;
  errors: { row: number; reason: string }[];
};

export function BulkImportButton() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      [
        "brand",
        "model",
        "sku",
        "size",
        "color",
        "barcode",
        "sell_price",
        "price_offline",
      ],
      [
        "Adidas",
        "Samba White",
        "SMB-WHT-40",
        40,
        "White",
        "104100",
        1800000,
        1650000,
      ],
      [
        "Adidas",
        "Samba White",
        "SMB-WHT-41",
        41,
        "White",
        "104101",
        1800000,
        1650000,
      ],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "sneakervault-import-template.xlsx");
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const data = ev.target?.result;
      if (!data) return;

      try {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(data, { type: "array" });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) {
          toast.push("File kosong", "error");
          return;
        }
        const ws = wb.Sheets[sheetName];
        if (!ws) {
          toast.push("Sheet tidak ditemukan", "error");
          return;
        }
        const rows = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];
        if (rows.length === 0) {
          toast.push("Tidak ada baris data", "error");
          return;
        }

        startTransition(async () => {
          const r = await bulkImportProducts(rows);
          setResult(r);
          toast.push(
            `${r.inserted} produk diimport, ${r.skipped} dilewati`,
            r.errors.length > 0 ? "info" : "success",
          );
          router.refresh();
        });
      } catch (err) {
        toast.push(
          err instanceof Error ? err.message : "Gagal membaca file",
          "error",
        );
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ""; // allow re-selecting same file
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Upload size={14} className="mr-1" />
        Import Excel
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setOpen(false);
              setResult(null);
            }
          }}
        >
          <Card className="w-full max-w-lg">
            <h2 className="mb-1 text-base font-semibold text-white">
              Bulk Import Produk
            </h2>
            <p className="mb-4 text-xs leading-relaxed text-white/50">
              Upload Excel/CSV dengan kolom:{" "}
              <span className="font-mono text-white/70">
                brand, model, sku, size, color, barcode, sell_price, price_offline
              </span>
              . Barcode harus unik — baris yang sudah ada akan dilewati (tidak
              ditimpa).
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="ghost" onClick={downloadTemplate}>
                <Download size={14} className="mr-1" />
                Template
              </Button>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/10 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15">
                <FileUp size={14} />
                {pending ? "Memproses…" : "Pilih File"}
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFile}
                  disabled={pending}
                  className="hidden"
                />
              </label>
            </div>

            {result && (
              <div className="mt-4 space-y-2">
                <Alert tone={result.errors.length > 0 ? "warning" : "success"}>
                  Berhasil: {result.inserted} · Dilewati: {result.skipped} ·
                  Error: {result.errors.length}
                </Alert>
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
