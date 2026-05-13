import {
  getPurchaseInvoices,
  getInvoicablePos,
  getSuppliers,
} from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { FakturPembelianClient } from "@/components/pembelian/faktur-client";
import { redirect } from "next/navigation";
import { canSeeFinancialDashboard } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";

export const dynamic = "force-dynamic";

export default async function FakturPembelianPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const roles = (profile.roles ?? []) as Role[];
  if (!canSeeFinancialDashboard(roles)) redirect("/workspace");

  const [invoices, invoicablePos, suppliers] = await Promise.all([
    getPurchaseInvoices(),
    getInvoicablePos(),
    getSuppliers(),
  ]);

  return (
    <FakturPembelianClient
      invoices={invoices}
      invoicablePos={invoicablePos}
      suppliers={suppliers as { id: string; name: string }[]}
      roles={roles as string[]}
    />
  );
}
