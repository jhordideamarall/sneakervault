import { SettlementImportClient } from "@/components/penjualan/settlement-import-client";

export default function SettlementPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Rekonsiliasi Settlement Marketplace
        </h1>
        <p className="text-white/50">
          Upload laporan pencairan dana marketplace setelah pesanan diimport. Sistem melunasi invoice terkait, mencatat penerimaan bank bersih, dan membukukan biaya marketplace aktual.
        </p>
      </div>

      <SettlementImportClient />
    </div>
  );
}
