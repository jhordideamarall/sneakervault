import { SettlementImportClient } from "@/components/penjualan/settlement-import-client";

export default function SettlementPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Settlement Marketplace
        </h1>
        <p className="text-white/50">
          Rekonsiliasi pencairan dana marketplace ke finance — tahap belum cair
          (tertahan) lalu tahap cair (masuk bank).
        </p>
      </div>

      <SettlementImportClient />
    </div>
  );
}
