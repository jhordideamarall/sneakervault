"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  Select,
  FieldLabel,
  Alert,
} from "@sneakervault/ui";
import { useToast } from "@/components/toast";
import {
  createBankTransaction,
  toggleReconciled,
} from "@/lib/actions/bank-transactions";
import type { BankTransactionRow, BankAccountRow } from "@/lib/queries";
import {
  Plus,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  ScrollText,
  X,
  CheckCircle2,
  Circle,
  Link2,
} from "lucide-react";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function fmtRupiah(n: number): string {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const sourceLabel: Record<string, string> = {
  vendor_payment: "Bayar Vendor",
  vendor_payment_reversal: "Reverse Bayar Vendor",
  customer_payment: "Terima Customer",
  customer_payment_reversal: "Reverse Terima",
  manual: "Manual",
};

export function MutasiBankClient({
  transactions,
  bankAccounts,
  roles,
  defaultTypeFilter = "all",
  title,
  description,
}: {
  transactions: BankTransactionRow[];
  bankAccounts: BankAccountRow[];
  roles: string[];
  defaultTypeFilter?: "all" | "debit" | "credit";
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "debit" | "credit">(
    defaultTypeFilter,
  );
  const [reconFilter, setReconFilter] = useState<
    "all" | "reconciled" | "unreconciled"
  >("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const defaultBank = bankAccounts.find((b) => b.is_default && b.is_active);
  const [form, setForm] = useState({
    bank_account_id: defaultBank?.id ?? "",
    transaction_date: todayIso(),
    type: "credit" as "debit" | "credit",
    amount: 0,
    reference_no: "",
    description: "",
  });
  const [formError, setFormError] = useState<string | null>(null);

  const canManage = roles.includes("owner") || roles.includes("finance");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (accountFilter !== "all" && t.bank_account_id !== accountFilter)
        return false;
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (reconFilter === "reconciled" && !t.is_reconciled) return false;
      if (reconFilter === "unreconciled" && t.is_reconciled) return false;
      if (!q) return true;
      return (
        t.description.toLowerCase().includes(q) ||
        (t.reference_no ?? "").toLowerCase().includes(q) ||
        t.bank_account_name.toLowerCase().includes(q)
      );
    });
  }, [transactions, accountFilter, typeFilter, reconFilter, search]);

  const stats = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    const today = new Date();
    for (const t of transactions) {
      const d = new Date(t.transaction_date);
      if (
        d.getFullYear() !== today.getFullYear() ||
        d.getMonth() !== today.getMonth()
      )
        continue;
      if (t.type === "credit") totalIn += t.amount;
      else totalOut += t.amount;
    }
    return {
      total_in_month: totalIn,
      total_out_month: totalOut,
      net_month: totalIn - totalOut,
      unreconciled: transactions.filter((t) => !t.is_reconciled).length,
    };
  }, [transactions]);

  function handleSave() {
    if (!form.bank_account_id || form.amount <= 0 || !form.description) {
      setFormError("Lengkapi semua field");
      return;
    }
    setFormError(null);
    startTransition(async () => {
      const r = (await createBankTransaction(form)) as {
        error?: unknown;
      };
      if (r.error) {
        const e = r.error as { _form?: string[] };
        setFormError(e._form?.[0] ?? "Gagal menyimpan");
        return;
      }
      toast.push("Mutasi tercatat", "success");
      setCreating(false);
      setForm({
        bank_account_id: defaultBank?.id ?? "",
        transaction_date: todayIso(),
        type: "credit",
        amount: 0,
        reference_no: "",
        description: "",
      });
      router.refresh();
    });
  }

  function handleToggle(id: string) {
    startTransition(async () => {
      const r = await toggleReconciled(id);
      if ("error" in r && r.error) {
        toast.push(typeof r.error === "string" ? r.error : "Gagal", "error");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] text-white/80">
            <ScrollText size={20} strokeWidth={1.7} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              {title ?? "Mutasi Bank & Kas"}
            </h1>
            <p className="text-sm text-white/50">
              {description ?? "Riwayat semua transaksi kas, bank, dan e-wallet"}
            </p>
          </div>
        </div>
        {canManage ? (
          <Button onClick={() => setCreating(true)} className="gap-2">
            <Plus size={16} strokeWidth={2} />
            Mutasi Manual
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Masuk Bulan Ini"
          value={fmtRupiah(stats.total_in_month)}
          tone="emerald"
        />
        <StatTile
          label="Keluar Bulan Ini"
          value={fmtRupiah(stats.total_out_month)}
          tone="amber"
        />
        <StatTile
          label="Net Bulan Ini"
          value={fmtRupiah(stats.net_month)}
          tone={stats.net_month >= 0 ? "emerald" : "red"}
        />
        <StatTile label="Belum Direkonsiliasi" value={stats.unreconciled.toString()} />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/[0.06] bg-[#262626] p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            strokeWidth={1.8}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
          />
          <Input
            placeholder="Cari deskripsi atau referensi…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          className="min-w-[160px]"
        >
          <option value="all">Semua akun</option>
          {bankAccounts.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Select
          value={typeFilter}
          onChange={(e) =>
            setTypeFilter(e.target.value as "all" | "debit" | "credit")
          }
          className="min-w-[120px]"
        >
          <option value="all">Semua tipe</option>
          <option value="credit">Masuk</option>
          <option value="debit">Keluar</option>
        </Select>
        <Select
          value={reconFilter}
          onChange={(e) =>
            setReconFilter(
              e.target.value as "all" | "reconciled" | "unreconciled",
            )
          }
          className="min-w-[160px]"
        >
          <option value="all">Semua rekon</option>
          <option value="reconciled">Sudah direkonsiliasi</option>
          <option value="unreconciled">Belum</option>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-[#262626] px-6 py-16 text-center">
          <ScrollText
            size={32}
            strokeWidth={1.5}
            className="mx-auto mb-4 text-white/30"
          />
          <h3 className="text-base font-medium text-white">
            Belum ada mutasi
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-white/50">
            Mutasi otomatis muncul saat ada pembayaran vendor, penerimaan
            customer, atau input manual.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-[#262626]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-white/40">
                <th className="px-4 py-3 font-medium" style={{ width: "30px" }}></th>
                <th className="px-4 py-3 font-medium">Tanggal</th>
                <th className="px-4 py-3 font-medium">Deskripsi</th>
                <th className="px-4 py-3 font-medium">Akun</th>
                <th className="px-4 py-3 font-medium">Sumber</th>
                <th className="px-4 py-3 text-right font-medium">Debit</th>
                <th className="px-4 py-3 text-right font-medium">Kredit</th>
                <th className="px-4 py-3 text-right font-medium">Saldo</th>
                <th
                  className="px-4 py-3 text-center font-medium"
                  style={{ width: "70px" }}
                >
                  Rekon
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-3">
                    {t.type === "credit" ? (
                      <ArrowDownLeft
                        size={14}
                        strokeWidth={2}
                        className="text-emerald-300"
                      />
                    ) : (
                      <ArrowUpRight
                        size={14}
                        strokeWidth={2}
                        className="text-amber-300"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 text-white/70">
                    {fmtDate(t.transaction_date)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-white/90">{t.description}</div>
                    {t.reference_no ? (
                      <div className="font-mono text-[10px] text-white/40">
                        Ref: {t.reference_no}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-white/60">
                    {t.bank_account_name}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {t.related_entity_type ? (
                      <span className="inline-flex items-center gap-1 rounded bg-white/[0.04] px-2 py-0.5 text-white/60">
                        {t.related_entity_type !== "manual" ? (
                          <Link2 size={9} strokeWidth={1.8} />
                        ) : null}
                        {sourceLabel[t.related_entity_type] ??
                          t.related_entity_type}
                      </span>
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {t.type === "debit" ? (
                      <span className="text-amber-300">
                        {fmtRupiah(t.amount)}
                      </span>
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {t.type === "credit" ? (
                      <span className="text-emerald-300">
                        {fmtRupiah(t.amount)}
                      </span>
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-white/60">
                    {t.balance_after !== null ? fmtRupiah(t.balance_after) : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {canManage ? (
                      <button
                        onClick={() => handleToggle(t.id)}
                        disabled={pending}
                        className="inline-flex items-center justify-center"
                        title={
                          t.is_reconciled
                            ? "Batalkan rekonsiliasi"
                            : "Tandai sudah rekonsiliasi"
                        }
                      >
                        {t.is_reconciled ? (
                          <CheckCircle2
                            size={16}
                            strokeWidth={2}
                            className="text-emerald-300"
                          />
                        ) : (
                          <Circle
                            size={16}
                            strokeWidth={1.5}
                            className="text-white/30 hover:text-white/60"
                          />
                        )}
                      </button>
                    ) : t.is_reconciled ? (
                      <CheckCircle2
                        size={16}
                        strokeWidth={2}
                        className="mx-auto text-emerald-300"
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Manual entry modal */}
      {creating ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setCreating(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-white/[0.08] bg-[#262626] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
              <h2 className="text-base font-semibold text-white">
                Mutasi Manual
              </h2>
              <button
                onClick={() => setCreating(false)}
                className="rounded p-1 text-white/50 hover:bg-white/[0.06] hover:text-white"
              >
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              {formError ? <Alert tone="error">{formError}</Alert> : null}

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setForm({ ...form, type: "credit" })}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    form.type === "credit"
                      ? "border-emerald-500/40 bg-emerald-500/[0.08]"
                      : "border-white/[0.08] bg-[#1f1f1f]"
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-white">
                    <ArrowDownLeft size={14} strokeWidth={1.8} />
                    Uang Masuk (Credit)
                  </div>
                  <p className="mt-0.5 text-[11px] text-white/50">
                    Setoran, refund vendor, dll
                  </p>
                </button>
                <button
                  onClick={() => setForm({ ...form, type: "debit" })}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    form.type === "debit"
                      ? "border-amber-500/40 bg-amber-500/[0.08]"
                      : "border-white/[0.08] bg-[#1f1f1f]"
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-white">
                    <ArrowUpRight size={14} strokeWidth={1.8} />
                    Uang Keluar (Debit)
                  </div>
                  <p className="mt-0.5 text-[11px] text-white/50">
                    Biaya admin, ops, dll
                  </p>
                </button>
              </div>

              <div>
                <FieldLabel htmlFor="bank_account_id">Akun *</FieldLabel>
                <Select
                  id="bank_account_id"
                  value={form.bank_account_id}
                  onChange={(e) =>
                    setForm({ ...form, bank_account_id: e.target.value })
                  }
                >
                  <option value="">— Pilih akun —</option>
                  {bankAccounts
                    .filter((b) => b.is_active)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ·{" "}
                        {fmtRupiah(Number(b.current_balance))}
                      </option>
                    ))}
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="transaction_date">Tanggal *</FieldLabel>
                  <Input
                    id="transaction_date"
                    type="date"
                    value={form.transaction_date}
                    onChange={(e) =>
                      setForm({ ...form, transaction_date: e.target.value })
                    }
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="amount">Jumlah *</FieldLabel>
                  <Input
                    id="amount"
                    type="number"
                    min={0}
                    value={form.amount}
                    onChange={(e) =>
                      setForm({ ...form, amount: Number(e.target.value) })
                    }
                  />
                </div>
              </div>

              <div>
                <FieldLabel htmlFor="description">Deskripsi *</FieldLabel>
                <Input
                  id="description"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder={
                    form.type === "credit"
                      ? "cth: Setoran modal owner"
                      : "cth: Biaya admin BCA"
                  }
                />
              </div>

              <div>
                <FieldLabel htmlFor="reference_no">No Referensi</FieldLabel>
                <Input
                  id="reference_no"
                  value={form.reference_no}
                  onChange={(e) =>
                    setForm({ ...form, reference_no: e.target.value })
                  }
                  placeholder="opsional"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-6 py-4">
              <Button
                variant="ghost"
                onClick={() => setCreating(false)}
                disabled={pending}
              >
                Batal
              </Button>
              <Button onClick={handleSave} disabled={pending}>
                {pending ? "Menyimpan…" : "Simpan Mutasi"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "amber" | "red" | "emerald";
}) {
  const t =
    tone === "amber"
      ? "text-amber-300"
      : tone === "red"
        ? "text-red-300"
        : tone === "emerald"
          ? "text-emerald-300"
          : "text-white";
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#262626] p-4">
      <div className="text-[11px] uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold ${t}`}>{value}</div>
    </div>
  );
}
