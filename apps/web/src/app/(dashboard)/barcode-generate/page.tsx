"use client";

import { useState, useTransition } from "react";
import { generateBarcodeSvg } from "@sneakervault/barcode";
import { Button, Card, Input } from "@sneakervault/ui";
import {
  Hash,
  Package,
  Plus,
  Printer,
  QrCode,
  Search,
  Trash2,
} from "lucide-react";
import { useToast } from "@/components/toast";
import {
  searchProductsForLabel,
  type LabelProduct,
} from "@/lib/actions/barcode";

type LabelQueueItem = LabelProduct & {
  labelQty: number;
  widthMm: number;
  heightMm: number;
};

function svgFor(barcode: string): string {
  return generateBarcodeSvg(barcode, {
    width: 1.35,
    height: 38,
    displayValue: true,
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export default function BarcodeGeneratePage() {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LabelProduct[]>([]);
  const [queue, setQueue] = useState<LabelQueueItem[]>([]);

  const today = new Date().toLocaleDateString("id-ID");
  const totalLabels = queue.reduce((sum, item) => sum + item.labelQty, 0);

  function search(value: string) {
    setQuery(value);
    if (value.trim().length < 1) {
      setResults([]);
      return;
    }
    startTransition(async () => setResults(await searchProductsForLabel(value)));
  }

  function addToQueue(product: LabelProduct) {
    setQueue((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) {
        return current.map((item) =>
          item.id === product.id
            ? { ...item, labelQty: clamp(item.labelQty + 1, 1, 200) }
            : item,
        );
      }
      return [
        ...current,
        { ...product, labelQty: 1, widthMm: 50, heightMm: 25 },
      ];
    });
    toast.push(`${product.brand} ${product.model} size ${product.size_label} masuk antrean`, "success");
  }

  function updateQueueItem(
    id: string,
    patch: Partial<Pick<LabelQueueItem, "labelQty" | "widthMm" | "heightMm">>,
  ) {
    setQueue((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function handlePrint() {
    if (queue.length === 0) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.push("Popup print diblokir browser. Izinkan popup lalu coba lagi.", "error");
      return;
    }

    const labels = queue
      .flatMap((item) => {
        const barcodeSvg = svgFor(item.barcode);
        const productLabel = escapeHtml(
          `${item.brand} ${item.model}${item.color ? ` ${item.color}` : ""} — Size ${item.size_label}`,
        );
        return Array.from({ length: item.labelQty }, () => `
          <section class="label" style="width:${item.widthMm}mm;height:${item.heightMm}mm">
            <div class="date">${escapeHtml(today)}</div>
            <div class="barcode">${barcodeSvg}</div>
            <div class="info">${productLabel}</div>
          </section>
        `);
      })
      .join("");

    printWindow.document.write(`<!doctype html>
      <html lang="id">
        <head>
          <meta charset="utf-8" />
          <title>Cetak Barcode Dewinst.id</title>
          <style>
            @page { margin: 5mm; }
            * { box-sizing: border-box; }
            body { margin: 0; display: flex; flex-wrap: wrap; align-items: flex-start; gap: 2mm; font-family: Arial, sans-serif; }
            .label { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; border: 0.25mm dashed #bbb; padding: 1.5mm; page-break-inside: avoid; break-inside: avoid; }
            .date { margin-bottom: 0.5mm; font-size: 6.5pt; color: #555; }
            .barcode { display: flex; min-height: 0; max-height: 55%; max-width: 100%; align-items: center; justify-content: center; overflow: hidden; }
            .barcode svg { display: block; max-height: 100%; max-width: 100%; width: auto; }
            .info { margin-top: 0.7mm; max-width: 100%; overflow: hidden; font-size: 6.5pt; font-weight: 700; line-height: 1.15; text-align: center; }
            @media print { .label { border-color: transparent; } }
          </style>
        </head>
        <body>${labels}<script>setTimeout(() => { window.print(); window.onafterprint = () => window.close(); }, 300)<\/script></body>
      </html>`);
    printWindow.document.close();
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-2">
        <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
          <QrCode className="text-white/40" size={28} />
          Cetak Barcode
        </h1>
        <p className="text-sm text-white/50">
          Klik beberapa produk untuk menambahkannya ke antrean, atur jumlah serta ukuran label dalam mm, lalu print sekali.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <Card className="border-white/[0.06] bg-[#262626] p-5 shadow-xl">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35"
            />
            <Input
              autoFocus
              value={query}
              onChange={(event) => search(event.target.value)}
              placeholder="Cari brand, model, SKU, atau barcode…"
              className="pl-9"
            />
          </div>

          <div className="mt-3 max-h-[620px] divide-y divide-white/[0.04] overflow-y-auto rounded-lg border border-white/[0.05]">
            {query.trim().length < 1 ? (
              <div className="px-4 py-10 text-center text-sm text-white/35">
                Ketik untuk mencari produk.
              </div>
            ) : pending && results.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-white/35">Mencari…</div>
            ) : results.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-white/35">
                Produk tidak ditemukan. Tambahkan dahulu dari Inventori atau Barang Masuk.
              </div>
            ) : (
              results.map((product) => {
                const queued = queue.find((item) => item.id === product.id);
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addToQueue(product)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm text-white/85">
                        {product.brand} {product.model}{" "}
                        <span className="text-white/45">
                          · {product.color ?? "—"} · Size {product.size_label}
                        </span>
                      </div>
                      <div className="mt-0.5 break-all font-mono text-[11px] text-white/40">
                        SKU {product.sku} · Barcode {product.barcode} · Stok {product.quantity}
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-white/60">
                      <Plus size={12} /> {queued ? queued.labelQty : "Tambah"}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        <Card className="border-white/[0.06] bg-[#262626] p-5 shadow-xl">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Antrean Label</h2>
              <p className="mt-1 text-xs text-white/40">
                {queue.length} produk · {totalLabels} label
              </p>
            </div>
            {queue.length > 0 && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setQueue([])}>
                Kosongkan
              </Button>
            )}
          </div>

          {queue.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 text-center text-white/20">
              <Package size={56} strokeWidth={1} />
              <p className="max-w-xs text-sm">Klik produk di hasil pencarian untuk menambah label.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
                {queue.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white/80">
                          {item.brand} {item.model} · Size {item.size_label}
                        </p>
                        <p className="mt-1 break-all font-mono text-[11px] text-amber-300/65">
                          {item.barcode}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setQueue((current) => current.filter((queued) => queued.id !== item.id))
                        }
                        aria-label={`Hapus ${item.brand} ${item.model} size ${item.size_label} dari antrean`}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <label className="text-[11px] text-white/40">
                        Jumlah
                        <span className="relative mt-1 block">
                          <Hash size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25" />
                          <Input
                            aria-label={`Jumlah label ${item.brand} ${item.model} size ${item.size_label}`}
                            type="number"
                            min={1}
                            max={200}
                            value={item.labelQty}
                            onChange={(event) =>
                              updateQueueItem(item.id, {
                                labelQty: clamp(Number(event.target.value), 1, 200),
                              })
                            }
                            className="pl-7"
                          />
                        </span>
                      </label>
                      <label className="text-[11px] text-white/40">
                        Lebar (mm)
                        <Input
                          aria-label={`Lebar label ${item.brand} ${item.model} size ${item.size_label}`}
                          type="number"
                          min={20}
                          max={120}
                          value={item.widthMm}
                          onChange={(event) =>
                            updateQueueItem(item.id, {
                              widthMm: clamp(Number(event.target.value), 20, 120),
                            })
                          }
                          className="mt-1"
                        />
                      </label>
                      <label className="text-[11px] text-white/40">
                        Tinggi (mm)
                        <Input
                          aria-label={`Tinggi label ${item.brand} ${item.model} size ${item.size_label}`}
                          type="number"
                          min={15}
                          max={80}
                          value={item.heightMm}
                          onChange={(event) =>
                            updateQueueItem(item.id, {
                              heightMm: clamp(Number(event.target.value), 15, 80),
                            })
                          }
                          className="mt-1"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                onClick={handlePrint}
                className="h-11 w-full bg-emerald-500 font-bold text-white hover:bg-emerald-400"
              >
                <Printer size={16} />
                Print {totalLabels} Label
              </Button>
              <p className="text-center text-[11px] leading-relaxed text-white/30">
                Ukuran memakai satuan mm dan dapat berbeda untuk setiap produk dalam antrean.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
