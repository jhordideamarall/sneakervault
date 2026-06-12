"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  FieldLabel,
  Input,
  Select,
  Textarea,
  cn,
} from "@sneakervault/ui";
import { createClient as createSupabaseBrowserClient } from "@sneakervault/supabase/client";
import {
  EXPENSE_STATUS_LABELS as statusLabel,
  EXPENSE_STATUS_TONES,
} from "@sneakervault/shared";
import { formatRupiah, formatDate } from "@/lib/format";
import type {
  BankAccountRow,
  BankTransactionRow,
  ExpenseAccountOption,
  ExpenseCategoryRow,
  ExpenseRow,
} from "@/lib/queries";
import {
  archiveExpenseCategory,
  approveExpense,
  createExpense,
  createExpenseCategory,
  payExpense,
  rejectExpense,
  updateExpenseCategory,
  voidExpense,
} from "@/lib/actions/expenses";
import { MutasiBankClient } from "./mutasi-client";
import { useToast } from "@/components/toast";
import {
  Banknote,
  CheckCircle2,
  FileText,
  FolderTree,
  Plus,
  Receipt,
  Search,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";

type TabId = "list" | "input" | "categories" | "mutasi";

type ExpenseFormState = {
  expense_date: string;
  category_id: string;
  description: string;
  amount: number;
  payment_method: "cash" | "bank_transfer" | "marketplace" | "other";
  bank_account_id: string;
};

type CategoryFormState = {
  id?: string;
  name: string;
  account_code: string;
  sort_order: number;
  is_active: boolean;
};

const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: "list", label: "Daftar Beban", icon: <Receipt size={15} /> },
  { id: "input", label: "Input Beban", icon: <Plus size={15} /> },
  { id: "categories", label: "Kategori", icon: <FolderTree size={15} /> },
  { id: "mutasi", label: "Mutasi Keluar", icon: <Banknote size={15} /> },
];

const paymentLabels: Record<ExpenseFormState["payment_method"], string> = {
  cash: "Cash",
  bank_transfer: "Transfer",
  marketplace: "Saldo Marketplace",
  other: "Lainnya",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}


function firstError(error: unknown) {
  if (!error) return "Terjadi kesalahan";
  if (typeof error === "string") return error;
  if (typeof error !== "object") return "Terjadi kesalahan";
  const err = error as Record<string, unknown>;
  if (Array.isArray(err._form) && err._form[0]) return String(err._form[0]);
  for (const value of Object.values(err)) {
    if (Array.isArray(value) && value[0]) return String(value[0]);
  }
  return "Terjadi kesalahan";
}

function sanitizeFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function StatTile({
  label,
  value,
  tone = "white",
}: {
  label: string;
  value: string;
  tone?: "white" | "emerald" | "sky" | "amber";
}) {
  const colors = {
    white: "text-white",
    emerald: "text-emerald-300",
    sky: "text-sky-300",
    amber: "text-amber-300",
  };

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-4">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-white/35">
        {label}
      </p>
      <p className={cn("mt-2 text-xl font-semibold tracking-tight", colors[tone])}>
        {value}
      </p>
    </div>
  );
}

export function ExpensesClient({
  expenses,
  categories,
  accountOptions,
  bankAccounts,
  bankTransactions,
  roles,
  userId,
}: {
  expenses: ExpenseRow[];
  categories: ExpenseCategoryRow[];
  accountOptions: ExpenseAccountOption[];
  bankAccounts: BankAccountRow[];
  bankTransactions: BankTransactionRow[];
  roles: string[];
  userId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const canApprove = roles.includes("owner") || roles.includes("finance");
  const canManageCategories = roles.includes("owner");
  const activeCategories = categories.filter((category) => category.is_active);
  const activeBankAccounts = bankAccounts.filter((account) => account.is_active);
  const defaultBank =
    activeBankAccounts.find((account) => account.is_default) ??
    activeBankAccounts[0];
  const defaultCategory = activeCategories[0];
  const defaultAccount = accountOptions[0];

  const [activeTab, setActiveTab] = useState<TabId>("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ExpenseRow["status"] | "all">(
    "all",
  );
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>({
    expense_date: todayIso(),
    category_id: defaultCategory?.id ?? "",
    description: "",
    amount: 0,
    payment_method: "cash",
    bank_account_id: defaultBank?.id ?? "",
  });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>({
    name: "",
    account_code: defaultAccount?.code ?? "",
    sort_order: 100,
    is_active: true,
  });
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const filteredExpenses = useMemo(() => {
    const query = search.trim().toLowerCase();
    return expenses.filter((expense) => {
      if (statusFilter !== "all" && expense.status !== statusFilter)
        return false;
      if (categoryFilter !== "all" && expense.category_id !== categoryFilter)
        return false;
      if (!query) return true;
      return (
        expense.expense_number.toLowerCase().includes(query) ||
        expense.description.toLowerCase().includes(query) ||
        expense.category_name.toLowerCase().includes(query) ||
        expense.bank_account_name.toLowerCase().includes(query)
      );
    });
  }, [expenses, search, statusFilter, categoryFilter]);

  const stats = useMemo(() => {
    const paid = expenses.filter((expense) => expense.status === "paid");
    const waiting = expenses.filter((expense) => expense.status === "draft");
    const approved = expenses.filter((expense) => expense.status === "approved");
    return {
      paidTotal: paid.reduce((sum, expense) => sum + expense.amount, 0),
      waiting: waiting.length,
      approved: approved.length,
      total: expenses.length,
    };
  }, [expenses]);

  function resetExpenseForm() {
    setExpenseForm({
      expense_date: todayIso(),
      category_id: defaultCategory?.id ?? "",
      description: "",
      amount: 0,
      payment_method: "cash",
      bank_account_id: defaultBank?.id ?? "",
    });
    setReceiptFile(null);
    setExpenseError(null);
  }

  async function uploadReceipt() {
    if (!receiptFile) return null;
    const supabase = createSupabaseBrowserClient();
    const path = `${userId}/${Date.now()}-${sanitizeFileName(receiptFile.name)}`;
    const { error } = await supabase.storage
      .from("expense-receipts")
      .upload(path, receiptFile, { upsert: false });
    if (error) throw new Error(error.message);
    return path;
  }

  function handleCreateExpense() {
    setExpenseError(null);
    startTransition(async () => {
      let receiptPath: string | null = null;
      try {
        receiptPath = await uploadReceipt();
      } catch (error) {
        setExpenseError(error instanceof Error ? error.message : "Upload gagal");
        return;
      }

      const result = await createExpense({
        ...expenseForm,
        receipt_path: receiptPath,
      });
      if ("error" in result && result.error) {
        setExpenseError(firstError(result.error));
        return;
      }
      toast.push("Pengeluaran tersimpan sebagai Draft", "success");
      resetExpenseForm();
      setActiveTab("list");
      router.refresh();
    });
  }

  function runExpenseAction(
    action: () => Promise<{ error?: unknown; success?: boolean }>,
    successMessage: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.push(firstError(result.error), "error");
        return;
      }
      toast.push(successMessage, "success");
      router.refresh();
    });
  }

  async function handleViewReceipt(path: string) {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.storage
      .from("expense-receipts")
      .createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      toast.push(error?.message ?? "Bukti tidak bisa dibuka", "error");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  function resetCategoryForm() {
    setCategoryForm({
      name: "",
      account_code: defaultAccount?.code ?? "",
      sort_order: 100,
      is_active: true,
    });
    setCategoryError(null);
  }

  function handleSaveCategory() {
    setCategoryError(null);
    startTransition(async () => {
      const action = categoryForm.id
        ? updateExpenseCategory
        : createExpenseCategory;
      const result = await action(categoryForm);
      if ("error" in result && result.error) {
        setCategoryError(firstError(result.error));
        return;
      }
      toast.push(
        categoryForm.id ? "Kategori diperbarui" : "Kategori ditambahkan",
        "success",
      );
      resetCategoryForm();
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] text-white/80">
            <Receipt size={20} strokeWidth={1.7} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Pengeluaran Kas & Bank
            </h1>
            <p className="text-sm text-white/50">
              Beban operasional, bukti nota, approval, dan mutasi keluar
            </p>
          </div>
        </div>
        <Button onClick={() => setActiveTab("input")} className="gap-2">
          <Plus size={16} />
          Input Beban
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Paid" value={formatRupiah(stats.paidTotal)} tone="emerald" />
        <StatTile label="Menunggu" value={stats.waiting.toString()} tone="amber" />
        <StatTile label="Approved" value={stats.approved.toString()} tone="sky" />
        <StatTile label="Total Dokumen" value={stats.total.toString()} />
      </div>

      <div className="flex flex-wrap gap-2 rounded-lg border border-white/[0.06] bg-[#262626] p-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-white/[0.1] text-white"
                : "text-white/45 hover:bg-white/[0.04] hover:text-white/75",
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "list" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/[0.06] bg-[#262626] p-3">
            <div className="relative min-w-[220px] flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nomor, kategori, deskripsi"
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as ExpenseRow["status"] | "all")
              }
              className="min-w-[150px]"
            >
              <option value="all">Semua status</option>
              {Object.entries(statusLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="min-w-[190px]"
            >
              <option value="all">Semua kategori</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-[#1f1f1f]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left text-sm">
                <thead className="border-b border-white/[0.06] bg-white/[0.03] text-xs uppercase tracking-[0.08em] text-white/35">
                  <tr>
                    <th className="px-4 py-3">Tanggal</th>
                    <th className="px-4 py-3">Nomor</th>
                    <th className="px-4 py-3">Kategori</th>
                    <th className="px-4 py-3">Deskripsi</th>
                    <th className="px-4 py-3 text-right">Nominal</th>
                    <th className="px-4 py-3">Akun</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Bukti</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {filteredExpenses.map((expense) => (
                    <tr key={expense.id} className="text-white/70">
                      <td className="whitespace-nowrap px-4 py-3">
                        {formatDate(expense.expense_date)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-white/80">
                        {expense.expense_number}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-white/80">
                          {expense.category_name}
                        </div>
                        <div className="text-xs text-white/35">
                          {expense.category_account_code}
                        </div>
                      </td>
                      <td className="max-w-[260px] px-4 py-3">
                        <div className="line-clamp-2">{expense.description}</div>
                        {expense.rejection_reason || expense.void_reason ? (
                          <div className="mt-1 text-xs text-amber-300/80">
                            {expense.rejection_reason ?? expense.void_reason}
                          </div>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-white">
                        {formatRupiah(expense.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <div>{expense.bank_account_name}</div>
                        <div className="text-xs text-white/35">
                          {paymentLabels[expense.payment_method] ?? expense.payment_method}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={EXPENSE_STATUS_TONES[expense.status] ?? "neutral"}>
                          {statusLabel[expense.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {expense.receipt_path ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewReceipt(expense.receipt_path!)}
                            className="h-8 px-2"
                          >
                            <FileText size={14} />
                            Buka
                          </Button>
                        ) : (
                          <span className="text-white/30">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {canApprove && expense.status === "draft" ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="success"
                                disabled={pending}
                                onClick={() =>
                                  runExpenseAction(
                                    () => approveExpense(expense.id),
                                    "Pengeluaran di-approve",
                                  )
                                }
                              >
                                <CheckCircle2 size={14} />
                                Approve
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="danger"
                                disabled={pending}
                                onClick={() => {
                                  const reason =
                                    window.prompt("Alasan penolakan") ?? "";
                                  runExpenseAction(
                                    () => rejectExpense(expense.id, reason),
                                    "Pengeluaran ditolak",
                                  );
                                }}
                              >
                                <XCircle size={14} />
                                Reject
                              </Button>
                            </>
                          ) : null}
                          {canApprove && expense.status === "approved" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="success"
                              disabled={pending}
                              onClick={() =>
                                runExpenseAction(
                                  () => payExpense(expense.id),
                                  "Pengeluaran dibayar",
                                )
                              }
                            >
                              <ShieldCheck size={14} />
                              Pay
                            </Button>
                          ) : null}
                          {canApprove &&
                          expense.status !== "voided" &&
                          expense.status !== "rejected" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => {
                                const reason = window.prompt("Alasan void") ?? "";
                                runExpenseAction(
                                  () => voidExpense(expense.id, reason),
                                  "Pengeluaran di-void",
                                );
                              }}
                            >
                              Void
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredExpenses.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-10 text-center text-sm text-white/40"
                      >
                        Belum ada pengeluaran sesuai filter.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "input" ? (
        <section className="rounded-lg border border-white/[0.06] bg-[#1f1f1f] p-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <label>
              <FieldLabel required>Tanggal</FieldLabel>
              <Input
                type="date"
                value={expenseForm.expense_date}
                onChange={(event) =>
                  setExpenseForm((current) => ({
                    ...current,
                    expense_date: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <FieldLabel required>Kategori</FieldLabel>
              <Select
                value={expenseForm.category_id}
                onChange={(event) =>
                  setExpenseForm((current) => ({
                    ...current,
                    category_id: event.target.value,
                  }))
                }
              >
                <option value="">Pilih kategori</option>
                {activeCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              <FieldLabel required>Nominal</FieldLabel>
              <Input
                type="number"
                min={0}
                value={expenseForm.amount || ""}
                onChange={(event) =>
                  setExpenseForm((current) => ({
                    ...current,
                    amount: Number(event.target.value || 0),
                  }))
                }
                placeholder="0"
              />
            </label>
            <label>
              <FieldLabel required>Metode pembayaran</FieldLabel>
              <Select
                value={expenseForm.payment_method}
                onChange={(event) =>
                  setExpenseForm((current) => ({
                    ...current,
                    payment_method: event.target
                      .value as ExpenseFormState["payment_method"],
                  }))
                }
              >
                {Object.entries(paymentLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              <FieldLabel required>Akun kas/bank</FieldLabel>
              <Select
                value={expenseForm.bank_account_id}
                onChange={(event) =>
                  setExpenseForm((current) => ({
                    ...current,
                    bank_account_id: event.target.value,
                  }))
                }
              >
                <option value="">Pilih akun</option>
                {activeBankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              <FieldLabel>Upload bukti</FieldLabel>
              <Input
                type="file"
                accept="image/*,.pdf"
                onChange={(event) =>
                  setReceiptFile(event.target.files?.[0] ?? null)
                }
              />
            </label>
            <label className="lg:col-span-2">
              <FieldLabel required>Deskripsi</FieldLabel>
              <Textarea
                value={expenseForm.description}
                onChange={(event) =>
                  setExpenseForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Contoh: Biaya packing pesanan offline"
              />
            </label>
          </div>
          {expenseError ? (
            <Alert tone="error" className="mt-4">
              {expenseError}
            </Alert>
          ) : null}
          <div className="mt-5 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={resetExpenseForm}>
              Reset
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={handleCreateExpense}
            >
              <Upload size={16} />
              Simpan Draft
            </Button>
          </div>
        </section>
      ) : null}

      {activeTab === "categories" ? (
        <section
          className={cn(
            "grid gap-4",
            canManageCategories ? "lg:grid-cols-[360px_minmax(0,1fr)]" : "",
          )}
        >
          {canManageCategories ? (
            <div className="rounded-lg border border-white/[0.06] bg-[#1f1f1f] p-5">
              <h2 className="text-lg font-semibold text-white">
                {categoryForm.id ? "Edit Kategori" : "Tambah Kategori"}
              </h2>
              <div className="mt-4 space-y-4">
                <label>
                  <FieldLabel required>Nama kategori</FieldLabel>
                  <Input
                    value={categoryForm.name}
                    onChange={(event) =>
                      setCategoryForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <FieldLabel required>Akun beban</FieldLabel>
                  <Select
                    value={categoryForm.account_code}
                    onChange={(event) =>
                      setCategoryForm((current) => ({
                        ...current,
                        account_code: event.target.value,
                      }))
                    }
                  >
                    <option value="">Pilih akun</option>
                    {accountOptions.map((account) => (
                      <option key={account.code} value={account.code}>
                        {account.code} - {account.name}
                      </option>
                    ))}
                  </Select>
                </label>
                <label>
                  <FieldLabel>Urutan</FieldLabel>
                  <Input
                    type="number"
                    min={0}
                    value={categoryForm.sort_order}
                    onChange={(event) =>
                      setCategoryForm((current) => ({
                        ...current,
                        sort_order: Number(event.target.value || 0),
                      }))
                    }
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input
                    type="checkbox"
                    checked={categoryForm.is_active}
                    onChange={(event) =>
                      setCategoryForm((current) => ({
                        ...current,
                        is_active: event.target.checked,
                      }))
                    }
                  />
                  Aktif
                </label>
              </div>
              {categoryError ? (
                <Alert tone="error" className="mt-4">
                  {categoryError}
                </Alert>
              ) : null}
              <div className="mt-5 flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={resetCategoryForm}>
                  Reset
                </Button>
                <Button
                  type="button"
                  disabled={pending}
                  onClick={handleSaveCategory}
                >
                  Simpan
                </Button>
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-[#1f1f1f]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-white/[0.06] bg-white/[0.03] text-xs uppercase tracking-[0.08em] text-white/35">
                  <tr>
                    <th className="px-4 py-3">Kategori</th>
                    <th className="px-4 py-3">Akun</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {categories.map((category) => {
                    const accountName =
                      accountOptions.find(
                        (account) => account.code === category.account_code,
                      )?.name ?? "Akun beban";
                    return (
                      <tr key={category.id} className="text-white/70">
                        <td className="px-4 py-3">
                          <div className="font-medium text-white/85">
                            {category.name}
                          </div>
                          {category.is_system ? (
                            <div className="text-xs text-white/35">System seed</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <div>{category.account_code}</div>
                          <div className="text-xs text-white/35">{accountName}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2 py-1 text-xs",
                              category.is_active
                                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                                : "border-white/10 bg-white/[0.03] text-white/40",
                            )}
                          >
                            {category.is_active ? "Aktif" : "Nonaktif"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            {canManageCategories ? (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() =>
                                    setCategoryForm({
                                      id: category.id,
                                      name: category.name,
                                      account_code: category.account_code,
                                      sort_order: category.sort_order,
                                      is_active: category.is_active,
                                    })
                                  }
                                >
                                  Edit
                                </Button>
                                {category.is_active ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    disabled={pending}
                                    onClick={() =>
                                      runExpenseAction(
                                        () => archiveExpenseCategory(category.id),
                                        "Kategori dinonaktifkan",
                                      )
                                    }
                                  >
                                    Nonaktif
                                  </Button>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "mutasi" ? (
        <MutasiBankClient
          transactions={bankTransactions}
          bankAccounts={bankAccounts}
          roles={roles}
          defaultTypeFilter="debit"
          title="Mutasi Keluar"
          description="Uang keluar dari pembayaran vendor, pengeluaran, dan mutasi manual"
        />
      ) : null}
    </div>
  );
}
