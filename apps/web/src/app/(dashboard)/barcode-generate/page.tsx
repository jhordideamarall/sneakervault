"use client";

import { useState, useTransition } from "react";
import { generateBarcodeSvg } from "@sneakervault/barcode";
import { Button, Card, Input } from "@sneakervault/ui";
import { QrCode, Printer, RotateCcw, Package, Search, Check, Hash } from "lucide-react";
import { useToast } from "@/components/toast";
import {
  searchProductsForLabel,
  regenerateProductBarcode,
  type LabelProduct,
} from "@/lib/actions/barcode";

function svgFor(barcode: string): string {
  return generateBarcodeSvg(barcode, { width: 1.5, height: 40, displayValue: true });
}

export default function BarcodeGeneratePage() {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LabelProduct[]>([]);
  const [selected, setSelected] = useState<LabelProduct | null>(null);
  const [qty, setQty] = useState(1);
  const [previewSvg, setPreviewSvg] = useState("");

  const today = new Date().toLocaleDateString("id-ID");

  function search(value: string) {
    setQuery(value);
    if (value.trim().length < 1) {
      setResults([]);
      return;
    }
    startTransition(async () => setResults(await searchProductsForLabel(value)));
  }

  function pick(p: LabelProduct) {
    setSelected(p);
    setPreviewSvg(svgFor(p.barcode));
  }

  function regenerate() {
    if (!selected) return;
    startTransition(async () => {
      const r = await regenerateProductBarcode(selected.id);
      if (r.error || !r.barcode) {
        toast.push(r.error ?? "Gagal generate barcode", "error");
        return;
      }
      const updated = { ...selected, barcode: r.barcode };
      setSelected(updated);
      setPreviewSvg(svgFor(r.barcode));
      setResults((rs) => rs.map((x) => (x.id === updated.id ? updated : x)));
      toast.push("Barcode baru tersimpan ke produk", "success");
    });
  }

  function handlePrint() {
    if (!selected) return;
    const w = window.open("", "_blank");
    if (!w) return;
    const barcodeSvg = svgFor(selected.barcode);
    const label = `${selected.brand} ${selected.model}${selected.color ? " " + selected.color : ""} — Size ${selected.size}`;
    w.document.write(`<!doctype html><html><head><title>Barcode</title><style>
      body { margin: 0; padding: 10px; display: flex; flex-wrap: wrap; }
      .label { width: 50mm; height: 25mm; border: 1px dashed #ccc; display: inline-flex;
        flex-direction: column; align-items: center; justify-content: center;
        padding: 2mm; box-sizing: border-box; page-break-inside: avoid; margin: 2mm; font-family: Arial, sans-serif; }
      .date { font-size: 7pt; margin-bottom: 1mm; }
      .info { font-size: 7pt; font-weight: bold; margin-top: 1mm; }
      .barcode { display: flex; justify-content: center; }
      .barcode svg { height: 12mm; width: auto; }
      @media print { .label { border: none; margin: 1mm; } }
    </style></head><body>`);
    for (let i = 0; i < qty; i++) {
      w.document.write(`<div class="label"><div class="date">${today}</div><div class="barcode">${barcodeSvg}</div><div class="info">${label}</div></div>`);
    }
    w.document.write(`<script>setTimeout(()=>{window.print();window.onafterprint=()=>window.close();},300)<\/script></body></html>`);
    w.document.close();
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-white">
          <QrCode className="text-white/40" size={28} />
          Cetak Label Barcode
        </h1>
        <p className="text-sm text-white/50">
          Pilih produk yang ada di sistem — label memakai barcode asli produk, jadi nanti benar-benar bisa di-scan.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: search + select */}
        <div className="space-y-4 lg:col-span-2">
          <Card className="border-white/[0.06] bg-[#262626] p-5 shadow-xl">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => search(e.target.value)}
                placeholder="Cari produk: brand, model, SKU, atau barcode…"
                className="pl-9"
              />
            </div>

            <div className="mt-3 max-h-[420px] divide-y divide-white/[0.04] overflow-y-auto rounded-lg border border-white/[0.05]">
              {query.trim().length < 1 ? (
                <div className="px-4 py-10 text-center text-sm text-white/35">Ketik untuk mencari produk.</div>
              ) : pending && results.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-white/35">Mencari…</div>
              ) : results.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-white/35">
                  Produk tidak ditemukan. Tambahkan dulu di Gudang → Barang Masuk atau Inventori.
                </div>
              ) : (
                results.map((p) => {
                  const active = selected?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => pick(p)}
                      className={
                        "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors " +
                        (active ? "bg-white/[0.06]" : "hover:bg-white/[0.03]")
                      }
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm text-white/85">
                          {p.brand} {p.model}{" "}
                          <span className="text-white/45">· {p.color ?? "—"} · Size {p.size}</span>
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-white/40">
                          SKU {p.sku} · Barcode {p.barcode} · Stok {p.quantity}
                        </div>
                      </div>
                      {active ? <Check size={16} className="shrink-0 text-emerald-400" /> : null}
                    </button>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        {/* Right: preview + print */}
        <div className="lg:col-span-1">
          <Card className="flex min-h-[300px] flex-col items-center justify-center border-white/[0.06] bg-[#262626] p-6 text-center shadow-xl">
            {selected ? (
              <div className="flex w-full flex-col items-center">
                <h3 className="mb-5 w-full text-left text-xs font-semibold uppercase tracking-wider text-white/40">
                  Preview Label
                </h3>

                <div className="flex h-[25mm] w-[50mm] flex-col items-center justify-center rounded-sm bg-white p-2 shadow-2xl shadow-black/50">
                  <span className="mb-1 text-[7pt] font-medium text-gray-500">{today}</span>
                  <div className="flex h-[12mm] items-center justify-center" dangerouslySetInnerHTML={{ __html: previewSvg }} />
                  <span className="mt-1 w-full truncate text-center text-[7pt] font-bold uppercase text-black">
                    {selected.brand} {selected.model} — {selected.size}
                  </span>
                </div>

                <div className="mt-5 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Barcode:</span>
                  <span className="font-mono text-xs font-bold tracking-tight text-amber-400/80">{selected.barcode}</span>
                </div>

                <div className="mt-6 w-full">
                  <label className="mb-1.5 block text-left text-[11px] text-white/40">Jumlah label</label>
                  <div className="relative">
                    <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                    <Input type="number" min={1} max={200} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} className="pl-9" />
                  </div>
                </div>

                <div className="mt-4 flex w-full flex-col gap-2">
                  <Button onClick={handlePrint} className="h-11 w-full bg-emerald-500 font-bold text-white hover:bg-emerald-400">
                    <Printer size={16} className="mr-2" /> Print {qty} Label
                  </Button>
                  <Button variant="ghost" onClick={regenerate} disabled={pending} className="h-11 w-full text-white/45 hover:text-white/80">
                    <RotateCcw size={14} className="mr-2" /> Generate barcode baru &amp; simpan
                  </Button>
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-white/30">
                  “Generate barcode baru” mengganti barcode produk ini dengan kode unik baru (untuk produk yang barcode-nya masih sementara).
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 opacity-20">
                <Package size={64} strokeWidth={1} />
                <p className="text-sm font-medium">Pilih produk untuk membuat label.</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
