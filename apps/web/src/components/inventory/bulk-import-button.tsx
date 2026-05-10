"use client";

import { useState, useTransition } from "react";
import { Button, Card, Alert } from "@sneakervault/ui";
import { bulkImportProducts } from "@/lib/actions/products";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";

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
      ["brand", "model", "sku", "size", "color", "barcode", "sell_price"],
      ["Adidas", "Samba White", "SMB-WHT-40", 40, "White", "104100", 1800000],
      ["Adidas", "Samba White", "SMB-WHT-41", 41, "White", "104101", 1800000],
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
          toast.push(`${r.inserted} produk diimport, ${r.skipped} dilewati`, r.errors.length > 0 ? "info" : "success");
          router.refresh();
        });
      } catch (err) {
        toast.push(err instanceof Error ? err.message : "Gagal membaca file", "error");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ""; // allow re-selecting same file
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        📂 Import CSV/Excel
      </Button>

      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg">
            <h2 className="mb-2 text-lg font-semibold">Bulk Import Produk</h2>
            <p className="mb-4 text-sm text-[#6b7280]">
              Upload file Excel/CSV dengan kolom: brand, model, sku, size, color (opsional), barcode, sell_price.
              Barcode harus unik — produk yang sudah ada akan dilewati.
            </p>

            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={downloadTemplate}>
                📥 Download Template
              </Button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#1a1a2e] px-4 py-2 text-sm text-white hover:bg-[#16213e]">
                {pending ? "Memproses..." : "📁 Pilih File"}
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
                  Berhasil: {result.inserted} · Dilewati: {result.skipped} · Error: {result.errors.length}
                </Alert>
                {result.errors.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-[#e5e7eb] p-3 text-xs">
                    {result.errors.map((e, i) => (
                      <div key={i}>
                        <span className="font-mono">baris {e.row}:</span> {e.reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <Button variant="ghost" onClick={() => { setOpen(false); setResult(null); }}>
                Tutup
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
