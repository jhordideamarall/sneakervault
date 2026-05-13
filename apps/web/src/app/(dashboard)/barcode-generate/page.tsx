"use client";

import { useState, useRef, useEffect } from "react";
import { generateBarcodeSvg } from "@sneakervault/barcode";
import { Button, Card, Input, FieldLabel } from "@sneakervault/ui";
import { QrCode, Printer, RotateCcw, Package, Tag, Calendar, Hash } from "lucide-react";

export default function BarcodeGeneratePage() {
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [size, setSize] = useState("");
  const [date, setDate] = useState(new Date().toLocaleDateString("id-ID"));
  const [qty, setQty] = useState(1);
  const [generated, setGenerated] = useState(false);
  const [code, setCode] = useState("");
  const [previewSvg, setPreviewSvg] = useState("");

  function generateCode() {
    return String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 900) + 100);
  }

  function handleGenerate() {
    const newCode = generateCode();
    setCode(newCode);
    setGenerated(true);
    const svg = generateBarcodeSvg(newCode, { width: 1.5, height: 40 });
    setPreviewSvg(svg);
  }

  function handlePrint() {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Barcode</title><style>
      body { margin: 0; padding: 10px; display: flex; flex-wrap: wrap; }
      .label { 
        width: 50mm; height: 25mm; 
        border: 1px dashed #ccc; 
        display: inline-flex; flex-direction: column; 
        align-items: center; justify-content: center;
        padding: 2mm; box-sizing: border-box;
        page-break-inside: avoid; margin: 2mm;
        font-family: Arial, sans-serif;
      }
      .date { font-size: 7pt; margin-bottom: 1mm; }
      .info { font-size: 7pt; font-weight: bold; margin-top: 1mm; }
      .barcode { display: flex; justify-content: center; }
      .barcode svg { height: 12mm; width: auto; }
      @media print { .label { border: none; margin: 1mm; } }
    </style></head><body>`);
    const barcodeSvg = generateBarcodeSvg(code, { width: 1.5, height: 40, displayValue: true });
    for (let i = 0; i < qty; i++) {
      w.document.write(`<div class="label">
        <div class="date">${date}</div>
        <div class="barcode">${barcodeSvg}</div>
        <div class="info">${brand} ${model} — Size ${size}</div>
      </div>`);
    }
    w.document.write(`<script>setTimeout(()=>{window.print();window.onafterprint=()=>window.close();},300)<\/script></body></html>`);
    w.document.close();
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
          <QrCode className="text-white/40" size={28} />
          Generate Barcode
        </h1>
        <p className="text-white/50 text-sm">
          Cetak label barcode untuk ditempel pada produk baru.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-white/[0.06] bg-[#262626] p-6 shadow-xl">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/40 mb-6 flex items-center gap-2">
               <Tag size={16} /> Detail Produk
            </h3>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel>
Brand</FieldLabel>
                <div className="relative">
                   <Package className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={16} />
                   <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Contoh: Nike" className="pl-10" />
                </div>
              </div>
              <div className="space-y-2">
                <FieldLabel>
Model / Tipe</FieldLabel>
                <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Contoh: Dunk Low Panda" />
              </div>
              <div className="space-y-2">
                <FieldLabel>
Size</FieldLabel>
                <Input value={size} onChange={(e) => setSize(e.target.value)} placeholder="Contoh: 42" />
              </div>
              <div className="space-y-2">
                <FieldLabel>
Tanggal Cetak</FieldLabel>
                <div className="relative">
                   <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={16} />
                   <Input value={date} onChange={(e) => setDate(e.target.value)} className="pl-10" />
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <FieldLabel>
Jumlah Label</FieldLabel>
                <div className="relative">
                   <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={16} />
                   <Input type="number" min={1} max={100} value={qty} onChange={(e) => setQty(Number(e.target.value))} className="pl-10" />
                </div>
              </div>
            </div>
            <div className="mt-8">
              <Button onClick={handleGenerate} disabled={!brand || !model || !size} className="w-full h-12 bg-white text-black font-bold shadow-lg shadow-white/5">
                Generate Barcode Baru
              </Button>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-1 space-y-6">
           <Card className="border-white/[0.06] bg-[#262626] p-6 shadow-xl min-h-[300px] flex flex-col items-center justify-center text-center">
              {generated ? (
                <div className="animate-in zoom-in-95 duration-300 w-full flex flex-col items-center">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-6 w-full text-left">Preview Cetak</h3>
                  
                  {/* Realistic Sticker Simulation */}
                  <div className="flex w-[50mm] h-[25mm] flex-col items-center justify-center rounded-sm bg-white p-2 shadow-2xl shadow-black/50">
                    <span className="text-[7pt] text-gray-500 font-medium mb-1">{date}</span>
                    <div className="barcode-preview flex items-center justify-center h-[12mm]" dangerouslySetInnerHTML={{ __html: previewSvg }} />
                    <span className="text-[7pt] font-bold text-black mt-1 uppercase truncate w-full text-center">
                       {brand} {model} — {size}
                    </span>
                  </div>

                  <div className="mt-8 flex flex-col gap-2 w-full">
                    <Button onClick={handlePrint} className="w-full h-11 bg-emerald-500 hover:bg-emerald-400 text-white font-bold">
                      <Printer size={16} className="mr-2" /> Print {qty} Label
                    </Button>
                    <Button variant="ghost" onClick={handleGenerate} className="w-full h-11 text-white/40 hover:text-white/80">
                      <RotateCcw size={14} className="mr-2" /> Generate Ulang
                    </Button>
                  </div>
                  
                  <div className="mt-6 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                     <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">KODE:</span>
                     <span className="text-xs font-mono font-bold text-amber-400/80 tracking-tighter">{code}</span>
                  </div>
                </div>
              ) : (
                <div className="opacity-20 flex flex-col items-center gap-4">
                   <QrCode size={64} strokeWidth={1} />
                   <p className="text-sm font-medium">Isi detail produk untuk melihat preview.</p>
                </div>
              )}
           </Card>
        </div>
      </div>
    </div>
  );
}
