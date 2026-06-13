"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  NumberInput,
  Select,
  FieldLabel,
  FieldError,
  Alert,
} from "@sneakervault/ui";
import { QuickTip } from "@/components/ui/quick-tip";
import {
  PURCHASE_INVOICE_STATUS_LABELS,
  PURCHASE_INVOICE_STATUS_TONES,
} from "@sneakervault/shared";
import type { PurchaseInvoiceStatus } from "@sneakervault/shared";
import { useToast } from "@/components/toast";
import { formatRupiah as fmtRupiah, formatDate } from "@/lib/format";
import {
  createPurchaseInvoice,
  updatePurchaseInvoice,
  cancelPurchaseInvoice,
  deletePurchaseInvoice,
} from "@/lib/actions/purchase-invoices";
import type {
  PurchaseInvoiceRow,
  InvoicablePoRow,
} from "@/lib/queries";
import {
  Plus,
  Search,
  Eye,
  Pencil,
  XCircle,
  Trash2,
  X,
  Receipt,
  Link2,
  Calendar,
  AlertTriangle,
  ExternalLink,
  Paperclip,
} from "lucide-react";

type SupplierOpt = { id: string; name: string };

type FormState = {
  source: "manual" | "po";
  supplier_id: string;
  po_id: string;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  tax: number;
  total: number;
  notes: string;
  attachment_url: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const emptyForm = (): FormState => ({
  source: "po",
  supplier_id: "",
  po_id: "",
  invoice_date: todayIso(),
  due_date: addDaysIso(14),
  subtotal: 0,
  tax: 0,
  total: 0,
  notes: "",
  attachment_url: "",
});

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

export function FakturPembelianClient({
  invoices,
  invoicablePos,
  suppliers,
  roles,
}: {
  invoices: PurchaseInvoiceRow[];
  invoicablePos: InvoicablePoRow[];
  suppliers: SupplierOpt[];
  roles: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<
    | { mode: "new" }
    | { mode: "edit"; invoice: PurchaseInvoiceRow }
    | { mode: "view"; invoice: PurchaseInvoiceRow }
    | null
  >(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    PurchaseInvoiceStatus | "all"
  >("all");

  const canManage = roles.includes("owner") || roles.includes("finance");
  const canDelete = roles.includes("owner");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (!q) return true;
      return (
        i.invoice_number.toLowerCase().includes(q) ||
        i.supplier_name.toLowerCase().includes(q) ||
        (i.po_number ?? "").toLowerCase().includes(q)
      );
    });
  }, [invoices, search, statusFilter]);

  const stats = useMemo(() => {
    const s = {
      total: invoices.length,
      unpaid: 0,
      partial: 0,
      paid: 0,
      outstanding: 0,
      overdue: 0,
    };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const i of invoices) {
      if (i.status === "cancelled") continue;
      s[i.status as "unpaid" | "partial" | "paid"]++;
      if (i.status === "unpaid" || i.status === "partial") {
        s.outstanding += Number(i.total) - Number(i.paid_amount);
        if (i.due_date) {
          const due = new Date(i.due_date);
          if (due.getTime() < today.getTime()) s.overdue++;
        }
      }
    }
    return s;
  }, [invoices]);

  function openNew() {
    setEditing({ mode: "new" });
    setForm(emptyForm());
    setFormError(null);
    setFieldErrors({});
  }

  function openEdit(inv: PurchaseInvoiceRow) {
    setEditing({ mode: "edit", invoice: inv });
    setForm({
      source: inv.po_id ? "po" : "manual",
      supplier_id: inv.supplier_id,
      po_id: inv.po_id ?? "",
      invoice_date: inv.invoice_date,
      due_date: inv.due_date ?? "",
      subtotal: inv.subtotal,
      tax: inv.tax,
      total: inv.total,
      notes: inv.notes ?? "",
      attachment_url: inv.attachment_url ?? "",
    });
    setFormError(null);
    setFieldErrors({});
  }

  function openView(inv: PurchaseInvoiceRow) {
    setEditing({ mode: "view", invoice: inv });
  }

  function close() {
    setEditing(null);
  }

  function pickPo(poId: string) {
    const po = invoicablePos.find((p) => p.id === poId);
    if (!po) {
      setForm({ ...form, po_id: poId });
      return;
    }
    setForm({
      ...form,
      po_id: poId,
      supplier_id: po.supplier_id,
      subtotal: po.subtotal,
      tax: po.tax,
      total: po.total,
    });
  }

  function handleSourceChange(source: "manual" | "po") {
    if (source === "manual") {
      setForm({
        ...form,
        source,
        po_id: "",
      });
    } else {
      setForm({ ...form, source });
    }
  }

  function handleSubtotalChange(val: number) {
    const subtotal = Math.max(0, val);
    setForm({ ...form, subtotal, total: subtotal + form.tax });
  }

  function handleTaxChange(val: number) {
    const tax = Math.max(0, val);
    setForm({ ...form, tax, total: form.subtotal + tax });
  }

  function handleTotalChange(val: number) {
    setForm({ ...form, total: Math.max(0, val) });
  }

  function handleSave() {
    if (!editing || editing.mode === "view") return;
    if (!form.supplier_id) {
      setFormError("Pilih vendor");
      return;
    }
    if (form.total <= 0) {
      setFormError("Total faktur harus lebih dari 0");
      return;
    }
    const payload = {
      supplier_id: form.supplier_id,
      po_id: form.source === "po" ? form.po_id || null : null,
      invoice_date: form.invoice_date,
      due_date: form.due_date || null,
      subtotal: form.subtotal,
      tax: form.tax,
      total: form.total,
      notes: form.notes || undefined,
      attachment_url: form.attachment_url || null,
    };
    setFormError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = (editing.mode === "new"
        ? await createPurchaseInvoice(payload)
        : await updatePurchaseInvoice(editing.invoice.id, payload)) as {
        error?: unknown;
      };
      if (result.error) {
        const e = result.error as { _form?: string[] } | Record<string, string[]>;
        if ("_form" in e && e._form) {
          setFormError(e._form[0] ?? "Gagal menyimpan");
        } else {
          const errs: Record<string, string> = {};
          for (const [k, v] of Object.entries(e)) {
            errs[k] = Array.isArray(v) ? v[0] ?? "" : String(v);
          }
          setFieldErrors(errs);
        }
        return;
      }
      toast.push(
        editing.mode === "new" ? "Faktur dibuat" : "Faktur diperbarui",
        "success",
      );
      close();
      router.refresh();
    });
  }

  function handleCancel(id: string) {
    const reason = prompt("Alasan pembatalan? (opsional)");
    if (reason === null) return;
    startTransition(async () => {
      const r = await cancelPurchaseInvoice(id, reason || undefined);
      if ("error" in r && r.error) {
        toast.push(typeof r.error === "string" ? r.error : "Gagal", "error");
        return;
      }
      toast.push("Faktur dibatalkan", "success");
      close();
      router.refresh();
    });
  }

  function handleDelete(id: string, num: string) {
    if (!confirm(`Hapus permanen ${num}?`)) return;
    startTransition(async () => {
      const r = await deletePurchaseInvoice(id);
      if ("error" in r && r.error) {
        toast.push(typeof r.error === "string" ? r.error : "Gagal", "error");
        return;
      }
      toast.push("Faktur dihapus", "success");
      close();
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] text-white/80">
            <Receipt size={20} strokeWidth={1.7} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Faktur Pembelian
            </h1>
            <p className="text-sm text-white/50">
              Tagihan dari vendor — sumber Account Payable
            </p>
          </div>
        </div>
        {canManage ? (
          <Button onClick={openNew} className="gap-2">
            <Plus size={16} strokeWidth={2} />
            Faktur Baru
          </Button>
        ) : null}
      </div>

      <QuickTip
        id="pembelian-faktur-intro"
        title="Faktur Pembelian = Hutang Usaha"
        tone="info"
      >
        Faktur catat <strong>tagihan dari vendor</strong>. Saat dibuat, sistem otomatis:
        Dr <em>Persediaan + Pajak Masukan</em> / Cr <em>Hutang Usaha (2.1.01)</em>.
        Pilih dari PO yang sudah diterima — atau buat manual untuk pembelian tanpa PO.
        Setelah dicatat, lanjut ke <strong>Bayar Vendor</strong> untuk melunasi (sebagian / penuh).
      </QuickTip>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="Total Faktur" value={stats.total.toString()} />
        <StatTile
          label="Belum Dibayar"
          value={stats.unpaid.toString()}
          tone="amber"
        />
        <StatTile
          label="Sebagian"
          value={stats.partial.toString()}
          tone="sky"
        />
        <StatTile label="Outstanding" value={fmtRupiah(stats.outstanding)} />
        <StatTile
          label="Lewat Jatuh Tempo"
          value={stats.overdue.toString()}
          tone={stats.overdue > 0 ? "red" : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/[0.06] bg-[#262626] p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            strokeWidth={1.8}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
          />
          <Input
            placeholder="Cari nomor faktur, PO, atau vendor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as PurchaseInvoiceStatus | "all")
          }
          className="min-w-[160px]"
        >
          <option value="all">Semua status</option>
          {(Object.keys(PURCHASE_INVOICE_STATUS_LABELS) as PurchaseInvoiceStatus[]).map(
            (s) => (
              <option key={s} value={s}>
                {PURCHASE_INVOICE_STATUS_LABELS[s]}
              </option>
            ),
          )}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          hasFilter={search.length > 0 || statusFilter !== "all"}
          onCreate={canManage ? openNew : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-[#262626]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-white/40">
                <th className="px-4 py-3 font-medium">No Faktur</th>
                <th className="px-4 py-3 font-medium">Vendor</th>
                <th className="px-4 py-3 font-medium">Ref PO</th>
                <th className="px-4 py-3 font-medium">Tgl Faktur</th>
                <th className="px-4 py-3 font-medium">Jatuh Tempo</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-right font-medium">Sisa</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const remaining = i.total - i.paid_amount;
                const due = daysUntil(i.due_date);
                const isOverdue =
                  due !== null &&
                  due < 0 &&
                  (i.status === "unpaid" || i.status === "partial");
                return (
                  <tr
                    key={i.id}
                    className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-white/80">
                      {i.invoice_number}
                    </td>
                    <td className="px-4 py-3 text-white/90">
                      {i.supplier_name}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {i.po_number ? (
                        <span className="inline-flex items-center gap-1 rounded bg-white/[0.04] px-2 py-0.5 font-mono text-white/70">
                          <Link2 size={10} strokeWidth={1.8} />
                          {i.po_number}
                        </span>
                      ) : (
                        <span className="text-white/30">Manual</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      {fmtDate(i.invoice_date)}
                    </td>
                    <td className="px-4 py-3">
                      <div
                        className={
                          isOverdue ? "text-red-300" : "text-white/60"
                        }
                      >
                        {fmtDate(i.due_date)}
                      </div>
                      {isOverdue ? (
                        <div className="flex items-center gap-1 text-[10px] text-red-300">
                          <AlertTriangle size={9} strokeWidth={2} />
                          {Math.abs(due!)} hari lewat
                        </div>
                      ) : due !== null &&
                        due <= 3 &&
                        due >= 0 &&
                        (i.status === "unpaid" || i.status === "partial") ? (
                        <div className="text-[10px] text-amber-300">
                          {due === 0 ? "Hari ini" : `${due} hari lagi`}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-white">
                      {fmtRupiah(i.total)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {i.status === "paid" || i.status === "cancelled" ? (
                        <span className="text-white/30">—</span>
                      ) : (
                        <span
                          className={
                            remaining > 0 ? "text-amber-300" : "text-white/60"
                          }
                        >
                          {fmtRupiah(remaining)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-medium ${PURCHASE_INVOICE_STATUS_TONES[i.status]}`}
                      >
                        {PURCHASE_INVOICE_STATUS_LABELS[i.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => openView(i)}
                          className="rounded p-1.5 text-white/50 hover:bg-white/[0.06] hover:text-white"
                          title="Lihat detail"
                        >
                          <Eye size={14} strokeWidth={1.8} />
                        </button>
                        {canManage &&
                        (i.status === "unpaid" || i.status === "partial") &&
                        i.paid_amount === 0 ? (
                          <button
                            onClick={() => openEdit(i)}
                            className="rounded p-1.5 text-white/50 hover:bg-white/[0.06] hover:text-white"
                            title="Edit"
                          >
                            <Pencil size={14} strokeWidth={1.8} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && editing.mode !== "view" ? (
        <FormModal
          editing={editing}
          form={form}
          setForm={setForm}
          suppliers={suppliers}
          invoicablePos={invoicablePos}
          formError={formError}
          fieldErrors={fieldErrors}
          pending={pending}
          onClose={close}
          onSave={handleSave}
          onPickPo={pickPo}
          onSourceChange={handleSourceChange}
          onSubtotalChange={handleSubtotalChange}
          onTaxChange={handleTaxChange}
          onTotalChange={handleTotalChange}
        />
      ) : null}
      {editing && editing.mode === "view" ? (
        <ViewModal
          invoice={editing.invoice}
          onClose={close}
          canManage={canManage}
          canDelete={canDelete}
          pending={pending}
          onCancel={() => handleCancel(editing.invoice.id)}
          onDelete={() =>
            handleDelete(editing.invoice.id, editing.invoice.invoice_number)
          }
        />
      ) : null}
    </div>
  );
}

function FormModal({
  editing,
  form,
  setForm,
  suppliers,
  invoicablePos,
  formError,
  fieldErrors,
  pending,
  onClose,
  onSave,
  onPickPo,
  onSourceChange,
  onSubtotalChange,
  onTaxChange,
  onTotalChange,
}: {
  editing: { mode: "new" } | { mode: "edit"; invoice: PurchaseInvoiceRow };
  form: FormState;
  setForm: (f: FormState) => void;
  suppliers: SupplierOpt[];
  invoicablePos: InvoicablePoRow[];
  formError: string | null;
  fieldErrors: Record<string, string>;
  pending: boolean;
  onClose: () => void;
  onSave: () => void;
  onPickPo: (id: string) => void;
  onSourceChange: (s: "manual" | "po") => void;
  onSubtotalChange: (v: number) => void;
  onTaxChange: (v: number) => void;
  onTotalChange: (v: number) => void;
}) {
  const filteredPos = useMemo(() => {
    if (!form.supplier_id) return invoicablePos;
    return invoicablePos.filter((p) => p.supplier_id === form.supplier_id);
  }, [invoicablePos, form.supplier_id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#262626] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <h2 className="text-base font-semibold text-white">
            {editing.mode === "new"
              ? "Faktur Pembelian Baru"
              : `Edit ${editing.invoice.invoice_number}`}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-white/50 hover:bg-white/[0.06] hover:text-white"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {formError ? <Alert tone="error">{formError}</Alert> : null}

          {editing.mode === "new" ? (
            <div>
              <FieldLabel>Sumber Faktur</FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onSourceChange("po")}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    form.source === "po"
                      ? "border-sky-500/40 bg-sky-500/[0.08]"
                      : "border-white/[0.08] bg-[#1f1f1f] hover:bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-white">
                    <Link2 size={14} strokeWidth={1.8} />
                    Dari PO
                  </div>
                  <p className="mt-0.5 text-[11px] text-white/50">
                    Auto-fill dari PO yang sudah diterima
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onSourceChange("manual")}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    form.source === "manual"
                      ? "border-amber-500/40 bg-amber-500/[0.08]"
                      : "border-white/[0.08] bg-[#1f1f1f] hover:bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-white">
                    <Pencil size={14} strokeWidth={1.8} />
                    Manual
                  </div>
                  <p className="mt-0.5 text-[11px] text-white/50">
                    Pengeluaran non-PO (biaya ops, dll)
                  </p>
                </button>
              </div>
            </div>
          ) : null}

          {form.source === "po" ? (
            <div>
              <FieldLabel htmlFor="po_id">Pembelian Barang *</FieldLabel>
              <Select
                id="po_id"
                value={form.po_id}
                onChange={(e) => onPickPo(e.target.value)}
              >
                <option value="">— Pilih PO —</option>
                {filteredPos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.po_number} · {p.supplier_name} · {fmtRupiah(p.total)}
                  </option>
                ))}
              </Select>
              {filteredPos.length === 0 ? (
                <p className="mt-1 text-[11px] text-white/40">
                  Tidak ada PO yang siap difakturkan untuk vendor terpilih.
                  Hanya PO status Receiving/Completed yang muncul.
                </p>
              ) : null}
            </div>
          ) : null}

          <div>
            <FieldLabel htmlFor="supplier_id">Vendor *</FieldLabel>
            <Select
              id="supplier_id"
              value={form.supplier_id}
              onChange={(e) =>
                setForm({ ...form, supplier_id: e.target.value })
              }
              disabled={form.source === "po" && Boolean(form.po_id)}
            >
              <option value="">— Pilih vendor —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <FieldError message={fieldErrors.supplier_id} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="invoice_date">Tanggal Faktur *</FieldLabel>
              <Input
                id="invoice_date"
                type="date"
                value={form.invoice_date}
                onChange={(e) =>
                  setForm({ ...form, invoice_date: e.target.value })
                }
              />
            </div>
            <div>
              <FieldLabel htmlFor="due_date">Jatuh Tempo</FieldLabel>
              <Input
                id="due_date"
                type="date"
                value={form.due_date}
                onChange={(e) =>
                  setForm({ ...form, due_date: e.target.value })
                }
              />
              <p className="mt-1 text-[11px] text-white/40">
                Default: +14 hari dari hari ini
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <FieldLabel htmlFor="subtotal">Subtotal *</FieldLabel>
              <NumberInput
                id="subtotal"
                min={0}
                value={form.subtotal}
                onValueChange={onSubtotalChange}
              />
            </div>
            <div>
              <FieldLabel htmlFor="tax">Pajak</FieldLabel>
              <NumberInput
                id="tax"
                min={0}
                value={form.tax}
                onValueChange={onTaxChange}
              />
            </div>
            <div>
              <FieldLabel htmlFor="total">Total *</FieldLabel>
              <NumberInput
                id="total"
                min={0}
                value={form.total}
                onValueChange={onTotalChange}
              />
              <p className="mt-1 text-[11px] text-white/40">
                Bisa di-override (cth: pembulatan)
              </p>
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="attachment_url">URL Foto Faktur</FieldLabel>
            <Input
              id="attachment_url"
              type="url"
              value={form.attachment_url}
              onChange={(e) =>
                setForm({ ...form, attachment_url: e.target.value })
              }
              placeholder="https://… (opsional)"
            />
          </div>

          <div>
            <FieldLabel htmlFor="notes">Catatan</FieldLabel>
            <Input
              id="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="opsional"
            />
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-white/[0.06] px-6 py-4">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Batal
          </Button>
          <Button
            onClick={onSave}
            disabled={pending || form.total <= 0 || !form.supplier_id}
          >
            {pending
              ? "Menyimpan…"
              : editing.mode === "new"
                ? "Simpan Faktur"
                : "Simpan Perubahan"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ViewModal({
  invoice,
  onClose,
  canManage,
  canDelete,
  pending,
  onCancel,
  onDelete,
}: {
  invoice: PurchaseInvoiceRow;
  onClose: () => void;
  canManage: boolean;
  canDelete: boolean;
  pending: boolean;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const remaining = invoice.total - invoice.paid_amount;
  const due = daysUntil(invoice.due_date);
  const isOverdue =
    due !== null &&
    due < 0 &&
    (invoice.status === "unpaid" || invoice.status === "partial");

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
                {invoice.invoice_number}
              </h2>
              <span
                className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-medium ${PURCHASE_INVOICE_STATUS_TONES[invoice.status]}`}
              >
                {PURCHASE_INVOICE_STATUS_LABELS[invoice.status]}
              </span>
            </div>
            <p className="mt-1 text-sm text-white/50">{invoice.supplier_name}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-white/50 hover:bg-white/[0.06] hover:text-white"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {isOverdue ? (
            <Alert tone="error">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} strokeWidth={1.8} className="mt-0.5" />
                <span>
                  Faktur lewat jatuh tempo {Math.abs(due!)} hari. Segera lakukan
                  pembayaran.
                </span>
              </div>
            </Alert>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <Meta
              icon={<Calendar size={11} strokeWidth={2} />}
              label="Tanggal Faktur"
              value={fmtDate(invoice.invoice_date)}
            />
            <Meta
              icon={<Calendar size={11} strokeWidth={2} />}
              label="Jatuh Tempo"
              value={fmtDate(invoice.due_date)}
            />
            {invoice.po_number ? (
              <Meta
                icon={<Link2 size={11} strokeWidth={2} />}
                label="Referensi PO"
                value={invoice.po_number}
                mono
              />
            ) : (
              <Meta
                icon={<Pencil size={11} strokeWidth={2} />}
                label="Sumber"
                value="Manual"
              />
            )}
            {invoice.attachment_url ? (
              <div>
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/40">
                  <Paperclip size={11} strokeWidth={2} />
                  Lampiran
                </div>
                <a
                  href={invoice.attachment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-sm text-sky-300 hover:underline"
                >
                  Buka file <ExternalLink size={11} strokeWidth={2} />
                </a>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-[#1f1f1f] p-4 space-y-1.5">
            <Row label="Subtotal" value={fmtRupiah(invoice.subtotal)} />
            <Row label="Pajak" value={fmtRupiah(invoice.tax)} />
            <div className="mt-2 flex items-center justify-between border-t border-white/[0.04] pt-2 text-base font-semibold">
              <span className="text-white">Total</span>
              <span className="tabular-nums text-white">
                {fmtRupiah(invoice.total)}
              </span>
            </div>
            <Row label="Sudah Dibayar" value={fmtRupiah(invoice.paid_amount)} />
            <div className="flex items-center justify-between pt-1 text-base font-semibold">
              <span className="text-white">Sisa Hutang</span>
              <span
                className={`tabular-nums ${remaining > 0 ? "text-amber-300" : "text-emerald-300"}`}
              >
                {fmtRupiah(remaining)}
              </span>
            </div>
          </div>

          {invoice.notes ? (
            <div className="rounded-lg border border-white/[0.06] bg-[#1f1f1f] p-4">
              <div className="text-[11px] uppercase tracking-wider text-white/40">
                Catatan
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-white/80">
                {invoice.notes}
              </p>
            </div>
          ) : null}

          <div className="rounded-lg border border-sky-500/15 bg-sky-500/[0.04] p-3 text-xs text-sky-200/80">
            Untuk mencatat pembayaran, gunakan menu{" "}
            <strong>Pembelian → Pembayaran Vendor</strong>. Pembayaran bisa
            allokasi ke beberapa faktur sekaligus.
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center justify-between gap-2 border-t border-white/[0.06] px-6 py-4">
          <div>
            {canDelete &&
            (invoice.status === "unpaid" || invoice.status === "cancelled") &&
            invoice.paid_amount === 0 ? (
              <button
                onClick={onDelete}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs text-white/60 hover:bg-red-500/10 hover:text-red-300"
              >
                <Trash2 size={13} strokeWidth={1.8} />
                Hapus permanen
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Tutup
            </Button>
            {canManage &&
            invoice.status !== "paid" &&
            invoice.status !== "cancelled" &&
            invoice.paid_amount === 0 ? (
              <Button
                variant="ghost"
                onClick={onCancel}
                disabled={pending}
                className="gap-1.5 text-red-300 hover:bg-red-500/10"
              >
                <XCircle size={14} strokeWidth={1.8} />
                Batalkan
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-white/50">{label}</span>
      <span className="tabular-nums text-white/80">{value}</span>
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
  tone,
}: {
  label: string;
  value: string;
  tone?: "sky" | "amber" | "red" | "emerald";
}) {
  const t =
    tone === "sky"
      ? "text-sky-300"
      : tone === "amber"
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

function EmptyState({
  hasFilter,
  onCreate,
}: {
  hasFilter: boolean;
  onCreate?: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 bg-[#262626] px-6 py-16 text-center">
      <Receipt
        size={32}
        strokeWidth={1.5}
        className="mx-auto mb-4 text-white/30"
      />
      <h3 className="text-base font-medium text-white">
        {hasFilter ? "Tidak ada faktur cocok" : "Belum ada faktur pembelian"}
      </h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-white/50">
        {hasFilter
          ? "Coba ubah filter pencarian."
          : "Buat faktur dari PO yang sudah diterima, atau manual untuk pengeluaran non-PO (sewa, listrik, gaji, dll)."}
      </p>
      {!hasFilter && onCreate ? (
        <Button onClick={onCreate} className="mt-5 gap-2">
          <Plus size={16} strokeWidth={2} />
          Faktur Pertama
        </Button>
      ) : null}
    </div>
  );
}
