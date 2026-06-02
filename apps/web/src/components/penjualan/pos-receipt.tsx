"use client";

import { useState } from "react";
import { Printer, CheckCircle2, RotateCcw, X } from "lucide-react";
import { cn } from "@sneakervault/ui";
import type { ReceiptSettings } from "@/lib/receipt";

export type { ReceiptSettings } from "@/lib/receipt";

export type ReceiptSale = {
  invoice_number: string;
  payment_number: string;
  date: string;
  cashier: string;
  customer_name: string;
  payment_label: string;
  lines: { name: string; qty: number; price: number }[];
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  change: number;
};

const rp = (v: number) => `Rp ${Number(v).toLocaleString("id-ID")}`;

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PosReceipt({
  sale,
  settings,
  onClose,
}: {
  sale: ReceiptSale;
  settings: ReceiptSettings;
  onClose: () => void;
}) {
  const [paper, setPaper] = useState<"58mm" | "80mm">(settings.paper_size);
  const width = paper === "80mm" ? 300 : 230;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="pos-no-print absolute inset-0 bg-slate-900/40 animate-in fade-in duration-200"
        aria-hidden
      />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden rounded-3xl bg-white shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-300">
        {/* Success header */}
        <div className="pos-no-print flex items-center justify-between border-b border-slate-100 bg-emerald-50 px-5 py-3.5">
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="size-4" />
            <span className="text-[12px] font-black uppercase tracking-widest">
              Pembayaran Berhasil
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-emerald-700/60 hover:bg-emerald-100"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Receipt slip */}
        <div className="flex flex-1 justify-center overflow-y-auto bg-slate-100 p-5">
          <div
            className="pos-receipt-print relative h-fit overflow-hidden rounded-sm border-t-8 border-slate-200 bg-white p-5 pt-6 font-mono text-slate-900 shadow-md transition-[width] duration-500 ease-in-out"
            style={{ width }}
          >
            {/* zigzag paper edge */}
            <div className="pos-no-print pointer-events-none absolute inset-x-0 top-0 -mt-1 flex justify-between px-1 opacity-10">
              {Array.from({ length: 22 }).map((_, i) => (
                <span key={i} className="size-2 rounded-full bg-slate-500" />
              ))}
            </div>
            <div className="text-center">
              <p className="text-[13px] font-black uppercase leading-tight">
                {settings.header || settings.store_name}
              </p>
              {settings.address ? (
                <p className="mt-1 text-[9px] leading-tight text-slate-500">
                  {settings.address}
                </p>
              ) : null}
              {settings.phone ? (
                <p className="text-[9px] leading-tight text-slate-500">{settings.phone}</p>
              ) : null}
            </div>

            <div className="my-3 border-t border-dashed border-slate-300" />

            <div className="space-y-0.5 text-[10px] text-slate-600">
              <div className="flex justify-between"><span>No</span><span>{sale.invoice_number}</span></div>
              <div className="flex justify-between"><span>Tgl</span><span>{formatDate(sale.date)}</span></div>
              <div className="flex justify-between"><span>Kasir</span><span>{sale.cashier}</span></div>
              <div className="flex justify-between gap-2"><span>Cust</span><span className="max-w-[60%] truncate">{sale.customer_name}</span></div>
              <div className="flex justify-between"><span>Bayar</span><span>{sale.payment_label}</span></div>
            </div>

            <div className="my-3 border-t border-dashed border-slate-300" />

            <div className="space-y-2">
              {sale.lines.map((l, i) => (
                <div key={i} className="text-[10px]">
                  <div className="flex justify-between gap-2">
                    <span className="flex-1 leading-tight">{l.name}</span>
                    <span className="font-bold tabular-nums">{rp(l.price * l.qty)}</span>
                  </div>
                  <div className="text-[9px] tabular-nums text-slate-400">
                    {l.qty} x {rp(l.price)}
                  </div>
                </div>
              ))}
            </div>

            <div className="my-3 border-t border-dashed border-slate-300" />

            <div className="space-y-1 text-[10px]">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="tabular-nums">{rp(sale.subtotal)}</span>
              </div>
              {sale.discount > 0 ? (
                <div className="flex justify-between text-slate-600">
                  <span>Diskon</span>
                  <span className="tabular-nums">-{rp(sale.discount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between pt-1 text-[15px] font-black">
                <span>TOTAL</span>
                <span className="tabular-nums">{rp(sale.total)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Bayar</span>
                <span className="tabular-nums">{rp(sale.paid)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Kembali</span>
                <span className="tabular-nums">{rp(sale.change)}</span>
              </div>
            </div>

            <div className="my-3 border-t border-dashed border-slate-300" />

            <div className="text-center text-[9px] leading-tight text-slate-500">
              {(settings.footer || "Terima kasih").split("\n").map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>

            <div className="mt-4 flex justify-center">
              <span className="rounded-sm border-2 border-[#E5484D] px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-[#E5484D]">
                Lunas
              </span>
            </div>

            {/* zigzag bottom edge */}
            <div className="pos-no-print mt-5 border-b-[6px] border-dashed border-slate-200" />
          </div>
        </div>

        {/* Actions */}
        <div className="pos-no-print space-y-2 border-t border-slate-100 bg-white p-4">
          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
              Kertas
            </span>
            {(["58mm", "80mm"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPaper(p)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-[11px] font-black uppercase transition-colors",
                  paper === p
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-[11px] font-black uppercase tracking-widest text-white transition-colors hover:bg-black"
          >
            <Printer className="size-4" /> Cetak Struk
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-50 text-[11px] font-black uppercase tracking-widest text-slate-500 transition-colors hover:bg-slate-100"
          >
            <RotateCcw className="size-4" /> Transaksi Baru
          </button>
        </div>
      </div>
    </div>
  );
}
