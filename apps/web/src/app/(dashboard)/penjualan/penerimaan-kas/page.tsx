import {
  getCustomerPayments,
  getOutstandingSalesInvoices,
  getBankAccounts,
  getCustomers,
} from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { PenerimaanKasClient } from "@/components/penjualan/penerimaan-kas-client";
import { redirect } from "next/navigation";
import { canSeeFinancialDashboard } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";

export const dynamic = "force-dynamic";

export default async function PenerimaanKasPage({
  searchParams,
}: {
  searchParams: Promise<{ invoice?: string }>;
}) {
  const sp = await searchParams;
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const roles = (profile.roles ?? []) as Role[];
  if (!canSeeFinancialDashboard(roles)) redirect("/workspace");

  const [payments, outstanding, bankAccounts, customers] = await Promise.all([
    getCustomerPayments(),
    getOutstandingSalesInvoices(),
    getBankAccounts(),
    getCustomers(),
  ]);

  return (
    <PenerimaanKasClient
      payments={payments}
      outstanding={outstanding}
      bankAccounts={bankAccounts}
      customers={customers}
      roles={roles as string[]}
      initialInvoiceId={sp.invoice}
    />
  );
}
