import { getBankAccounts, getCustomers, getProducts } from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { getReceiptSettings } from "@/lib/actions/receipt-settings";
import { PosClient } from "@/components/penjualan/pos-client";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const [productsRes, bankAccounts, customers, receiptSettings, profile] =
    await Promise.all([
      getProducts({ limit: 500 }),
      getBankAccounts(),
      getCustomers(),
      getReceiptSettings(),
      getCurrentUser(),
    ]);

  return (
    <PosClient
      products={
        productsRes.data as Parameters<typeof PosClient>[0]["products"]
      }
      bankAccounts={bankAccounts}
      customers={customers}
      receiptSettings={receiptSettings}
      cashierName={profile?.full_name ?? "Kasir"}
    />
  );
}
