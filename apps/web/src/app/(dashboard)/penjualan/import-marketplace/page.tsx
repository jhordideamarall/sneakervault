import { Upload } from "lucide-react";
import { ImportMarketplaceClient } from "@/components/penjualan/import-marketplace-client";

export default function ImportMarketplacePage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Import Laporan Marketplace
        </h1>
        <p className="text-white/50">
          Tarik laporan penjualan Shopee & TikTok dari Excel/CSV — parser deterministik jadi invoice & jurnal.
        </p>
      </div>

      <ImportMarketplaceClient />
    </div>
  );
}
