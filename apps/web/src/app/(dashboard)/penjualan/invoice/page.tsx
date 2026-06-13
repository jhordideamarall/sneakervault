import {
  getSalesInvoices,
  getCustomers,
  getProductsForSalesPicker,
} from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { SalesInvoiceClient } from "@/components/penjualan/invoice-client";
import { redirect } from "next/navigation";
import { canSeeFinancialDashboard } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";

export const dynamic = "force-dynamic";

export default async function SalesInvoicePage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const roles = (profile.roles ?? []) as Role[];
  const canAccess =
    canSeeFinancialDashboard(roles) || roles.includes("admin_online");
  if (!canAccess) redirect("/workspace");

  const [invoices, customers, products] = await Promise.all([
    getSalesInvoices(),
    getCustomers(),
    getProductsForSalesPicker(),
  ]);

  return (
    <SalesInvoiceClient
      invoices={invoices}
      customers={customers}
      products={products}
      detailById={{}}
      roles={roles as string[]}
    />
  );
}
