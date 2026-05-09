"use client";

import { useState, useRef, useEffect } from "react";
import { generateBarcodeSvg } from "@sneakervault/barcode";
import { Button, Card, Input, FieldLabel } from "@sneakervault/ui";

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
    // Generate preview SVG
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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1a1a2e]">🔣 Generate Barcode</h1>

      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="brand">Brand</FieldLabel>
            <Input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Adidas" />
          </div>
          <div>
            <FieldLabel htmlFor="model">Model / Tipe</FieldLabel>
            <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Samba White" />
          </div>
          <div>
            <FieldLabel htmlFor="size">Size</FieldLabel>
            <Input id="size" value={size} onChange={(e) => setSize(e.target.value)} placeholder="42" />
          </div>
          <div>
            <FieldLabel htmlFor="date">Tanggal</FieldLabel>
            <Input id="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor="qty">Jumlah Label</FieldLabel>
            <Input id="qty" type="number" min={1} max={100} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          </div>
        </div>
        <div className="mt-6">
          <Button onClick={handleGenerate} disabled={!brand || !model || !size}>
            Generate Barcode
          </Button>
        </div>
      </Card>

      {generated && (
        <Card>
          <p className="mb-3 text-sm text-[#6b7280]">Preview label (ukuran cetak: 50mm × 25mm):</p>
          <div className="mx-auto flex w-[50mm] h-[25mm] flex-col items-center justify-center border border-dashed border-[#d1d5db] bg-white p-1">
            <span className="text-[7pt] text-[#374151]">{date}</span>
            <div className="barcode" dangerouslySetInnerHTML={{ __html: previewSvg }} />
            <span className="text-[7pt] font-bold text-[#374151]">{brand} {model} — Size {size}</span>
          </div>
          <div className="mt-4 flex gap-2 justify-center">
            <Button size="sm" onClick={handlePrint}>🖨️ Print ({qty} label)</Button>
            <Button size="sm" variant="secondary" onClick={handleGenerate}>🔄 Generate Ulang</Button>
          </div>
          <p className="mt-2 text-center text-xs text-[#6b7280]">Kode: <span className="font-mono">{code}</span></p>
        </Card>
      )}
    </div>
  );
}
