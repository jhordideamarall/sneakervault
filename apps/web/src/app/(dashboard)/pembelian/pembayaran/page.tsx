import {
  getVendorPayments,
  getOutstandingPurchaseInvoices,
  getBankAccounts,
  getSuppliers,
} from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { PembayaranVendorClient } from "@/components/pembelian/pembayaran-client";
import { redirect } from "next/navigation";
import { canSeeFinancialDashboard } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";

export const dynamic = "force-dynamic";

export default async function PembayaranVendorPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const roles = (profile.roles ?? []) as Role[];
  if (!canSeeFinancialDashboard(roles)) redirect("/workspace");

  const [payments, outstanding, bankAccounts, suppliers] = await Promise.all([
    getVendorPayments(),
    getOutstandingPurchaseInvoices(),
    getBankAccounts(),
    getSuppliers(),
  ]);

  return (
    <PembayaranVendorClient
      payments={payments}
      outstanding={outstanding}
      bankAccounts={bankAccounts}
      suppliers={suppliers as { id: string; name: string }[]}
      roles={roles as string[]}
    />
  );
}
