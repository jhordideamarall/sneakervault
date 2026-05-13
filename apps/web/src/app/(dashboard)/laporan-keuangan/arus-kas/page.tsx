import { getBankTransactions, getBankAccounts } from "@/lib/queries";
import { getCurrentUser } from "@/lib/actions/auth";
import { redirect } from "next/navigation";
import { canSeeFinancialDashboard } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";
import { FileBarChart, TrendingUp, TrendingDown } from "lucide-react";

export const dynamic = "force-dynamic";

function fmtRupiah(n: number): string {
  const abs = Math.abs(Math.round(n));
  const formatted = `Rp ${abs.toLocaleString("id-ID")}`;
  return n < 0 ? `(${formatted})` : formatted;
}

const sourceCategory: Record<string, "operasi" | "investasi" | "pendanaan"> = {
  vendor_payment: "operasi",
  vendor_payment_reversal: "operasi",
  customer_payment: "operasi",
  customer_payment_reversal: "operasi",
  manual: "operasi", // default - bisa di-override owner via category
};

const categoryLabel: Record<
  "operasi" | "investasi" | "pendanaan",
  string
> = {
  operasi: "Aktivitas Operasi",
  investasi: "Aktivitas Investasi",
  pendanaan: "Aktivitas Pendanaan",
};

export default async function ArusKasPage({
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
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const defaultTo = now.toISOString().slice(0, 10);
  const from = sp.from ?? defaultFrom;
  const to = sp.to ?? defaultTo;

  const [allTxs, accounts] = await Promise.all([
    getBankTransactions({ limit: 10000 }),
    getBankAccounts({ includeInactive: true }),
  ]);

  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  const periodTxs = allTxs.filter((t) => {
    const d = new Date(t.transaction_date);
    return d >= fromDate && d <= toDate;
  });

  // Opening balance: sum bank balances at start = current_balance - net of period & after
  // Simplification: opening = sum of bank balances minus net change in period
  const totalCurrent = accounts
    .filter((a) => a.is_active)
    .reduce((s, a) => s + Number(a.current_balance), 0);

  // Group by category
  type CatGroup = {
    label: string;
    in: number;
    out: number;
    items: Array<{ description: string; amount: number; type: "in" | "out" }>;
  };
  const cats: Record<"operasi" | "investasi" | "pendanaan", CatGroup> = {
    operasi: { label: categoryLabel.operasi, in: 0, out: 0, items: [] },
    investasi: { label: categoryLabel.investasi, in: 0, out: 0, items: [] },
    pendanaan: { label: categoryLabel.pendanaan, in: 0, out: 0, items: [] },
  };

  for (const t of periodTxs) {
    const cat =
      sourceCategory[t.related_entity_type ?? "manual"] ?? "operasi";
    if (t.type === "credit") {
      cats[cat].in += t.amount;
      cats[cat].items.push({
        description: t.description,
        amount: t.amount,
        type: "in",
      });
    } else {
      cats[cat].out += t.amount;
      cats[cat].items.push({
        description: t.description,
        amount: t.amount,
        type: "out",
      });
    }
  }

  const totalIn = cats.operasi.in + cats.investasi.in + cats.pendanaan.in;
  const totalOut = cats.operasi.out + cats.investasi.out + cats.pendanaan.out;
  const netChange = totalIn - totalOut;
  // Approx opening balance
  const openingBalance = totalCurrent - allTxs
    .filter((t) => new Date(t.transaction_date) > toDate)
    .reduce((s, t) => s + (t.type === "credit" ? -t.amount : t.amount), 0)
    - netChange;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] text-white/80">
          <FileBarChart size={20} strokeWidth={1.7} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Laporan Arus Kas
          </h1>
          <p className="text-sm text-white/50">
            Periode{" "}
            {fromDate.toLocaleDateString("id-ID", {
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Kas Masuk"
          value={fmtRupiah(totalIn)}
          tone="emerald"
          icon={<TrendingUp size={14} strokeWidth={1.8} />}
        />
        <StatTile
          label="Kas Keluar"
          value={fmtRupiah(totalOut)}
          tone="amber"
          icon={<TrendingDown size={14} strokeWidth={1.8} />}
        />
        <StatTile
          label="Net Cashflow"
          value={fmtRupiah(netChange)}
          tone={netChange >= 0 ? "emerald" : "red"}
        />
        <StatTile
          label="Saldo Kas Akhir"
          value={fmtRupiah(totalCurrent)}
          tone="white"
        />
      </div>

      <div className="space-y-3">
        {(["operasi", "investasi", "pendanaan"] as const).map((c) => {
          const g = cats[c];
          const net = g.in - g.out;
          if (g.items.length === 0) {
            return (
              <div
                key={c}
                className="rounded-lg border border-white/[0.06] bg-[#262626] px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white/60">
                    {g.label}
                  </span>
                  <span className="text-sm text-white/30">Tidak ada</span>
                </div>
              </div>
            );
          }
          return (
            <div
              key={c}
              className="rounded-lg border border-white/[0.06] bg-[#262626]"
            >
              <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#1f1f1f] px-4 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60">
                  {g.label}
                </h3>
                <span
                  className={`text-base font-semibold tabular-nums ${net >= 0 ? "text-emerald-300" : "text-amber-300"}`}
                >
                  {fmtRupiah(net)}
                </span>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {g.items.slice(0, 50).map((it, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-white/[0.04] last:border-0"
                    >
                      <td className="px-4 py-2 text-white/70">
                        {it.description}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {it.type === "in" ? (
                          <span className="text-emerald-300">
                            +{fmtRupiah(it.amount)}
                          </span>
                        ) : (
                          <span className="text-amber-300">
                            -{fmtRupiah(it.amount)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {g.items.length > 50 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-2 text-center text-xs text-white/40">
                        {g.items.length - 50} item lainnya tidak ditampilkan
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-white/[0.06] bg-[#262626] p-4">
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-white/[0.04]">
              <td className="px-2 py-2 text-white/70">Saldo Kas Awal (perkiraan)</td>
              <td className="px-2 py-2 text-right tabular-nums text-white">
                {fmtRupiah(openingBalance)}
              </td>
            </tr>
            <tr className="border-b border-white/[0.04]">
              <td className="px-2 py-2 text-white/70">Net Cashflow Periode</td>
              <td
                className={`px-2 py-2 text-right tabular-nums ${netChange >= 0 ? "text-emerald-300" : "text-red-300"}`}
              >
                {fmtRupiah(netChange)}
              </td>
            </tr>
            <tr>
              <td className="px-2 py-2 text-base font-semibold text-white">
                Saldo Kas Akhir
              </td>
              <td className="px-2 py-2 text-right text-base font-semibold tabular-nums text-white">
                {fmtRupiah(totalCurrent)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-amber-500/15 bg-amber-500/[0.04] p-3 text-xs text-amber-200/80">
        Klasifikasi default: semua mutasi terkait operasi penjualan/pembelian
        masuk Aktivitas Operasi. Investasi (pembelian aset tetap) dan Pendanaan
        (modal/pinjaman owner) saat ini masih perlu kategorisasi manual lewat
        catatan mutasi.
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: "emerald" | "amber" | "red" | "white";
  icon?: React.ReactNode;
}) {
  const t =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "amber"
        ? "text-amber-300"
        : tone === "red"
          ? "text-red-300"
          : "text-white";
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#262626] p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/40">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${t}`}>
        {value}
      </div>
    </div>
  );
}
