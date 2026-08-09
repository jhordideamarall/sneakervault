import { getAccountBalances } from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { redirect } from "next/navigation";
import { canSeeFinancialDashboard } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";
import { FileBarChart } from "lucide-react";
import { formatRupiahAccounting as fmtRupiah } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PerubahanEkuitasPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const roles = (profile.roles ?? []) as Role[];
  if (!canSeeFinancialDashboard(roles)) redirect("/workspace");

  const sp = await searchParams;
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
  const defaultTo = now.toISOString().slice(0, 10);
  const from = sp.from ?? defaultFrom;
  const to = sp.to ?? defaultTo;

  const fromMinus = new Date(from);
  fromMinus.setDate(fromMinus.getDate() - 1);
  const openingBalances = await getAccountBalances({
    to: fromMinus.toISOString().slice(0, 10),
  });
  const periodBalances = await getAccountBalances({ from, to });

  const sumLeaves = (
    accounts: typeof openingBalances,
    types: string[],
  ): number => {
    const filtered = accounts.filter((a) => types.includes(a.type));
    const idsWithChildren = new Set(
      filtered.map((a) => a.parent_id).filter(Boolean) as string[],
    );
    return filtered
      .filter((a) => !idsWithChildren.has(a.account_id))
      .reduce((s, a) => s + a.balance, 0);
  };

  const openingEquity = sumLeaves(openingBalances, ["equity"]);
  const periodNetIncome =
    sumLeaves(periodBalances, ["revenue"]) -
    sumLeaves(periodBalances, ["cogs"]) -
    sumLeaves(periodBalances, ["expense"]);
  const capitalContributions =
    periodBalances.find((account) => account.code === "3.1")?.balance ?? 0;
  const prive = Math.abs(
    periodBalances.find((account) => account.code === "3.4")?.balance ?? 0,
  );
  const closingEquity =
    openingEquity + capitalContributions + periodNetIncome - prive;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] text-white/80">
            <FileBarChart size={20} strokeWidth={1.7} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Laporan Perubahan Ekuitas
            </h1>
            <p className="text-sm text-white/50">
            Periode{" "}
            {new Date(from).toLocaleDateString("id-ID", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}{" "}
            —{" "}
            {new Date(to).toLocaleDateString("id-ID", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
            </p>
          </div>
        </div>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-white/45">Dari<input className="mt-1 block h-9 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white" type="date" name="from" defaultValue={from} /></label>
          <label className="text-xs text-white/45">Sampai<input className="mt-1 block h-9 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white" type="date" name="to" defaultValue={to} /></label>
          <button type="submit" className="h-9 rounded-md bg-white px-4 text-sm font-medium text-black">Terapkan</button>
        </form>
      </div>

      <div className="rounded-lg border border-white/[0.06] bg-[#262626]">
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-white/[0.04]">
              <td className="px-6 py-4 text-white/70">Saldo Ekuitas Awal Periode</td>
              <td className="px-6 py-4 text-right tabular-nums text-white">
                {fmtRupiah(openingEquity)}
              </td>
            </tr>
            <tr className="border-b border-white/[0.04]">
              <td className="px-6 py-4 pl-10 text-white/70">
                (+) Laba/Rugi Periode Berjalan
              </td>
              <td
                className={`px-6 py-4 text-right tabular-nums ${periodNetIncome >= 0 ? "text-emerald-300" : "text-red-300"}`}
              >
                {fmtRupiah(periodNetIncome)}
              </td>
            </tr>
            <tr className="border-b border-white/[0.04]">
              <td className="px-6 py-4 pl-10 text-white/70">
                (+) Setoran Modal Pemilik
              </td>
              <td
                className="px-6 py-4 text-right tabular-nums text-emerald-300"
              >
                {fmtRupiah(capitalContributions)}
              </td>
            </tr>
            <tr className="border-b border-white/[0.04]">
              <td className="px-6 py-4 pl-10 text-white/70">
                (−) Prive
              </td>
              <td className="px-6 py-4 text-right tabular-nums text-amber-300">
                {fmtRupiah(prive)}
              </td>
            </tr>
            <tr className="bg-emerald-500/[0.04]">
              <td className="px-6 py-4 text-base font-semibold text-white">
                Saldo Ekuitas Akhir Periode
              </td>
              <td className="px-6 py-4 text-right text-base font-semibold tabular-nums text-emerald-300">
                {fmtRupiah(closingEquity)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-sky-500/15 bg-sky-500/[0.04] p-3 text-xs text-sky-200/80">
        Laba/Rugi diambil dari laporan Laba Rugi pada periode yang sama. Setoran
        modal dibaca langsung dari <strong>3.1 Modal Pemilik</strong>, dan Prive
        dibaca langsung dari jurnal <strong>3.4 Prive</strong>—bukan angka selisih.
      </div>
    </div>
  );
}
