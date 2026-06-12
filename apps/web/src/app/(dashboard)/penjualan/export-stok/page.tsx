import { ExportStokClient } from "@/components/penjualan/export-stok-client";

export default function ExportStokPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Export Stok Marketplace
        </h1>
        <p className="text-white/50">
          Isi template Mass Update / Batch Edit dari Shopee & TikTok dengan stok
          sistem — round-trip biar stok marketplace sinkron dengan gudang.
        </p>
      </div>

      <ExportStokClient />
    </div>
  );
}
