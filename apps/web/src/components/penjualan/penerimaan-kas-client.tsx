"use client";

import { useMemo, useRef, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  NumberInput,
  Select,
  FieldLabel,
  Alert,
} from "@sneakervault/ui";
import { PAYMENT_METHODS } from "@sneakervault/shared";
import type { PaymentMethod } from "@sneakervault/shared";
import { useToast } from "@/components/toast";
import { formatRupiah as fmtRupiah, formatDate } from "@/lib/format";
import { QuickTip } from "@/components/ui/quick-tip";
import { TransactionDeleteDialog } from "@/components/transaction-delete-dialog";
import {
  createCustomerPayment,
  deleteCustomerPayment,
} from "@/lib/actions/customer-payments";
import type { TransactionDeleteResult } from "@/lib/actions/transaction-deletes";
import type {
  CustomerPaymentRow,
  OutstandingSalesInvoiceRow,
  BankAccountRow,
  CustomerRow,
} from "@/lib/queries";
import {
  Plus,
  Search,
  Eye,
  X,
  Wallet as WalletIcon,
  Calendar,
  Users,
  Landmark,
  Wallet,
  Smartphone,
  Banknote,
  Trash2,
  AlertTriangle,
  Paperclip,
  ExternalLink,
  FileText,
  TrendingUp,
} from "lucide-react";

type AllocationDraft = {
  invoice_id: string;
  invoice_number: string;
  total: number;
  paid_amount: number;
  remaining: number;
  due_date: string | null;
  amount: number;
  selected: boolean;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function fmtDate(iso: string | null): string {
  return iso ? formatDate(iso) : "—";
}
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(iso);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

const methodLabel = (m: PaymentMethod): string =>
  PAYMENT_METHODS.find((p) => p.value === m)?.label ?? m;

const bankIcon = (t: BankAccountRow["type"]): React.ReactNode => {
  switch (t) {
    case "cash":
      return <Wallet size={12} strokeWidth={1.8} />;
    case "bank":
      return <Landmark size={12} strokeWidth={1.8} />;
    case "ewallet":
      return <Smartphone size={12} strokeWidth={1.8} />;
    default:
      return <Banknote size={12} strokeWidth={1.8} />;
  }
};

export function PenerimaanKasClient({
  payments,
  outstanding,
  bankAccounts,
  customers,
  roles,
  initialInvoiceId,
}: {
  payments: CustomerPaymentRow[];
  outstanding: OutstandingSalesInvoiceRow[];
  bankAccounts: BankAccountRow[];
  customers: CustomerRow[];
  roles: string[];
  initialInvoiceId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState<{
    customerId: string;
    invoiceId?: string;
  } | null>(null);
  const [viewing, setViewing] = useState<CustomerPaymentRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    payment: CustomerPaymentRow;
    blocker: TransactionDeleteResult | null;
  } | null>(null);
  const initialInvoiceOpenedRef = useRef<string | null>(null);

  const canManage = roles.includes("owner") || roles.includes("finance");

  useEffect(() => {
    if (
      !initialInvoiceId ||
      creating ||
      initialInvoiceOpenedRef.current === initialInvoiceId
    ) {
      return;
    }
    initialInvoiceOpenedRef.current = initialInvoiceId;
    const invoice = outstanding.find((item) => item.id === initialInvoiceId);
    queueMicrotask(() => {
      if (!invoice) {
        router.replace("/penjualan/penerimaan-kas", { scroll: false });
        return;
      }
      setCreating({
        customerId: invoice.customer_id ?? "",
        invoiceId: initialInvoiceId,
      });
    });
  }, [creating, initialInvoiceId, outstanding, router]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter(
      (p) =>
        p.payment_number.toLowerCase().includes(q) ||
        p.customer_name.toLowerCase().includes(q) ||
        (p.reference_no ?? "").toLowerCase().includes(q),
    );
  }, [payments, search]);

  const stats = useMemo(() => {
    const totalOutstanding = outstanding.reduce((a, i) => a + i.remaining, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdue = outstanding.filter((i) => {
      if (!i.due_date) return false;
      return new Date(i.due_date).getTime() < today.getTime();
    });
    const overdueAmount = overdue.reduce((a, i) => a + i.remaining, 0);
    const thisMonthReceipts = payments
      .filter((p) => {
        const d = new Date(p.payment_date);
        return (
          d.getFullYear() === today.getFullYear() &&
          d.getMonth() === today.getMonth()
        );
      })
      .reduce((a, p) => a + p.amount, 0);
    return {
      total_payments: payments.length,
      total_outstanding: totalOutstanding,
      overdue_count: overdue.length,
      overdue_amount: overdueAmount,
      this_month: thisMonthReceipts,
    };
  }, [payments, outstanding]);

  function openDelete(payment: CustomerPaymentRow) {
    setDeleteTarget({ payment, blocker: null });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      const r = await deleteCustomerPayment(target.payment.id);
      if ("error" in r && r.error) {
        toast.push(typeof r.error === "string" ? r.error : "Gagal", "error");
        return;
      }
      if (r.data && !r.data.deleted) {
        setDeleteTarget({ ...target, blocker: r.data });
        return;
      }
      toast.push("Penerimaan Customer dihapus permanen", "success");
      setDeleteTarget(null);
      setViewing(null);
      router.refresh();
    });
  }

  function closeCreateModal() {
    if (initialInvoiceId) {
      initialInvoiceOpenedRef.current = initialInvoiceId;
      router.replace("/penjualan/penerimaan-kas", { scroll: false });
    }
    setCreating(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] text-white/80">
            <WalletIcon size={20} strokeWidth={1.7} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Penerimaan Kas
            </h1>
            <p className="text-sm text-white/50">
              Catat pembayaran dari customer — tutup loop penjualan
            </p>
          </div>
        </div>
        {canManage ? (
          <Button
            onClick={() => setCreating({ customerId: "" })}
            className="gap-2"
          >
            <Plus size={16} strokeWidth={2} />
            Terima Pembayaran
          </Button>
        ) : null}
      </div>

      <QuickTip
        id="penjualan-penerimaan-kas-intro"
        title="Cara catat pembayaran customer"
        tone="info"
      >
        Pilih customer (atau ketik nama walk-in), pilih akun bank tujuan, dan alokasikan
        nominal ke invoice <em>outstanding</em>. Saldo bank ter-update otomatis. Jurnal
        Dr <em>Kas-Bank</em> / Cr <em>Piutang Usaha</em> dibuat. Satu pembayaran bisa
        di-alokasi ke beberapa invoice sekaligus.
        Untuk koreksi salah input, gunakan <strong>Hapus Penerimaan</strong>; mutasi
        kas/bank dan jurnal asli ikut dihapus, lalu status invoice dihitung ulang.
      </QuickTip>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Piutang Outstanding"
          value={fmtRupiah(stats.total_outstanding)}
          tone={stats.total_outstanding > 0 ? "amber" : undefined}
        />
        <StatTile
          label="Lewat Jatuh Tempo"
          value={`${stats.overdue_count} invoice`}
          subValue={
            stats.overdue_amount > 0 ? fmtRupiah(stats.overdue_amount) : undefined
          }
          tone={stats.overdue_count > 0 ? "red" : undefined}
        />
        <StatTile
          label="Penerimaan Bulan Ini"
          value={fmtRupiah(stats.this_month)}
          tone="emerald"
        />
        <StatTile label="Total Transaksi" value={stats.total_payments.toString()} />
      </div>

      {stats.overdue_count > 0 ? (
        <div className="rounded-xl border border-red-500/15 bg-red-500/[0.04] p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} strokeWidth={1.8} className="mt-0.5 text-red-300" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-red-200">
                {stats.overdue_count} invoice lewat jatuh tempo —{" "}
                {fmtRupiah(stats.overdue_amount)}
              </div>
              <p className="mt-0.5 text-xs text-red-200/70">
                Follow up customer untuk pelunasan piutang.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-white/[0.06] bg-[#262626] p-3">
        <div className="relative">
          <Search
            size={14}
            strokeWidth={1.8}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
          />
          <Input
            placeholder="Cari nomor terima, customer, atau referensi…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          hasFilter={search.length > 0}
          onCreate={canManage ? () => setCreating({ customerId: "" }) : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-[#262626]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-white/40">
                <th className="px-4 py-3 font-medium">No Terima</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Tanggal</th>
                <th className="px-4 py-3 font-medium">Metode</th>
                <th className="px-4 py-3 font-medium">Masuk ke</th>
                <th className="px-4 py-3 text-center font-medium">Invoice</th>
                <th className="px-4 py-3 text-right font-medium">Jumlah</th>
                <th className="px-4 py-3 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-3 font-mono text-xs text-white/80">
                    {p.payment_number}
                  </td>
                  <td className="px-4 py-3 text-white/90">{p.customer_name}</td>
                  <td className="px-4 py-3 text-white/60">{fmtDate(p.payment_date)}</td>
                  <td className="px-4 py-3 text-xs text-white/70">
                    {methodLabel(p.payment_method)}
                  </td>
                  <td className="px-4 py-3 text-xs text-white/60">
                    {p.bank_account_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-center text-white/70">
                    {p.allocations.length}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-300">
                    +{fmtRupiah(p.amount)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => setViewing(p)}
                        className="rounded p-1.5 text-white/50 hover:bg-white/[0.06] hover:text-white"
                        title="Detail"
                      >
                        <Eye size={14} strokeWidth={1.8} />
                      </button>
                      {canManage ? (
                        <button
                          onClick={() => openDelete(p)}
                          disabled={pending}
                          className="rounded p-1.5 text-white/40 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
                          title="Hapus Penerimaan Customer"
                        >
                          <Trash2 size={14} strokeWidth={1.8} />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating ? (
        <ReceiveModal
          initialCustomerId={creating.customerId}
          initialInvoiceId={creating.invoiceId}
          allOutstanding={outstanding}
          bankAccounts={bankAccounts}
          customers={customers}
          pending={pending}
          onClose={closeCreateModal}
          onCreated={() => {
            closeCreateModal();
            router.refresh();
          }}
        />
      ) : null}
      {viewing ? (
        <ViewModal
          payment={viewing}
          onClose={() => setViewing(null)}
          canDelete={canManage}
          pending={pending}
          onDelete={() => openDelete(viewing)}
        />
      ) : null}
      {deleteTarget ? (
        <TransactionDeleteDialog
          open
          title={`Hapus Penerimaan Customer ${deleteTarget.payment.payment_number}?`}
          description="Penerimaan salah input akan dibuang permanen tanpa menyimpan transaksi reversal."
          impacts={[
            "Alokasi ke Invoice Penjualan ikut dihapus.",
            "Mutasi kas/bank dan jurnal asli ikut dihapus.",
            "Saldo kas/bank, paid amount, dan status invoice dihitung ulang.",
          ]}
          pending={pending}
          blocker={deleteTarget.blocker}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </div>
  );
}

function ReceiveModal({
  initialCustomerId,
  initialInvoiceId,
  allOutstanding,
  bankAccounts,
  customers,
  pending,
  onClose,
  onCreated,
}: {
  initialCustomerId: string;
  initialInvoiceId?: string;
  allOutstanding: OutstandingSalesInvoiceRow[];
  bankAccounts: BankAccountRow[];
  customers: CustomerRow[];
  pending: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const initialInvoice = useMemo(
    () =>
      initialInvoiceId
        ? allOutstanding.find((item) => item.id === initialInvoiceId)
        : null,
    [allOutstanding, initialInvoiceId],
  );
  const [customerName, setCustomerName] = useState(
    initialInvoice?.customer_name ?? "",
  );
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bank_transfer");
  const defaultBank = bankAccounts.find((b) => b.is_default && b.is_active);
  const [bankAccountId, setBankAccountId] = useState(defaultBank?.id ?? "");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [allocs, setAllocs] = useState<AllocationDraft[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const toast = useToast();
  const [submitting, startSubmit] = useTransition();

  const customersWithOutstanding = useMemo(() => {
    const ids = new Set(allOutstanding.map((o) => o.customer_id).filter(Boolean));
    return customers.filter((c) => ids.has(c.id));
  }, [customers, allOutstanding]);

  // Distinct walk-in names from outstanding (customer_id null)
  const walkinNames = useMemo(() => {
    const set = new Set<string>();
    for (const o of allOutstanding) if (!o.customer_id) set.add(o.customer_name);
    return Array.from(set);
  }, [allOutstanding]);

  useEffect(() => {
    queueMicrotask(() => {
      if (customerId) {
        const c = customers.find((x) => x.id === customerId);
        if (c) setCustomerName(c.name);
        const list = allOutstanding
          .filter((o) => o.customer_id === customerId)
          .map<AllocationDraft>((o) => ({
            invoice_id: o.id,
            invoice_number: o.invoice_number,
            total: o.total,
            paid_amount: o.paid_amount,
            remaining: o.remaining,
            due_date: o.due_date,
            amount: o.id === initialInvoiceId ? o.remaining : 0,
            selected: o.id === initialInvoiceId,
          }));
        setAllocs(list);
      } else {
        if (initialInvoice && !initialInvoice.customer_id && !customerName) {
          setCustomerName(initialInvoice.customer_name);
        }
        // Walk-in mode: show all outstanding without customer_id, OR filter by name match
        const list = allOutstanding
          .filter(
            (o) => !o.customer_id && (!customerName || o.customer_name === customerName),
          )
          .map<AllocationDraft>((o) => ({
            invoice_id: o.id,
            invoice_number: o.invoice_number,
            total: o.total,
            paid_amount: o.paid_amount,
            remaining: o.remaining,
            due_date: o.due_date,
            amount: o.id === initialInvoiceId ? o.remaining : 0,
            selected: o.id === initialInvoiceId,
          }));
        setAllocs(list);
      }
    });
  }, [
    customerId,
    customerName,
    allOutstanding,
    customers,
    initialInvoice,
    initialInvoiceId,
  ]);

  const totalAlloc = allocs.reduce((a, x) => a + (x.selected ? x.amount : 0), 0);
  const activeBanks = useMemo(() => bankAccounts.filter((b) => b.is_active), [bankAccounts]);

  function toggleAlloc(idx: number) {
    setAllocs((prev) =>
      prev.map((a, i) =>
        i === idx
          ? { ...a, selected: !a.selected, amount: !a.selected ? a.remaining : 0 }
          : a,
      ),
    );
  }

  function updateAmount(idx: number, val: number) {
    setAllocs((prev) =>
      prev.map((a, i) =>
        i === idx
          ? {
              ...a,
              amount: Math.max(0, Math.min(a.remaining, val)),
              selected: val > 0,
            }
          : a,
      ),
    );
  }

  function selectAll() {
    setAllocs((prev) =>
      prev.map((a) => ({ ...a, selected: true, amount: a.remaining })),
    );
  }
  function clearAll() {
    setAllocs((prev) => prev.map((a) => ({ ...a, selected: false, amount: 0 })));
  }

  function submit() {
    setFormError(null);
    if (!customerName.trim()) {
      setFormError("Nama customer wajib diisi");
      return;
    }
    const selected = allocs.filter((a) => a.selected && a.amount > 0);
    if (selected.length === 0) {
      setFormError("Pilih minimal 1 invoice & isi jumlah");
      return;
    }
    if (paymentMethod !== "cash" && !bankAccountId) {
      setFormError("Pilih akun bank untuk metode non-tunai");
      return;
    }
    const payload = {
      customer_id: customerId || null,
      customer_name: customerName,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      bank_account_id: bankAccountId || null,
      reference_no: referenceNo || undefined,
      notes: notes || undefined,
      attachment_url: attachmentUrl || null,
      allocations: selected.map((a) => ({
        invoice_id: a.invoice_id,
        amount: a.amount,
      })),
    };
    startSubmit(async () => {
      const r = (await createCustomerPayment(payload)) as {
        error?: unknown;
        data?: unknown;
      };
      if (r.error) {
        const e = r.error as { _form?: string[] };
        setFormError(e._form?.[0] ?? "Gagal memproses penerimaan");
        return;
      }
      toast.push(`Penerimaan ${fmtRupiah(totalAlloc)} tercatat`, "success");
      onCreated();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#262626] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <h2 className="text-base font-semibold text-white">Terima Pembayaran Customer</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-white/50 hover:bg-white/[0.06] hover:text-white"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {formError ? <Alert tone="error">{formError}</Alert> : null}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="customer_id">Customer (pilih dari daftar)</FieldLabel>
              <Select
                id="customer_id"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">— Walk-in / Manual —</option>
                {customersWithOutstanding.map((c) => {
                  const out = allOutstanding
                    .filter((o) => o.customer_id === c.id)
                    .reduce((a, x) => a + x.remaining, 0);
                  return (
                    <option key={c.id} value={c.id}>
                      {c.name} ({fmtRupiah(out)})
                    </option>
                  );
                })}
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="customer_name">Nama di Penerimaan *</FieldLabel>
              {!customerId && walkinNames.length > 0 ? (
                <Select
                  id="customer_name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                >
                  <option value="">— Pilih atau ketik manual —</option>
                  {walkinNames.map((n) => (
                    <option key={n} value={n}>
                      {n} (walk-in)
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id="customer_name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="cth: Budi Hartanto"
                />
              )}
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="payment_date">Tanggal Terima *</FieldLabel>
            <Input
              id="payment_date"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>

          {/* Outstanding invoices */}
          {allocs.length === 0 ? (
            <div className="rounded-lg border border-white/[0.06] bg-[#1f1f1f] px-4 py-6 text-center text-sm text-white/40">
              Tidak ada invoice outstanding untuk seleksi ini.
            </div>
          ) : (
            <div className="rounded-lg border border-white/[0.06]">
              <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#1f1f1f] px-3 py-2">
                <div className="text-[11px] uppercase tracking-wider text-white/40">
                  Invoice Outstanding ({allocs.length})
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={selectAll}
                    className="rounded px-2 py-0.5 text-[10px] font-medium text-emerald-300 hover:bg-emerald-500/10"
                  >
                    Pilih Semua (Lunas)
                  </button>
                  <button
                    onClick={clearAll}
                    className="rounded px-2 py-0.5 text-[10px] font-medium text-white/50 hover:bg-white/[0.06]"
                  >
                    Kosongkan
                  </button>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.04] text-left text-[11px] uppercase tracking-wider text-white/40">
                    <th className="px-3 py-2 font-medium" style={{ width: "32px" }}></th>
                    <th className="px-3 py-2 font-medium">No Invoice</th>
                    <th className="px-3 py-2 font-medium">Tempo</th>
                    <th className="px-3 py-2 text-right font-medium">Sisa</th>
                    <th
                      className="px-3 py-2 text-right font-medium"
                      style={{ width: "140px" }}
                    >
                      Terima
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allocs.map((a, idx) => {
                    const due = daysUntil(a.due_date);
                    const isOverdue = due !== null && due < 0;
                    return (
                      <tr
                        key={a.invoice_id}
                        className={`border-b border-white/[0.04] last:border-0 ${
                          a.invoice_id === initialInvoiceId
                            ? "bg-emerald-500/[0.04]"
                            : ""
                        }`}
                      >
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={a.selected}
                            onChange={() => toggleAlloc(idx)}
                            className="h-4 w-4 rounded border-white/20 bg-white/[0.04]"
                          />
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-white/80">
                          {a.invoice_number}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <div className={isOverdue ? "text-red-300" : "text-white/60"}>
                            {fmtDate(a.due_date)}
                          </div>
                          {isOverdue ? (
                            <div className="text-[10px] text-red-300">
                              {Math.abs(due!)} hari lewat
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-300">
                          {fmtRupiah(a.remaining)}
                        </td>
                        <td className="px-3 py-2">
                          <NumberInput
                            min={0}
                            max={a.remaining}
                            value={a.amount}
                            onValueChange={(value) => updateAmount(idx, value)}
                            className="h-8 px-2 text-right"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Destination */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="payment_method">Metode Terima *</FieldLabel>
              <Select
                id="payment_method"
                value={paymentMethod}
                onChange={(e) => {
                  const m = e.target.value as PaymentMethod;
                  setPaymentMethod(m);
                  if (m === "cash") setBankAccountId("");
                }}
              >
                {PAYMENT_METHODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="bank_account_id">
                Masuk ke Akun {paymentMethod !== "cash" ? "*" : ""}
              </FieldLabel>
              <Select
                id="bank_account_id"
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
              >
                <option value="">— Pilih akun —</option>
                {activeBanks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} · {fmtRupiah(Number(b.current_balance))}
                  </option>
                ))}
              </Select>
              {bankAccountId ? (
                (() => {
                  const ba = activeBanks.find((b) => b.id === bankAccountId);
                  if (!ba) return null;
                  return (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-white/40">
                      {bankIcon(ba.type)}
                      Saldo akan jadi:{" "}
                      <span className="text-emerald-300">
                        {fmtRupiah(Number(ba.current_balance) + totalAlloc)}
                      </span>
                    </p>
                  );
                })()
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="reference_no">No Referensi</FieldLabel>
              <Input
                id="reference_no"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="cth: nomor transfer / mutasi BCA"
              />
            </div>
            <div>
              <FieldLabel htmlFor="attachment_url">URL Bukti</FieldLabel>
              <Input
                id="attachment_url"
                type="url"
                value={attachmentUrl}
                onChange={(e) => setAttachmentUrl(e.target.value)}
                placeholder="https://… (opsional)"
              />
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="notes">Catatan</FieldLabel>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="opsional"
            />
          </div>

          <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-emerald-200/80">Total Diterima</span>
              <span className="text-xl font-semibold tabular-nums text-emerald-300">
                +{fmtRupiah(totalAlloc)}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-emerald-200/60">
              {allocs.filter((a) => a.selected && a.amount > 0).length} invoice
              akan ter-update
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-white/[0.06] px-6 py-4">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || pending || totalAlloc <= 0 || !customerName.trim()}
            className="gap-1.5"
          >
            <TrendingUp size={14} strokeWidth={2} />
            {submitting ? "Memproses…" : "Konfirmasi Terima"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ViewModal({
  payment,
  onClose,
  canDelete,
  pending,
  onDelete,
}: {
  payment: CustomerPaymentRow;
  onClose: () => void;
  canDelete: boolean;
  pending: boolean;
  onDelete: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#262626] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-start justify-between border-b border-white/[0.06] px-6 py-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="font-mono text-base font-semibold text-white">
                {payment.payment_number}
              </h2>
              <span className="inline-flex rounded border border-emerald-500/20 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                Tercatat
              </span>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-white/50">
              <Users size={12} strokeWidth={1.8} />
              {payment.customer_name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-white/50 hover:bg-white/[0.06] hover:text-white"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <Meta
              icon={<Calendar size={11} strokeWidth={2} />}
              label="Tanggal Terima"
              value={fmtDate(payment.payment_date)}
            />
            <Meta
              icon={<Banknote size={11} strokeWidth={2} />}
              label="Metode"
              value={methodLabel(payment.payment_method)}
            />
            {payment.bank_account_name ? (
              <Meta
                icon={<Landmark size={11} strokeWidth={2} />}
                label="Masuk ke"
                value={payment.bank_account_name}
              />
            ) : null}
            {payment.reference_no ? (
              <Meta
                icon={<FileText size={11} strokeWidth={2} />}
                label="No Referensi"
                value={payment.reference_no}
                mono
              />
            ) : null}
            {payment.attachment_url ? (
              <div>
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/40">
                  <Paperclip size={11} strokeWidth={2} />
                  Bukti
                </div>
                <a
                  href={payment.attachment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-sm text-sky-300 hover:underline"
                >
                  Buka <ExternalLink size={11} strokeWidth={2} />
                </a>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-white/[0.06]">
            <div className="border-b border-white/[0.06] bg-[#1f1f1f] px-4 py-2 text-[11px] uppercase tracking-wider text-white/40">
              Alokasi ke Invoice ({payment.allocations.length})
            </div>
            <table className="w-full text-sm">
              <tbody>
                {payment.allocations.map((a) => (
                  <tr key={a.invoice_id} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-4 py-2 font-mono text-xs text-white/80">
                      {a.invoice_number}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-emerald-300">
                      +{fmtRupiah(a.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-emerald-200/80">Total Diterima</span>
              <span className="text-xl font-semibold tabular-nums text-emerald-300">
                +{fmtRupiah(payment.amount)}
              </span>
            </div>
          </div>

          {payment.notes ? (
            <div className="rounded-lg border border-white/[0.06] bg-[#1f1f1f] p-4">
              <div className="text-[11px] uppercase tracking-wider text-white/40">
                Catatan
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-white/80">
                {payment.notes}
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-shrink-0 items-center justify-between gap-2 border-t border-white/[0.06] px-6 py-4">
          <div>
            {canDelete ? (
              <button
                onClick={onDelete}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs text-white/60 hover:bg-red-500/10 hover:text-red-300"
                title="Hapus Penerimaan Customer beserta efeknya"
              >
                <Trash2 size={13} strokeWidth={1.8} />
                Hapus Penerimaan
              </button>
            ) : null}
          </div>
          <Button variant="ghost" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </div>
    </div>
  );
}

function Meta({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/40">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-sm text-white ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  subValue,
  tone,
}: {
  label: string;
  value: string;
  subValue?: string;
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
      <div className="text-[11px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${t}`}>{value}</div>
      {subValue ? <div className={`mt-0.5 text-xs ${t}`}>{subValue}</div> : null}
    </div>
  );
}

function EmptyState({
  hasFilter,
  onCreate,
}: {
  hasFilter: boolean;
  onCreate?: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 bg-[#262626] px-6 py-16 text-center">
      <WalletIcon size={32} strokeWidth={1.5} className="mx-auto mb-4 text-white/30" />
      <h3 className="text-base font-medium text-white">
        {hasFilter ? "Tidak ada penerimaan cocok" : "Belum ada penerimaan kas"}
      </h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-white/50">
        {hasFilter
          ? "Coba kata kunci lain."
          : "Setiap penerimaan akan menutup invoice outstanding dan otomatis update saldo akun bank."}
      </p>
      {!hasFilter && onCreate ? (
        <Button onClick={onCreate} className="mt-5 gap-2">
          <Plus size={16} strokeWidth={2} />
          Terima Pertama
        </Button>
      ) : null}
    </div>
  );
}
