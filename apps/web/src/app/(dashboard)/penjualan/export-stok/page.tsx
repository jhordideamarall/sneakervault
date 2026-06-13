import { ExportStokClient } from "@/components/penjualan/export-stok-client";

export default function ExportStokPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Update Stok Marketplace
        </h1>
        <p className="text-white/50">
          Upload template Mass Update / Batch Edit dari Seller Center. Sistem mengisi stok/harga dari inventory, lalu kamu download file hasilnya untuk upload balik ke marketplace.
        </p>
      </div>

      <ExportStokClient />
    </div>
  );
}
