"use client";

import { useState, useTransition, useRef } from "react";
import { Button, Card, Badge, Alert } from "@sneakervault/ui";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileUp,
  Search,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Info,
  Trash2,
} from "lucide-react";
import type { MarketplaceOrder, MarketplaceOrderLine } from "@/lib/actions/marketplace-import";
import { bulkImportMarketplaceOrders } from "@/lib/actions/marketplace-import";

type ImportState = "upload" | "preview" | "processing" | "result";

export function ImportMarketplaceClient() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ImportState>("upload");
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [platform, setPlatform] = useState<"shopee" | "tiktok" | null>(null);
  const [result, setResult] = useState<{
    success: number;
    skipped: number;
    errors: { order_id: string; reason: string }[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setState("upload");
    setOrders([]);
    setPlatform(null);
    setResult(null);
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
        const wb = XLSX.read(data, { type: "array" });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) {
          toast.push("File Excel tidak valid", "error");
          return;
        }

        const sheet = wb.Sheets[sheetName];
        if (!sheet) {
          toast.push("Sheet tidak ditemukan", "error");
          return;
        }

        const rows = XLSX.utils.sheet_to_json(sheet) as Record<string, any>[];

        if (rows.length === 0) {
          toast.push("File kosong", "error");
          return;
        }

        // Auto-detect platform
        const firstRow = rows[0];
        if (!firstRow) {
          toast.push("Tidak ada baris data", "error");
          return;
        }
        const firstRowKeys = Object.keys(firstRow);
        let detected: "shopee" | "tiktok" | null = null;
        if (firstRowKeys.includes("No. Pesanan") || firstRowKeys.includes("Order ID Shopee")) {
          detected = "shopee";
        } else if (firstRowKeys.includes("Order ID") && firstRowKeys.includes("Seller SKU")) {
          detected = "tiktok";
        }

        if (!detected) {
          toast.push("Format file tidak dikenali sebagai Shopee atau TikTok", "error");
          return;
        }

        setPlatform(detected);

        // Map rows to MarketplaceOrder
        const mappedOrders = new Map<string, MarketplaceOrder>();

        rows.forEach((row) => {
          let orderId = "";
          let customerName = "Marketplace Customer";
          let sku = "";
          let qty = 0;
          let unitPrice = 0;
          let productName = "";
          let orderDateVal = new Date().toISOString().split("T")[0] as string;
          let shipping = 0;
          let discount = 0;
          let adminFee = 0;

          if (detected === "shopee") {
            orderId = String(row["No. Pesanan"] || "");
            customerName = String(row["Username (Pembeli)"] || "Shopee User");
            sku = String(row["No. Referensi SKU"] || "").trim();
            qty = Number(row["Jumlah"] || 0);
            unitPrice = Number(row["Harga Asli"] || 0);
            productName = String(row["Nama Produk"] || "");
            orderDateVal = row["Waktu Pesanan Dibuat"] ? (new Date(row["Waktu Pesanan Dibuat"]).toISOString().split("T")[0] as string) : orderDateVal;
            shipping = Number(row["Ongkos Kirim Dibayar Pembeli"] || 0);
            discount = Math.abs(Number(row["Diskon Dari Penjual"] || 0));
            adminFee = Number(row["Biaya Administrasi"] || 0);
          } else if (detected === "tiktok") {
            orderId = String(row["Order ID"] || "");
            customerName = String(row["Buyer Username"] || "TikTok User");
            sku = String(row["Seller SKU"] || "").trim();
            qty = Number(row["Quantity"] || 0);
            unitPrice = Number(row["SKU Unit Original Price"] || 0);
            productName = String(row["Product Name"] || "");
            orderDateVal = row["Order Creation Time"] ? (new Date(row["Order Creation Time"]).toISOString().split("T")[0] as string) : orderDateVal;
            shipping = Number(row["Shipping Fee"] || 0);
            discount = Math.abs(Number(row["Seller Discount"] || 0));
          }

          if (!orderId || !sku) return;

          if (!mappedOrders.has(orderId)) {
            mappedOrders.set(orderId, {
              order_id: orderId,
              customer_name: customerName,
              order_date: orderDateVal,
              channel: detected!,
              lines: [],
              shipping_fee: shipping,
              discount: discount,
              admin_fee: adminFee,
            });
          }

          const order = mappedOrders.get(orderId)!;
          // Add line
          order.lines.push({
            sku,
            qty,
            unit_price: unitPrice,
            product_name: productName,
          });
          
          // Accumulate totals if multiple lines have different headers? 
          // Usually headers are same per row in these exports.
        });

        setOrders(Array.from(mappedOrders.values()));
        setState("preview");
      } catch (err) {
        toast.push("Gagal memproses file", "error");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleImport() {
    startTransition(async () => {
      const r = await bulkImportMarketplaceOrders(orders);
      setResult(r);
      setState("result");
      if (r.success > 0) {
        toast.push(`${r.success} order berhasil diimport`, "success");
      }
    });
  }

  return (
    <div className="space-y-6">
      {state === "upload" && (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 rounded-full bg-white/5 p-4 text-white/40">
            <Upload size={32} />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-white">
            Upload Laporan Penjualan
          </h2>
          <p className="mb-8 max-w-sm text-sm text-white/50">
            Pilih file Excel laporan pesanan dari Shopee Seller Center atau TikTok Shop Seller Center.
          </p>

          <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black transition-all hover:bg-white/90 active:scale-95">
            <FileUp size={18} />
            Pilih File Excel
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFile}
              className="hidden"
            />
          </label>

          <div className="mt-8 flex gap-4 text-xs text-white/30">
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-orange-500" />
              Shopee Support
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-pink-500" />
              TikTok Support
            </div>
          </div>
        </Card>
      )}

      {state === "preview" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge tone="default" className="text-white/60">
                Preview Import
              </Badge>
              <h2 className="text-xl font-bold text-white">
                {orders.length} Order Terdeteksi
              </h2>
              <Badge
                className={
                  platform === "shopee"
                    ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
                    : "bg-pink-500/10 text-pink-400 border-pink-500/20"
                }
              >
                {platform?.toUpperCase()}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={reset}>
                Batal
              </Button>
              <Button onClick={handleImport} disabled={pending}>
                {pending ? "Mengimport..." : "Konfirmasi Import"}
                <ChevronRight size={16} className="ml-1" />
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {orders.slice(0, 12).map((order) => (
              <Card key={order.order_id} className="group relative overflow-hidden border-white/[0.04] bg-[#262626] p-4">
                <div className="mb-3 flex items-start justify-between">
                  <div className="space-y-0.5">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-white/30">
                      ID Pesanan
                    </div>
                    <div className="font-mono text-xs font-semibold text-white/80">
                      {order.order_id}
                    </div>
                  </div>
                  <div className="text-right space-y-0.5">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-white/30">
                      Tanggal
                    </div>
                    <div className="text-xs font-medium text-white/60">
                      {order.order_date}
                    </div>
                  </div>
                </div>

                <div className="mb-4 space-y-2">
                  {order.lines.map((line, i) => (
                    <div key={i} className="flex justify-between gap-4">
                      <div className="flex-1 overflow-hidden">
                        <div className="truncate text-xs text-white/80" title={line.product_name}>
                          {line.product_name}
                        </div>
                        <div className="font-mono text-[10px] text-white/40">
                          {line.sku}
                        </div>
                      </div>
                      <div className="text-right text-xs font-medium text-white/70">
                        {line.qty}x
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/[0.04] pt-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/40">Total Tagihan</span>
                    <span className="font-bold text-white">
                      Rp {(
                        order.lines.reduce((a, b) => a + b.qty * b.unit_price, 0) -
                        order.discount +
                        order.shipping_fee -
                        order.admin_fee
                      ).toLocaleString()}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
            {orders.length > 12 && (
              <div className="flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center sm:col-span-2 lg:col-span-3">
                <div className="text-sm text-white/30">
                  + {orders.length - 12} order lainnya tidak ditampilkan di preview
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {state === "result" && result && (
        <div className="mx-auto max-w-2xl space-y-6">
          <Card className="border-white/[0.06] bg-[#262626] p-8 text-center">
            <div className="mb-4 flex justify-center">
              {result.errors.length === 0 ? (
                <div className="rounded-full bg-emerald-500/10 p-4 text-emerald-500">
                  <CheckCircle2 size={48} />
                </div>
              ) : (
                <div className="rounded-full bg-amber-500/10 p-4 text-amber-500">
                  <AlertCircle size={48} />
                </div>
              )}
            </div>
            <h2 className="mb-2 text-2xl font-bold text-white">
              Import Selesai
            </h2>
            <p className="mb-8 text-white/50">
              Hasil pemrosesan laporan {platform?.toUpperCase()}.
            </p>

            <div className="mb-8 grid grid-cols-3 gap-4">
              <div className="rounded-xl bg-white/[0.03] p-4">
                <div className="text-lg font-bold text-emerald-400">
                  {result.success}
                </div>
                <div className="text-[10px] uppercase text-white/30">Berhasil</div>
              </div>
              <div className="rounded-xl bg-white/[0.03] p-4">
                <div className="text-lg font-bold text-white/60">
                  {result.skipped}
                </div>
                <div className="text-[10px] uppercase text-white/30">Dilewati</div>
              </div>
              <div className="rounded-xl bg-white/[0.03] p-4">
                <div className="text-lg font-bold text-red-400">
                  {result.errors.length}
                </div>
                <div className="text-[10px] uppercase text-white/30">Gagal</div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="mb-8 text-left space-y-2">
                <div className="text-xs font-semibold text-white/40 uppercase tracking-wider px-1">
                  Detail Kesalahan
                </div>
                <div className="max-h-60 overflow-y-auto rounded-xl bg-black/20 p-4 font-mono text-[11px] space-y-1.5">
                  {result.errors.map((err, i) => (
                    <div key={i} className="flex gap-3 text-white/60">
                      <span className="text-red-400/80">[{err.order_id}]</span>
                      <span>{err.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={reset}>
                Import File Lain
              </Button>
              <Button className="flex-1" onClick={() => router.push("/penjualan/invoice")}>
                Lihat Invoice
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
