"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
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
import { QuickTip } from "@/components/ui/quick-tip";
import { TransactionDeleteDialog } from "@/components/transaction-delete-dialog";
import { formatRupiah as fmtRupiah, formatDate } from "@/lib/format";
import {
  createVendorPayment,
  deleteVendorPayment,
} from "@/lib/actions/vendor-payments";
import type { TransactionDeleteResult } from "@/lib/actions/transaction-deletes";
import type {
  VendorPaymentRow,
  OutstandingInvoiceRow,
  BankAccountRow,
} from "@/lib/queries";
import {
  Plus,
  Search,
  Eye,
  X,
  Banknote,
  Calendar,
  Truck,
  Landmark,
  Wallet,
  Smartphone,
  Trash2,
  AlertTriangle,
  Paperclip,
  ExternalLink,
  FileText,
} from "lucide-react";

type SupplierOpt = { id: string; name: string };

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

const bankIcon = (
  t: BankAccountRow["type"],
): React.ReactNode => {
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

export function PembayaranVendorClient({
  payments,
  outstanding,
  bankAccounts,
  suppliers,
  roles,
}: {
  payments: VendorPaymentRow[];
  outstanding: OutstandingInvoiceRow[];
  bankAccounts: BankAccountRow[];
  suppliers: SupplierOpt[];
  roles: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"outstanding" | "history">("outstanding");
  const [outstandingFilter, setOutstandingFilter] = useState<"all" | "overdue" | "duesoon">("all");
  const [creating, setCreating] = useState<{
    supplierId: string;
  } | null>(null);
  const [viewing, setViewing] = useState<VendorPaymentRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    payment: VendorPaymentRow;
    blocker: TransactionDeleteResult | null;
  } | null>(null);

  const canManage = roles.includes("owner") || roles.includes("finance");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter(
      (p) =>
        p.payment_number.toLowerCase().includes(q) ||
        p.supplier_name.toLowerCase().includes(q) ||
        (p.reference_no ?? "").toLowerCase().includes(q),
    );
  }, [payments, search]);

  const filteredOutstanding = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const week = today.getTime() + 7 * 24 * 60 * 60 * 1000;
    return outstanding.filter((o) => {
      if (q) {
        if (
          !o.invoice_number.toLowerCase().includes(q) &&
          !o.supplier_name.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (outstandingFilter === "overdue") {
        if (!o.due_date) return false;
        return new Date(o.due_date).getTime() < today.getTime();
      }
      if (outstandingFilter === "duesoon") {
        if (!o.due_date) return false;
        const dt = new Date(o.due_date).getTime();
        return dt >= today.getTime() && dt <= week;
      }
      return true;
    });
  }, [outstanding, search, outstandingFilter]);

  const stats = useMemo(() => {
    const totalOutstanding = outstanding.reduce(
      (a, i) => a + i.remaining,
      0,
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdue = outstanding.filter((i) => {
      if (!i.due_date) return false;
      return new Date(i.due_date).getTime() < today.getTime();
    });
    const overdueAmount = overdue.reduce((a, i) => a + i.remaining, 0);
    const thisMonthPayments = payments
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
      this_month: thisMonthPayments,
    };
  }, [payments, outstanding]);

  function startCreate(supplierId?: string) {
    setCreating({ supplierId: supplierId ?? "" });
  }

  function openDelete(payment: VendorPaymentRow) {
    setDeleteTarget({ payment, blocker: null });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      const r = await deleteVendorPayment(target.payment.id);
      if ("error" in r && r.error) {
        toast.push(typeof r.error === "string" ? r.error : "Gagal", "error");
        return;
      }
      if (r.data && !r.data.deleted) {
        setDeleteTarget({ ...target, blocker: r.data });
        return;
      }
      toast.push("Pembayaran Vendor dihapus permanen", "success");
      setDeleteTarget(null);
      setViewing(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] text-white/80">
            <Banknote size={20} strokeWidth={1.7} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Pembayaran Vendor
            </h1>
            <p className="text-sm text-white/50">
              Bayar faktur outstanding ke vendor — tutup loop pembelian
            </p>
          </div>
        </div>
        {canManage ? (
          <Button onClick={() => startCreate()} className="gap-2">
            <Plus size={16} strokeWidth={2} />
            Bayar Vendor
          </Button>
        ) : null}
      </div>

      <QuickTip
        id="pembelian-pembayaran-intro-v2"
        title="Cara cepat bayar vendor"
        tone="info"
      >
        Tab <strong>"Belum Dibayar"</strong>: lihat semua faktur outstanding + warna jatuh tempo (merah = lewat, kuning = ≤ 7 hari).
        Klik <strong>Bayar</strong> di baris faktur untuk langsung buka form dengan vendor & alokasi sudah ter-isi.
        Tab <strong>"Sudah Dibayar"</strong>: riwayat semua pembayaran yang sudah dibuat.
        <br />
        <span className="mt-1 inline-block text-[12px] text-white/55">
          <strong>Hapus</strong> dipakai untuk koreksi salah input dan menghapus transaksi beserta efek kas/bank dan jurnalnya.{" "}
          <strong>Batalkan Pembelian Barang</strong> hanya dipakai saat supplier batal order sebelum barang diterima.
        </span>
      </QuickTip>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Total Outstanding"
          value={fmtRupiah(stats.total_outstanding)}
          tone={stats.total_outstanding > 0 ? "amber" : undefined}
        />
        <StatTile
          label="Lewat Jatuh Tempo"
          value={`${stats.overdue_count} faktur`}
          subValue={
            stats.overdue_amount > 0 ? fmtRupiah(stats.overdue_amount) : undefined
          }
          tone={stats.overdue_count > 0 ? "red" : undefined}
        />
        <StatTile
          label="Pembayaran Bulan Ini"
          value={fmtRupiah(stats.this_month)}
        />
        <StatTile
          label="Total Pembayaran"
          value={stats.total_payments.toString()}
        />
      </div>

      {/* Outstanding aging quick-list */}
      {stats.overdue_count > 0 ? (
        <div className="rounded-xl border border-red-500/15 bg-red-500/[0.04] p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={18}
              strokeWidth={1.8}
              className="mt-0.5 text-red-300"
            />
            <div className="flex-1">
              <div className="text-sm font-semibold text-red-200">
                {stats.overdue_count} faktur lewat jatuh tempo —{" "}
                {fmtRupiah(stats.overdue_amount)}
              </div>
              <p className="mt-0.5 text-xs text-red-200/70">
                Prioritaskan pembayaran berikut supaya tidak menumpuk.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Tabs: Outstanding (default) vs Payment History */}
      <div className="flex items-center gap-1 border-b border-white/[0.06]">
        <TabButton
          active={activeTab === "outstanding"}
          onClick={() => setActiveTab("outstanding")}
          label="Belum Dibayar"
          badge={outstanding.length}
          tone="amber"
        />
        <TabButton
          active={activeTab === "history"}
          onClick={() => setActiveTab("history")}
          label="Sudah Dibayar"
          badge={payments.length}
          tone="emerald"
        />
      </div>

      {/* Search + status filter row */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/[0.06] bg-[#262626] p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            size={14}
            strokeWidth={1.8}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
          />
          <Input
            placeholder={
              activeTab === "outstanding"
                ? "Cari nomor faktur atau vendor…"
                : "Cari nomor bayar, vendor, atau referensi…"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {activeTab === "outstanding" ? (
          <Select
            value={outstandingFilter}
            onChange={(e) =>
              setOutstandingFilter(e.target.value as typeof outstandingFilter)
            }
            className="min-w-[180px]"
          >
            <option value="all">Semua outstanding</option>
            <option value="overdue">Sudah jatuh tempo</option>
            <option value="duesoon">Jatuh tempo ≤ 7 hari</option>
          </Select>
        ) : null}
      </div>

      {activeTab === "outstanding" ? (
        filteredOutstanding.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 bg-[#262626] px-6 py-16 text-center">
            <Banknote size={32} strokeWidth={1.5} className="mx-auto mb-4 text-white/30" />
            <h3 className="text-base font-medium text-white">
              {search || outstandingFilter !== "all"
                ? "Tidak ada faktur yang cocok"
                : "Semua faktur sudah lunas 🎉"}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-white/50">
              Tidak ada hutang outstanding ke vendor saat ini.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-[#262626]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-white/40">
                  <th className="px-4 py-3 font-medium">No Faktur</th>
                  <th className="px-4 py-3 font-medium">Vendor</th>
                  <th className="px-4 py-3 font-medium">Tgl Faktur</th>
                  <th className="px-4 py-3 font-medium">Jatuh Tempo</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-right font-medium">Sudah Bayar</th>
                  <th className="px-4 py-3 text-right font-medium">Sisa</th>
                  <th className="px-4 py-3 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredOutstanding.map((o) => {
                  const d = daysUntil(o.due_date);
                  const isOverdue = d !== null && d < 0;
                  const isSoon = d !== null && d >= 0 && d <= 7;
                  const isPartial = o.paid_amount > 0;
                  return (
                    <tr
                      key={o.id}
                      className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-white/80">
                        {o.invoice_number}
                      </td>
                      <td className="px-4 py-3 text-white/90">{o.supplier_name}</td>
                      <td className="px-4 py-3 text-white/60">
                        {fmtDate(o.invoice_date)}
                      </td>
                      <td className="px-4 py-3">
                        {o.due_date ? (
                          <span
                            className={
                              isOverdue
                                ? "text-red-300"
                                : isSoon
                                  ? "text-amber-300"
                                  : "text-white/60"
                            }
                          >
                            {fmtDate(o.due_date)}
                            {isOverdue ? (
                              <span className="ml-1 text-[10px]">({Math.abs(d!)} hr lewat)</span>
                            ) : isSoon ? (
                              <span className="ml-1 text-[10px]">({d} hr lagi)</span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-white/70">
                        {fmtRupiah(o.total)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {isPartial ? (
                          <span className="text-emerald-300">{fmtRupiah(o.paid_amount)}</span>
                        ) : (
                          <span className="text-white/20">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-amber-300">
                        {fmtRupiah(o.remaining)}
                        {isPartial ? (
                          <div className="text-[10px] font-normal text-white/40">Partial</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canManage ? (
                          <Button
                            size="sm"
                            onClick={() => startCreate(o.supplier_id)}
                            className="gap-1"
                          >
                            <Banknote size={13} strokeWidth={1.9} />
                            Bayar
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : filtered.length === 0 ? (
        <EmptyState
          hasFilter={search.length > 0}
          onCreate={canManage ? () => startCreate() : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-[#262626]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-white/40">
                <th className="px-4 py-3 font-medium">No Bayar</th>
                <th className="px-4 py-3 font-medium">Vendor</th>
                <th className="px-4 py-3 font-medium">Tanggal</th>
                <th className="px-4 py-3 font-medium">Metode</th>
                <th className="px-4 py-3 font-medium">Sumber Dana</th>
                <th className="px-4 py-3 text-center font-medium">Faktur</th>
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
                  <td className="px-4 py-3 text-white/90">{p.supplier_name}</td>
                  <td className="px-4 py-3 text-white/60">
                    {fmtDate(p.payment_date)}
                  </td>
                  <td className="px-4 py-3 text-xs text-white/70">
                    {methodLabel(p.payment_method)}
                  </td>
                  <td className="px-4 py-3 text-xs text-white/60">
                    {p.bank_account_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-center text-white/70">
                    {p.allocations.length}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-white">
                    {fmtRupiah(p.amount)}
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
                          title="Hapus Pembayaran Vendor"
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
        <PayModal
          initialSupplierId={creating.supplierId}
          allOutstanding={outstanding}
          bankAccounts={bankAccounts}
          suppliers={suppliers}
          pending={pending}
          onClose={() => setCreating(null)}
          onCreated={() => {
            setCreating(null);
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
          title={`Hapus Pembayaran Vendor ${deleteTarget.payment.payment_number}?`}
          description="Pembayaran salah input akan dibuang permanen tanpa menyimpan transaksi reversal."
          impacts={[
            "Alokasi ke Faktur Pembelian ikut dihapus.",
            "Mutasi kas/bank dan jurnal asli ikut dihapus.",
            "Saldo kas/bank, paid amount, dan status faktur dihitung ulang.",
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

function PayModal({
  initialSupplierId,
  allOutstanding,
  bankAccounts,
  suppliers,
  pending,
  onClose,
  onCreated,
}: {
  initialSupplierId: string;
  allOutstanding: OutstandingInvoiceRow[];
  bankAccounts: BankAccountRow[];
  suppliers: SupplierOpt[];
  pending: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("bank_transfer");
  const defaultBank = bankAccounts.find((b) => b.is_default && b.is_active);
  const [bankAccountId, setBankAccountId] = useState(defaultBank?.id ?? "");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [allocs, setAllocs] = useState<AllocationDraft[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const toast = useToast();
  const [submitting, startSubmit] = useTransition();

  const suppliersWithOutstanding = useMemo(() => {
    const ids = new Set(allOutstanding.map((o) => o.supplier_id));
    return suppliers.filter((s) => ids.has(s.id));
  }, [suppliers, allOutstanding]);

  // Load allocations when supplier changes
  useEffect(() => {
    queueMicrotask(() => {
      if (!supplierId) {
        setAllocs([]);
        return;
      }
      const list = allOutstanding
        .filter((o) => o.supplier_id === supplierId)
        .map<AllocationDraft>((o) => ({
          invoice_id: o.id,
          invoice_number: o.invoice_number,
          total: o.total,
          paid_amount: o.paid_amount,
          remaining: o.remaining,
          due_date: o.due_date,
          amount: 0,
          selected: false,
        }));
      setAllocs(list);
    });
  }, [supplierId, allOutstanding]);

  const totalAlloc = allocs.reduce(
    (a, x) => a + (x.selected ? x.amount : 0),
    0,
  );

  const activeBanks = useMemo(
    () => bankAccounts.filter((b) => b.is_active),
    [bankAccounts],
  );

  function toggleAlloc(idx: number) {
    setAllocs((prev) =>
      prev.map((a, i) =>
        i === idx
          ? {
              ...a,
              selected: !a.selected,
              amount: !a.selected ? a.remaining : 0,
            }
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
    setAllocs((prev) =>
      prev.map((a) => ({ ...a, selected: false, amount: 0 })),
    );
  }

  function submit() {
    setFormError(null);
    if (!supplierId) {
      setFormError("Pilih vendor");
      return;
    }
    const selected = allocs.filter((a) => a.selected && a.amount > 0);
    if (selected.length === 0) {
      setFormError("Pilih minimal 1 faktur dan isi jumlah");
      return;
    }
    if (paymentMethod !== "cash" && !bankAccountId) {
      setFormError("Pilih akun bank untuk metode non-tunai");
      return;
    }
    const payload = {
      supplier_id: supplierId,
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
      const r = (await createVendorPayment(payload)) as {
        error?: unknown;
        data?: unknown;
      };
      if (r.error) {
        const e = r.error as { _form?: string[] };
        setFormError(e._form?.[0] ?? "Gagal memproses pembayaran");
        return;
      }
      toast.push(`Pembayaran ${fmtRupiah(totalAlloc)} tercatat`, "success");
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
          <h2 className="text-base font-semibold text-white">Bayar Vendor</h2>
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
              <FieldLabel htmlFor="supplier_id">Vendor *</FieldLabel>
              <Select
                id="supplier_id"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">— Pilih vendor —</option>
                {suppliersWithOutstanding.map((s) => {
                  const outstandingForSup = allOutstanding
                    .filter((o) => o.supplier_id === s.id)
                    .reduce((a, x) => a + x.remaining, 0);
                  return (
                    <option key={s.id} value={s.id}>
                      {s.name} ({fmtRupiah(outstandingForSup)})
                    </option>
                  );
                })}
              </Select>
              {suppliersWithOutstanding.length === 0 ? (
                <p className="mt-1 text-[11px] text-white/40">
                  Tidak ada vendor dengan faktur outstanding.
                </p>
              ) : null}
            </div>
            <div>
              <FieldLabel htmlFor="payment_date">Tanggal Bayar *</FieldLabel>
              <Input
                id="payment_date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
          </div>

          {/* Faktur outstanding */}
          {supplierId ? (
            allocs.length === 0 ? (
              <div className="rounded-lg border border-white/[0.06] bg-[#1f1f1f] px-4 py-6 text-center text-sm text-white/40">
                Vendor ini tidak punya faktur outstanding.
              </div>
            ) : (
              <div className="rounded-lg border border-white/[0.06]">
                <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#1f1f1f] px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wider text-white/40">
                    Faktur Outstanding ({allocs.length})
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
                      <th className="px-3 py-2 font-medium">No Faktur</th>
                      <th className="px-3 py-2 font-medium">Tempo</th>
                      <th className="px-3 py-2 text-right font-medium">Sisa</th>
                      <th
                        className="px-3 py-2 text-right font-medium"
                        style={{ width: "140px" }}
                      >
                        Bayar
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
                          className="border-b border-white/[0.04] last:border-0"
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
                            <div
                              className={isOverdue ? "text-red-300" : "text-white/60"}
                            >
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
            )
          ) : null}

          {/* Source */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="payment_method">Metode Bayar *</FieldLabel>
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
                Sumber Dana {paymentMethod !== "cash" ? "*" : ""}
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
                  const insufficient = totalAlloc > Number(ba.current_balance);
                  return (
                    <p
                      className={`mt-1 flex items-center gap-1 text-[11px] ${insufficient ? "text-red-300" : "text-white/40"}`}
                    >
                      {bankIcon(ba.type)}
                      Saldo: {fmtRupiah(Number(ba.current_balance))}
                      {insufficient ? " (tidak cukup)" : ""}
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
                placeholder="cth: nomor transfer BCA"
              />
            </div>
            <div>
              <FieldLabel htmlFor="attachment_url">URL Bukti Transfer</FieldLabel>
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

          {/* Totals */}
          <div className="rounded-lg border border-white/[0.06] bg-[#1f1f1f] p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Total Pembayaran</span>
              <span className="text-xl font-semibold tabular-nums text-white">
                {fmtRupiah(totalAlloc)}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-white/40">
              {allocs.filter((a) => a.selected && a.amount > 0).length} faktur
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
            disabled={submitting || pending || totalAlloc <= 0 || !supplierId}
            className="gap-1.5"
          >
            <Banknote size={14} strokeWidth={2} />
            {submitting ? "Memproses…" : "Konfirmasi Bayar"}
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
  payment: VendorPaymentRow;
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
              <Truck size={12} strokeWidth={1.8} />
              {payment.supplier_name}
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
              label="Tanggal Bayar"
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
                label="Sumber Dana"
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
                  Bukti Transfer
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
              Alokasi ke Faktur ({payment.allocations.length})
            </div>
            <table className="w-full text-sm">
              <tbody>
                {payment.allocations.map((a) => (
                  <tr
                    key={a.invoice_id}
                    className="border-b border-white/[0.04] last:border-0"
                  >
                    <td className="px-4 py-2 font-mono text-xs text-white/80">
                      {a.invoice_number}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-white">
                      {fmtRupiah(a.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-[#1f1f1f] p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/50">Total Dibayarkan</span>
              <span className="text-xl font-semibold tabular-nums text-white">
                {fmtRupiah(payment.amount)}
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
                title="Hapus Pembayaran Vendor beserta efeknya"
              >
                <Trash2 size={13} strokeWidth={1.8} />
                Hapus Pembayaran
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

function TabButton({
  active,
  onClick,
  label,
  badge,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
  tone?: "amber" | "emerald";
}) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-500/15 text-amber-300 border-amber-500/20"
      : tone === "emerald"
        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/20"
        : "bg-white/[0.06] text-white/60 border-white/10";
  return (
    <button
      onClick={onClick}
      className={`relative -mb-px px-4 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "text-white border-b-2 border-white"
          : "text-white/50 hover:text-white/80 border-b-2 border-transparent"
      }`}
    >
      <span className="flex items-center gap-2">
        {label}
        {typeof badge === "number" ? (
          <span
            className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full border px-1.5 text-[10px] font-semibold ${toneClass}`}
          >
            {badge}
          </span>
        ) : null}
      </span>
    </button>
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
  tone?: "amber" | "red";
}) {
  const t =
    tone === "amber"
      ? "text-amber-300"
      : tone === "red"
        ? "text-red-300"
        : "text-white";
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#262626] p-4">
      <div className="text-[11px] uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold ${t}`}>{value}</div>
      {subValue ? (
        <div className={`mt-0.5 text-xs ${t}`}>{subValue}</div>
      ) : null}
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
      <Banknote
        size={32}
        strokeWidth={1.5}
        className="mx-auto mb-4 text-white/30"
      />
      <h3 className="text-base font-medium text-white">
        {hasFilter ? "Tidak ada pembayaran cocok" : "Belum ada pembayaran vendor"}
      </h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-white/50">
        {hasFilter
          ? "Coba kata kunci lain."
          : "Setiap pembayaran akan menutup faktur outstanding dan otomatis update saldo akun bank."}
      </p>
      {!hasFilter && onCreate ? (
        <Button onClick={onCreate} className="mt-5 gap-2">
          <Plus size={16} strokeWidth={2} />
          Bayar Pertama
        </Button>
      ) : null}
    </div>
  );
}
