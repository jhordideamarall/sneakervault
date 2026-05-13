"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  Select,
  FieldLabel,
  FieldError,
  Alert,
} from "@sneakervault/ui";
import { BANK_ACCOUNT_TYPES } from "@sneakervault/shared";
import type { BankAccountType } from "@sneakervault/shared";
import { useToast } from "@/components/toast";
import {
  createBankAccount,
  updateBankAccount,
  deactivateBankAccount,
  reactivateBankAccount,
} from "@/lib/actions/bank-accounts";
import type { BankAccountRow } from "@/lib/queries";
import {
  Plus,
  Landmark,
  Wallet,
  Banknote,
  Smartphone,
  Pencil,
  Archive,
  ArchiveRestore,
  Star,
  X,
} from "lucide-react";

const emptyForm = {
  name: "",
  type: "bank" as BankAccountType,
  bank_name: "",
  account_number: "",
  account_holder: "",
  opening_balance: 0,
  currency: "IDR",
  is_default: false,
  notes: "",
};

const typeIcon: Record<BankAccountType, React.ReactNode> = {
  cash: <Wallet size={18} strokeWidth={1.7} />,
  bank: <Landmark size={18} strokeWidth={1.7} />,
  ewallet: <Smartphone size={18} strokeWidth={1.7} />,
  marketplace_balance: <Banknote size={18} strokeWidth={1.7} />,
};

const typeTone: Record<BankAccountType, string> = {
  cash: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  bank: "bg-sky-500/15 text-sky-300 border-sky-500/20",
  ewallet: "bg-violet-500/15 text-violet-300 border-violet-500/20",
  marketplace_balance: "bg-orange-500/15 text-orange-300 border-orange-500/20",
};

const typeLabel = (t: BankAccountType): string =>
  BANK_ACCOUNT_TYPES.find((b) => b.value === t)?.label ?? t;

function fmtRupiah(n: number): string {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}

export function BankAccountsClient({
  accounts,
  roles,
}: {
  accounts: BankAccountRow[];
  roles: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<BankAccountRow | "new" | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [filterType, setFilterType] = useState<BankAccountType | "all">("all");

  const canManage = roles.includes("owner") || roles.includes("finance");

  const filtered = useMemo(() => {
    return accounts.filter((a) => {
      if (!showInactive && !a.is_active) return false;
      if (filterType !== "all" && a.type !== filterType) return false;
      return true;
    });
  }, [accounts, showInactive, filterType]);

  const totals = useMemo(() => {
    const active = accounts.filter((a) => a.is_active);
    const byType = new Map<BankAccountType, number>();
    let totalAll = 0;
    for (const a of active) {
      const bal = Number(a.current_balance);
      byType.set(a.type, (byType.get(a.type) ?? 0) + bal);
      totalAll += bal;
    }
    return { totalAll, byType };
  }, [accounts]);

  function startEdit(a: BankAccountRow) {
    setEditing(a);
    setForm({
      name: a.name,
      type: a.type,
      bank_name: a.bank_name ?? "",
      account_number: a.account_number ?? "",
      account_holder: a.account_holder ?? "",
      opening_balance: Number(a.opening_balance),
      currency: a.currency,
      is_default: a.is_default,
      notes: a.notes ?? "",
    });
    setFieldErrors({});
    setFormError(null);
  }

  function startNew() {
    setEditing("new");
    setForm(emptyForm);
    setFieldErrors({});
    setFormError(null);
  }

  function closeModal() {
    setEditing(null);
  }

  function handleSave() {
    if (!editing) return;
    const payload = {
      name: form.name,
      type: form.type,
      bank_name: form.bank_name || undefined,
      account_number: form.account_number || undefined,
      account_holder: form.account_holder || undefined,
      opening_balance: form.opening_balance,
      currency: form.currency,
      is_default: form.is_default,
      notes: form.notes || undefined,
    };
    setFieldErrors({});
    setFormError(null);
    startTransition(async () => {
      const result =
        editing === "new"
          ? await createBankAccount(payload)
          : await updateBankAccount(editing.id, payload);
      if ("error" in result && result.error) {
        if (typeof result.error === "object" && "_form" in result.error) {
          setFormError(
            (result.error._form as string[])?.[0] ?? "Gagal menyimpan",
          );
        } else {
          const errs: Record<string, string> = {};
          for (const [k, v] of Object.entries(result.error)) {
            errs[k] = Array.isArray(v) ? v[0] ?? "" : String(v);
          }
          setFieldErrors(errs);
        }
        return;
      }
      toast.push(
        editing === "new" ? "Akun bank ditambahkan" : "Akun bank diperbarui",
        "success",
      );
      closeModal();
      router.refresh();
    });
  }

  function handleDeactivate(id: string, name: string) {
    if (!confirm(`Nonaktifkan akun "${name}"?`)) return;
    startTransition(async () => {
      const result = await deactivateBankAccount(id);
      if ("error" in result && result.error) {
        toast.push(
          typeof result.error === "string" ? result.error : "Gagal",
          "error",
        );
        return;
      }
      toast.push("Akun dinonaktifkan", "success");
      router.refresh();
    });
  }

  function handleReactivate(id: string) {
    startTransition(async () => {
      const result = await reactivateBankAccount(id);
      if ("error" in result && result.error) {
        toast.push(
          typeof result.error === "string" ? result.error : "Gagal",
          "error",
        );
        return;
      }
      toast.push("Akun diaktifkan kembali", "success");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] text-white/80">
              <Landmark size={20} strokeWidth={1.7} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                Akun Bank & Kas
              </h1>
              <p className="text-sm text-white/50">
                Master akun: bank, kas tunai, e-wallet, saldo marketplace
              </p>
            </div>
          </div>
        </div>
        {canManage ? (
          <Button onClick={startNew} className="gap-2">
            <Plus size={16} strokeWidth={2} />
            Akun Baru
          </Button>
        ) : null}
      </div>

      {/* Total summary */}
      <div className="rounded-xl border border-white/[0.06] bg-gradient-to-br from-emerald-500/5 to-sky-500/5 p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-white/40">
              Total Saldo Semua Akun
            </div>
            <div className="mt-1 text-3xl font-semibold text-white">
              {fmtRupiah(totals.totalAll)}
            </div>
          </div>
          <div className="flex gap-3">
            {BANK_ACCOUNT_TYPES.map((t) => {
              const v = totals.byType.get(t.value) ?? 0;
              if (v === 0) return null;
              return (
                <div key={t.value} className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-white/40">
                    {t.label}
                  </div>
                  <div className="text-sm font-medium text-white/80">
                    {fmtRupiah(v)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={filterType}
          onChange={(e) =>
            setFilterType(e.target.value as BankAccountType | "all")
          }
          className="min-w-[160px]"
        >
          <option value="all">Semua tipe</option>
          {BANK_ACCOUNT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm text-white/60">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-white/[0.04]"
          />
          Tampilkan nonaktif
        </label>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState onCreate={canManage ? startNew : undefined} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => (
            <div
              key={a.id}
              className={`rounded-xl border bg-[#262626] p-5 transition-colors ${
                a.is_active
                  ? "border-white/[0.06] hover:border-white/[0.12]"
                  : "border-white/[0.04] opacity-60"
              }`}
            >
              <div className="flex items-start justify-between">
                <div
                  className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-medium ${typeTone[a.type]}`}
                >
                  {typeIcon[a.type]}
                  {typeLabel(a.type)}
                </div>
                {a.is_default ? (
                  <div
                    className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300"
                    title="Akun default"
                  >
                    <Star size={10} strokeWidth={2.2} />
                    Default
                  </div>
                ) : null}
              </div>

              <div className="mt-4">
                <div className="text-base font-semibold text-white">
                  {a.name}
                </div>
                {a.bank_name ? (
                  <div className="text-xs text-white/40">{a.bank_name}</div>
                ) : null}
                {a.account_number ? (
                  <div className="mt-1 font-mono text-xs text-white/60">
                    {a.account_number}
                  </div>
                ) : null}
                {a.account_holder ? (
                  <div className="text-xs text-white/40">
                    a/n {a.account_holder}
                  </div>
                ) : null}
              </div>

              <div className="mt-5 border-t border-white/[0.04] pt-4">
                <div className="text-[10px] uppercase tracking-wider text-white/40">
                  Saldo Saat Ini
                </div>
                <div className="mt-0.5 text-xl font-semibold tabular-nums text-white">
                  {fmtRupiah(Number(a.current_balance))}
                </div>
                {Number(a.opening_balance) !== Number(a.current_balance) ? (
                  <div className="mt-0.5 text-[11px] text-white/40">
                    Saldo awal: {fmtRupiah(Number(a.opening_balance))}
                  </div>
                ) : null}
              </div>

              {canManage ? (
                <div className="mt-4 flex gap-1 border-t border-white/[0.04] pt-3">
                  <button
                    onClick={() => startEdit(a)}
                    className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-white/60 hover:bg-white/[0.06] hover:text-white"
                  >
                    <Pencil size={12} strokeWidth={1.8} />
                    Edit
                  </button>
                  {a.is_active ? (
                    <button
                      onClick={() => handleDeactivate(a.id, a.name)}
                      disabled={pending}
                      className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-white/60 hover:bg-white/[0.06] hover:text-amber-300"
                    >
                      <Archive size={12} strokeWidth={1.8} />
                      Nonaktifkan
                    </button>
                  ) : (
                    <button
                      onClick={() => handleReactivate(a.id)}
                      disabled={pending}
                      className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-white/60 hover:bg-white/[0.06] hover:text-emerald-300"
                    >
                      <ArchiveRestore size={12} strokeWidth={1.8} />
                      Aktifkan
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {editing ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-white/[0.08] bg-[#262626] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
              <h2 className="text-base font-semibold text-white">
                {editing === "new" ? "Akun Baru" : "Edit Akun"}
              </h2>
              <button
                onClick={closeModal}
                className="rounded p-1 text-white/50 hover:bg-white/[0.06] hover:text-white"
              >
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              {formError ? <Alert tone="error">{formError}</Alert> : null}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="type">Tipe Akun *</FieldLabel>
                  <Select
                    id="type"
                    value={form.type}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        type: e.target.value as BankAccountType,
                      })
                    }
                  >
                    {BANK_ACCOUNT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1 text-[11px] text-white/40">
                    {
                      BANK_ACCOUNT_TYPES.find((t) => t.value === form.type)
                        ?.description
                    }
                  </p>
                </div>
                <div>
                  <FieldLabel htmlFor="name">Nama Tampilan *</FieldLabel>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                    placeholder={
                      form.type === "cash"
                        ? "Kas Kasir"
                        : form.type === "bank"
                          ? "BCA Utama"
                          : form.type === "ewallet"
                            ? "ShopeePay"
                            : "Saldo Shopee"
                    }
                  />
                  <FieldError message={fieldErrors.name} />
                </div>
              </div>

              {form.type === "bank" || form.type === "ewallet" ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel htmlFor="bank_name">
                        {form.type === "bank" ? "Nama Bank" : "Provider"}
                      </FieldLabel>
                      <Input
                        id="bank_name"
                        value={form.bank_name}
                        onChange={(e) =>
                          setForm({ ...form, bank_name: e.target.value })
                        }
                        placeholder={
                          form.type === "bank"
                            ? "BCA / Mandiri / BRI"
                            : "OVO / GoPay / Dana"
                        }
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="account_number">
                        No Rekening
                      </FieldLabel>
                      <Input
                        id="account_number"
                        value={form.account_number}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            account_number: e.target.value,
                          })
                        }
                        placeholder="opsional"
                      />
                    </div>
                  </div>
                  <div>
                    <FieldLabel htmlFor="account_holder">
                      Atas Nama
                    </FieldLabel>
                    <Input
                      id="account_holder"
                      value={form.account_holder}
                      onChange={(e) =>
                        setForm({ ...form, account_holder: e.target.value })
                      }
                      placeholder="opsional"
                    />
                  </div>
                </>
              ) : null}

              <div>
                <FieldLabel htmlFor="opening_balance">
                  Saldo Awal {editing !== "new" ? "(read-only)" : ""}
                </FieldLabel>
                <Input
                  id="opening_balance"
                  type="number"
                  value={form.opening_balance}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      opening_balance: Number(e.target.value),
                    })
                  }
                  disabled={editing !== "new"}
                  placeholder="0"
                />
                <p className="mt-1 text-[11px] text-white/40">
                  Saldo awal saat akun dibuat. Mutasi berikutnya akan otomatis
                  update saldo saat ini.
                </p>
              </div>

              <label className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={form.is_default}
                  onChange={(e) =>
                    setForm({ ...form, is_default: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-white/20 bg-white/[0.04]"
                />
                Jadikan akun default untuk pembayaran
              </label>

              <div>
                <FieldLabel htmlFor="notes">Catatan</FieldLabel>
                <Input
                  id="notes"
                  value={form.notes}
                  onChange={(e) =>
                    setForm({ ...form, notes: e.target.value })
                  }
                  placeholder="opsional"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-6 py-4">
              <Button variant="ghost" onClick={closeModal} disabled={pending}>
                Batal
              </Button>
              <Button onClick={handleSave} disabled={pending || !form.name}>
                {pending
                  ? "Menyimpan…"
                  : editing === "new"
                    ? "Buat Akun"
                    : "Simpan"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 bg-[#262626] px-6 py-16 text-center">
      <Landmark
        size={32}
        strokeWidth={1.5}
        className="mx-auto mb-4 text-white/30"
      />
      <h3 className="text-base font-medium text-white">Belum ada akun bank</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-white/50">
        Tambahkan akun pertama (Kas, BCA, ShopeePay, atau saldo marketplace).
        Akun ini akan dipakai untuk mencatat pembayaran vendor dan penerimaan
        kas customer.
      </p>
      {onCreate ? (
        <Button onClick={onCreate} className="mt-5 gap-2">
          <Plus size={16} strokeWidth={2} />
          Akun Pertama
        </Button>
      ) : null}
    </div>
  );
}
