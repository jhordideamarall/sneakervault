import { ImportMarketplaceClient } from "@/components/penjualan/import-marketplace-client";

export default function ImportMarketplacePage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Import Pesanan Marketplace
        </h1>
        <p className="text-white/50">
          Upload laporan pesanan/order report Shopee, Tokopedia, atau TikTok. Setelah review cocok, sistem membuat invoice, mengurangi stok, dan membuat jurnal.
        </p>
      </div>

      <ImportMarketplaceClient />
    </div>
  );
}
