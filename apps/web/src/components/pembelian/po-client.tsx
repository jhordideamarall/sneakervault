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
import { QuickTip } from "@/components/ui/quick-tip";
import { PO_STATUS_LABELS, PO_STATUS_TONES } from "@sneakervault/shared";
import type { PoStatus } from "@sneakervault/shared";
import { useToast } from "@/components/toast";
import {
  createPurchaseOrder,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  deletePurchaseOrder,
  updatePurchaseOrder,
} from "@/lib/actions/purchase-orders";
import type {
  PoListRow,
  PoDetail,
  ProductPickerRow,
  BankAccountRow,
} from "@/lib/queries";
import type { PoPaymentType } from "@sneakervault/shared";
import {
  Plus,
  Search,
  Eye,
  Pencil,
  CheckCircle2,
  XCircle,
  Trash2,
  X,
  ClipboardList,
  Calendar,
  Package,
} from "lucide-react";

type SupplierOpt = { id: string; name: string };

type FormLine = {
  product_id: string;
  product_label: string;
  ordered_qty: number;
  unit_cost: number;
  notes: string;
};

type FormState = {
  supplier_id: string;
  order_date: string;
  expected_date: string;
  tax: number;
  shipping: number;
  notes: string;
  lines: FormLine[];
  payment_type: PoPaymentType;
  dp_mode: "percent" | "manual";
  dp_percent: number;
  dp_amount: number;
  dp_bank_account_id: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm = (): FormState => ({
  supplier_id: "",
  order_date: todayIso(),
  expected_date: "",
  tax: 0,
  shipping: 0,
  notes: "",
  lines: [],
  payment_type: "credit",
  dp_mode: "percent",
  dp_percent: 50,
  dp_amount: 0,
  dp_bank_account_id: "",
});

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

export function PurchaseOrderClient({
  orders,
  suppliers,
  products,
  bankAccounts,
  roles,
  detailById,
}: {
  orders: PoListRow[];
  suppliers: SupplierOpt[];
  products: ProductPickerRow[];
  bankAccounts: BankAccountRow[];
  roles: string[];
  detailById: Record<string, PoDetail>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<
    | { mode: "new" }
    | { mode: "edit"; po: PoDetail }
    | { mode: "view"; po: PoDetail }
    | null
  >(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PoStatus | "all">("all");

  const canManage = roles.includes("owner") || roles.includes("finance");
  const canDelete = roles.includes("owner");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (!q) return true;
      return (
        o.po_number.toLowerCase().includes(q) ||
        o.supplier_name.toLowerCase().includes(q)
      );
    });
  }, [orders, search, statusFilter]);

  const stats = useMemo(() => {
    const s = {
      total: orders.length,
      draft: 0,
      approved: 0,
      receiving: 0,
      completed: 0,
      cancelled: 0,
      open_value: 0,
    };
    for (const o of orders) {
      s[o.status]++;
      if (o.status === "approved" || o.status === "receiving") {
        s.open_value += o.total;
      }
    }
    return s;
  }, [orders]);

  function openNew() {
    setEditing({ mode: "new" });
    setForm(emptyForm());
    setFormError(null);
    setFieldErrors({});
  }

  function openEdit(po: PoDetail) {
    setEditing({ mode: "edit", po });
    const lineSubtotal = po.lines.reduce(
      (s, l) => s + l.ordered_qty * l.unit_cost,
      0,
    );
    const total = lineSubtotal + po.tax + po.shipping;
    const dpPercent =
      total > 0 && po.payment_type === "dp"
        ? Math.round((po.dp_amount / total) * 100)
        : 50;
    setForm({
      supplier_id: po.supplier_id,
      order_date: po.order_date,
      expected_date: po.expected_date ?? "",
      tax: po.tax,
      shipping: po.shipping,
      notes: po.notes ?? "",
      lines: po.lines.map((l) => ({
        product_id: l.product_id,
        product_label: l.product_label,
        ordered_qty: l.ordered_qty,
        unit_cost: l.unit_cost,
        notes: l.notes ?? "",
      })),
      payment_type: po.payment_type,
      dp_mode: "percent",
      dp_percent: dpPercent,
      dp_amount: po.dp_amount,
      dp_bank_account_id: po.dp_bank_account_id ?? "",
    });
    setFormError(null);
    setFieldErrors({});
  }

  function openView(po: PoDetail) {
    setEditing({ mode: "view", po });
  }

  function close() {
    setEditing(null);
  }

  function addLine(product: ProductPickerRow) {
    const exists = form.lines.find((l) => l.product_id === product.id);
    if (exists) {
      setForm({
        ...form,
        lines: form.lines.map((l) =>
          l.product_id === product.id
            ? { ...l, ordered_qty: l.ordered_qty + 1 }
            : l,
        ),
      });
      return;
    }
    setForm({
      ...form,
      lines: [
        ...form.lines,
        {
          product_id: product.id,
          product_label: `${product.brand} ${product.model} ${product.color} • Size ${product.size} • ${product.sku}`,
          ordered_qty: 1,
          unit_cost: product.hpp || 0,
          notes: "",
        },
      ],
    });
  }

  function removeLine(idx: number) {
    setForm({ ...form, lines: form.lines.filter((_, i) => i !== idx) });
  }

  function updateLine(idx: number, patch: Partial<FormLine>) {
    setForm({
      ...form,
      lines: form.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    });
  }

  const formSubtotal = form.lines.reduce(
    (acc, l) => acc + l.ordered_qty * l.unit_cost,
    0,
  );
  const formTotal = formSubtotal + form.tax + form.shipping;

  function handleSave() {
    if (!editing || editing.mode === "view") return;
    if (form.lines.length === 0) {
      setFormError("Tambahkan minimal 1 item ke PO");
      return;
    }
    if (!form.supplier_id) {
      setFormError("Pilih vendor terlebih dahulu");
      return;
    }
    // Compute final DP amount from mode
    let computedDpAmount = 0;
    if (form.payment_type === "cash") {
      computedDpAmount = formTotal;
    } else if (form.payment_type === "dp") {
      computedDpAmount =
        form.dp_mode === "percent"
          ? Math.round((formTotal * form.dp_percent) / 100)
          : form.dp_amount;
      if (computedDpAmount <= 0) {
        setFormError("Nominal DP harus lebih dari 0");
        return;
      }
      if (computedDpAmount >= formTotal) {
        setFormError("DP tidak boleh ≥ total PO. Pakai 'Bayar Lunas' jika ingin bayar penuh.");
        return;
      }
    }
    if (form.payment_type !== "credit" && !form.dp_bank_account_id) {
      setFormError("Pilih akun bank/kas sumber dana");
      return;
    }
    const payload = {
      supplier_id: form.supplier_id,
      order_date: form.order_date,
      expected_date: form.expected_date || undefined,
      tax: form.tax,
      shipping: form.shipping,
      notes: form.notes || undefined,
      lines: form.lines.map((l) => ({
        product_id: l.product_id,
        ordered_qty: l.ordered_qty,
        unit_cost: l.unit_cost,
        notes: l.notes || undefined,
      })),
      payment_type: form.payment_type,
      dp_amount: computedDpAmount,
      dp_bank_account_id:
        form.payment_type === "credit"
          ? null
          : form.dp_bank_account_id || null,
    };
    setFormError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = (editing.mode === "new"
        ? await createPurchaseOrder(payload)
        : await updatePurchaseOrder(editing.po.id, payload)) as {
        error?: unknown;
        data?: unknown;
        success?: boolean;
      };
      if (result.error) {
        if (typeof result.error === "object" && "_form" in result.error) {
          setFormError(
            (result.error._form as string[])?.[0] ?? "Gagal menyimpan",
          );
        } else if (typeof result.error === "object") {
          const errs: Record<string, string> = {};
          for (const [k, v] of Object.entries(result.error)) {
            errs[k] = Array.isArray(v) ? v[0] ?? "" : String(v);
          }
          setFieldErrors(errs);
        } else {
          setFormError(String(result.error));
        }
        return;
      }
      toast.push(
        editing.mode === "new" ? "PO berhasil dibuat" : "PO diperbarui",
        "success",
      );
      close();
      router.refresh();
    });
  }

  function handleApprove(id: string) {
    if (!confirm("Setujui PO ini? Setelah disetujui, PO tidak bisa diedit.")) return;
    startTransition(async () => {
      const r = await approvePurchaseOrder(id);
      if ("error" in r && r.error) {
        toast.push(typeof r.error === "string" ? r.error : "Gagal", "error");
        return;
      }
      toast.push("PO disetujui — siap diterima gudang", "success");
      close();
      router.refresh();
    });
  }

  function handleCancel(id: string) {
    const reason = prompt("Alasan pembatalan? (opsional)");
    if (reason === null) return;
    startTransition(async () => {
      const r = await cancelPurchaseOrder(id, reason || undefined);
      if ("error" in r && r.error) {
        toast.push(typeof r.error === "string" ? r.error : "Gagal", "error");
        return;
      }
      toast.push("PO dibatalkan", "success");
      close();
      router.refresh();
    });
  }

  function handleDelete(id: string, poNumber: string) {
    if (!confirm(`Hapus permanen ${poNumber}? Tidak bisa di-undo.`)) return;
    startTransition(async () => {
      const r = await deletePurchaseOrder(id);
      if ("error" in r && r.error) {
        toast.push(typeof r.error === "string" ? r.error : "Gagal", "error");
        return;
      }
      toast.push("PO dihapus", "success");
      close();
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] text-white/80">
            <ClipboardList size={20} strokeWidth={1.7} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Purchase Order
            </h1>
            <p className="text-sm text-white/50">
              Daftar pembelian dari finance ke vendor sebelum barang masuk
            </p>
          </div>
        </div>
        {canManage ? (
          <Button onClick={openNew} className="gap-2">
            <Plus size={16} strokeWidth={2} />
            PO Baru
          </Button>
        ) : null}
      </div>

      <QuickTip
        id="pembelian-po-intro-v2"
        title="Alur Pembelian — disederhanakan"
        tone="info"
      >
        <strong>1. Buat PO</strong> → <strong>2. Approve</strong> → <strong>3. Penerimaan Barang</strong> (stok+HPP auto, dan{" "}
        <strong>Faktur otomatis dibuat saat PO completed ✨</strong>) → <strong>4. Bayar Vendor</strong> (pilih metode tunai / transfer, jurnal otomatis).
        <br />
        <span className="mt-1 inline-block text-[12px] text-white/55">
          💡 <strong>Tunai</strong>: di step Bayar Vendor pilih metode <em>Cash</em>, bayar penuh.{" "}
          <strong>Uang muka / DP</strong>: di Bayar Vendor isi nominal partial dulu — sisa hutang tetap tercatat untuk dibayar berikutnya.
        </span>
      </QuickTip>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="Total PO" value={stats.total.toString()} />
        <StatTile label="Draft" value={stats.draft.toString()} />
        <StatTile
          label="Disetujui"
          value={stats.approved.toString()}
          tone="sky"
        />
        <StatTile
          label="Diterima"
          value={stats.receiving.toString()}
          tone="amber"
        />
        <StatTile label="Nilai Outstanding" value={fmtRupiah(stats.open_value)} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/[0.06] bg-[#262626] p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            strokeWidth={1.8}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
          />
          <Input
            placeholder="Cari nomor PO atau vendor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as PoStatus | "all")}
          className="min-w-[160px]"
        >
          <option value="all">Semua status</option>
          {(Object.keys(PO_STATUS_LABELS) as PoStatus[]).map((s) => (
            <option key={s} value={s}>
              {PO_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState hasFilter={search.length > 0 || statusFilter !== "all"} onCreate={canManage ? openNew : undefined} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-[#262626]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-white/40">
                <th className="px-4 py-3 font-medium">No PO</th>
                <th className="px-4 py-3 font-medium">Vendor</th>
                <th className="px-4 py-3 font-medium">Tanggal</th>
                <th className="px-4 py-3 font-medium text-center">Items</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const detail = detailById[o.id];
                return (
                  <tr
                    key={o.id}
                    className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-white/80">
                      {o.po_number}
                    </td>
                    <td className="px-4 py-3 text-white/90">{o.supplier_name}</td>
                    <td className="px-4 py-3 text-white/60">
                      <div>{fmtDate(o.order_date)}</div>
                      {o.expected_date ? (
                        <div className="text-[11px] text-white/40">
                          ETA: {fmtDate(o.expected_date)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-center text-white/70">
                      {o.line_count}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-white">
                      {fmtRupiah(o.total)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-medium ${PO_STATUS_TONES[o.status]}`}
                      >
                        {PO_STATUS_LABELS[o.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        {detail ? (
                          <button
                            onClick={() => openView(detail)}
                            className="rounded p-1.5 text-white/50 hover:bg-white/[0.06] hover:text-white"
                            title="Lihat detail"
                          >
                            <Eye size={14} strokeWidth={1.8} />
                          </button>
                        ) : null}
                        {canManage && detail && o.status === "draft" ? (
                          <button
                            onClick={() => openEdit(detail)}
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

      {/* Modal */}
      {editing && editing.mode !== "view" ? (
        <FormModal
          editing={editing}
          form={form}
          setForm={setForm}
          suppliers={suppliers}
          products={products}
          bankAccounts={bankAccounts}
          formError={formError}
          fieldErrors={fieldErrors}
          formSubtotal={formSubtotal}
          formTotal={formTotal}
          pending={pending}
          onClose={close}
          onSave={handleSave}
          onAddLine={addLine}
          onRemoveLine={removeLine}
          onUpdateLine={updateLine}
        />
      ) : null}
      {editing && editing.mode === "view" ? (
        <ViewModal
          po={editing.po}
          onClose={close}
          canManage={canManage}
          canDelete={canDelete}
          pending={pending}
          onApprove={() => handleApprove(editing.po.id)}
          onCancel={() => handleCancel(editing.po.id)}
          onDelete={() => handleDelete(editing.po.id, editing.po.po_number)}
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
  products,
  bankAccounts,
  formError,
  fieldErrors,
  formSubtotal,
  formTotal,
  pending,
  onClose,
  onSave,
  onAddLine,
  onRemoveLine,
  onUpdateLine,
}: {
  editing: { mode: "new" } | { mode: "edit"; po: PoDetail };
  form: FormState;
  setForm: (f: FormState) => void;
  suppliers: SupplierOpt[];
  products: ProductPickerRow[];
  bankAccounts: BankAccountRow[];
  formError: string | null;
  fieldErrors: Record<string, string>;
  formSubtotal: number;
  formTotal: number;
  pending: boolean;
  onClose: () => void;
  onSave: () => void;
  onAddLine: (p: ProductPickerRow) => void;
  onRemoveLine: (idx: number) => void;
  onUpdateLine: (idx: number, patch: Partial<FormLine>) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  const filteredProducts = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products
      .filter((p) =>
        `${p.brand} ${p.model} ${p.color} ${p.sku} ${p.barcode}`
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 50);
  }, [products, pickerSearch]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col rounded-xl border border-white/[0.08] bg-[#262626] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4 flex-shrink-0">
          <h2 className="text-base font-semibold text-white">
            {editing.mode === "new"
              ? "Purchase Order Baru"
              : `Edit ${editing.po.po_number}`}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-white/50 hover:bg-white/[0.06] hover:text-white"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {formError ? <Alert tone="error">{formError}</Alert> : null}

          {/* Header form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="supplier_id">Vendor *</FieldLabel>
              <Select
                id="supplier_id"
                value={form.supplier_id}
                onChange={(e) =>
                  setForm({ ...form, supplier_id: e.target.value })
                }
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
                <FieldLabel htmlFor="order_date">Tanggal Order *</FieldLabel>
                <Input
                  id="order_date"
                  type="date"
                  value={form.order_date}
                  onChange={(e) =>
                    setForm({ ...form, order_date: e.target.value })
                  }
                />
              </div>
              <div>
                <FieldLabel htmlFor="expected_date">ETA Diterima</FieldLabel>
                <Input
                  id="expected_date"
                  type="date"
                  value={form.expected_date}
                  onChange={(e) =>
                    setForm({ ...form, expected_date: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          {/* Lines */}
          <div className="rounded-lg border border-white/[0.06]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <h3 className="text-sm font-medium text-white">
                Item ({form.lines.length})
              </h3>
              <Button
                variant="ghost"
                onClick={() => setPickerOpen(!pickerOpen)}
                className="gap-1.5"
              >
                <Plus size={14} strokeWidth={2} />
                Tambah Item
              </Button>
            </div>

            {pickerOpen ? (
              <div className="border-b border-white/[0.06] bg-[#1f1f1f] p-3 space-y-2">
                <div className="relative">
                  <Search
                    size={14}
                    strokeWidth={1.8}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
                  />
                  <Input
                    autoFocus
                    placeholder="Cari brand, model, SKU, atau barcode…"
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="max-h-60 overflow-y-auto rounded border border-white/[0.04] bg-[#262626]">
                  {filteredProducts.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-white/40">
                      Tidak ada produk cocok.
                    </div>
                  ) : (
                    filteredProducts.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          onAddLine(p);
                          setPickerSearch("");
                        }}
                        className="flex w-full items-center justify-between border-b border-white/[0.04] px-3 py-2 text-left text-sm last:border-0 hover:bg-white/[0.04]"
                      >
                        <div>
                          <div className="text-white">
                            {p.brand} {p.model}{" "}
                            <span className="text-white/50">
                              · {p.color} · Size {p.size}
                            </span>
                          </div>
                          <div className="text-[11px] text-white/40">
                            SKU {p.sku} · Stok {p.quantity} · HPP{" "}
                            {fmtRupiah(p.hpp)}
                          </div>
                        </div>
                        <Plus size={14} strokeWidth={2} className="text-white/40" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : null}

            {form.lines.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-white/40">
                Belum ada item. Klik "Tambah Item" untuk pilih produk.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.04] text-left text-[11px] uppercase tracking-wider text-white/40">
                    <th className="px-3 py-2 font-medium">Produk</th>
                    <th className="px-3 py-2 font-medium" style={{ width: "90px" }}>
                      Qty
                    </th>
                    <th className="px-3 py-2 font-medium" style={{ width: "130px" }}>
                      Harga
                    </th>
                    <th
                      className="px-3 py-2 text-right font-medium"
                      style={{ width: "130px" }}
                    >
                      Subtotal
                    </th>
                    <th style={{ width: "40px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((l, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-white/[0.04] last:border-0"
                    >
                      <td className="px-3 py-2 text-white/80">
                        {l.product_label}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={1}
                          value={l.ordered_qty}
                          onChange={(e) =>
                            onUpdateLine(idx, {
                              ordered_qty: Math.max(1, Number(e.target.value)),
                            })
                          }
                          className="h-8 px-2"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          value={l.unit_cost}
                          onChange={(e) =>
                            onUpdateLine(idx, {
                              unit_cost: Math.max(0, Number(e.target.value)),
                            })
                          }
                          className="h-8 px-2"
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-white">
                        {fmtRupiah(l.ordered_qty * l.unit_cost)}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => onRemoveLine(idx)}
                          className="rounded p-1 text-white/40 hover:bg-white/[0.06] hover:text-red-300"
                          title="Hapus"
                        >
                          <Trash2 size={13} strokeWidth={1.8} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Tax, shipping, notes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <FieldLabel htmlFor="tax">Pajak</FieldLabel>
              <Input
                id="tax"
                type="number"
                min={0}
                value={form.tax}
                onChange={(e) =>
                  setForm({ ...form, tax: Math.max(0, Number(e.target.value)) })
                }
              />
            </div>
            <div>
              <FieldLabel htmlFor="shipping">Ongkos Kirim</FieldLabel>
              <Input
                id="shipping"
                type="number"
                min={0}
                value={form.shipping}
                onChange={(e) =>
                  setForm({
                    ...form,
                    shipping: Math.max(0, Number(e.target.value)),
                  })
                }
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

          {/* Totals */}
          <div className="rounded-lg border border-white/[0.06] bg-[#1f1f1f] p-4 space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Subtotal</span>
              <span className="tabular-nums text-white/80">
                {fmtRupiah(formSubtotal)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Pajak</span>
              <span className="tabular-nums text-white/80">
                {fmtRupiah(form.tax)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Ongkos Kirim</span>
              <span className="tabular-nums text-white/80">
                {fmtRupiah(form.shipping)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-white/[0.04] pt-2 text-base font-semibold">
              <span className="text-white">Total</span>
              <span className="tabular-nums text-white">
                {fmtRupiah(formTotal)}
              </span>
            </div>
          </div>

          {/* Pembayaran */}
          <PaymentSection
            form={form}
            setForm={setForm}
            bankAccounts={bankAccounts}
            formTotal={formTotal}
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-6 py-4 flex-shrink-0">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Batal
          </Button>
          <Button onClick={onSave} disabled={pending || form.lines.length === 0}>
            {pending
              ? "Menyimpan…"
              : editing.mode === "new"
                ? "Simpan sebagai Draft"
                : "Simpan Perubahan"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ViewModal({
  po,
  onClose,
  canManage,
  canDelete,
  pending,
  onApprove,
  onCancel,
  onDelete,
}: {
  po: PoDetail;
  onClose: () => void;
  canManage: boolean;
  canDelete: boolean;
  pending: boolean;
  onApprove: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col rounded-xl border border-white/[0.08] bg-[#262626] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-white/[0.06] px-6 py-4 flex-shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="font-mono text-base font-semibold text-white">
                {po.po_number}
              </h2>
              <span
                className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-medium ${PO_STATUS_TONES[po.status]}`}
              >
                {PO_STATUS_LABELS[po.status]}
              </span>
            </div>
            <p className="mt-1 text-sm text-white/50">{po.supplier_name}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-white/50 hover:bg-white/[0.06] hover:text-white"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/40">
                <Calendar size={11} strokeWidth={2} />
                Tanggal Order
              </div>
              <div className="mt-1 text-white">{fmtDate(po.order_date)}</div>
            </div>
            {po.expected_date ? (
              <div>
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/40">
                  <Calendar size={11} strokeWidth={2} />
                  ETA Diterima
                </div>
                <div className="mt-1 text-white">
                  {fmtDate(po.expected_date)}
                </div>
              </div>
            ) : null}
          </div>

          {/* Lines */}
          <div className="rounded-lg border border-white/[0.06]">
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3 text-sm font-medium text-white">
              <Package size={14} strokeWidth={1.8} />
              Item ({po.lines.length})
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.04] text-left text-[11px] uppercase tracking-wider text-white/40">
                  <th className="px-3 py-2 font-medium">Produk</th>
                  <th className="px-3 py-2 text-center font-medium">Qty</th>
                  <th className="px-3 py-2 text-center font-medium">
                    Diterima
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Harga</th>
                  <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {po.lines.map((l) => (
                  <tr
                    key={l.id}
                    className="border-b border-white/[0.04] last:border-0"
                  >
                    <td className="px-3 py-2 text-white/80">{l.product_label}</td>
                    <td className="px-3 py-2 text-center text-white">
                      {l.ordered_qty}
                    </td>
                    <td className="px-3 py-2 text-center text-white/70">
                      {l.received_qty}
                      <span className="text-white/30">/{l.ordered_qty}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-white/70">
                      {fmtRupiah(l.unit_cost)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-white">
                      {fmtRupiah(l.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-[#1f1f1f] p-4 space-y-1.5">
            <Row label="Subtotal" value={fmtRupiah(po.subtotal)} />
            <Row label="Pajak" value={fmtRupiah(po.tax)} />
            <Row label="Ongkos Kirim" value={fmtRupiah(po.shipping)} />
            <div className="mt-2 flex items-center justify-between border-t border-white/[0.04] pt-2 text-base font-semibold">
              <span className="text-white">Total</span>
              <span className="tabular-nums text-white">
                {fmtRupiah(po.total)}
              </span>
            </div>
          </div>

          {po.notes ? (
            <div className="rounded-lg border border-white/[0.06] bg-[#1f1f1f] p-4">
              <div className="text-[11px] uppercase tracking-wider text-white/40">
                Catatan
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-white/80">
                {po.notes}
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            {canDelete && (po.status === "draft" || po.status === "cancelled") ? (
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
            (po.status === "draft" ||
              po.status === "approved" ||
              po.status === "receiving") ? (
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
            {canManage && po.status === "draft" ? (
              <Button onClick={onApprove} disabled={pending} className="gap-1.5">
                <CheckCircle2 size={14} strokeWidth={1.8} />
                Setujui PO
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

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "sky" | "amber" | "emerald";
}) {
  const t =
    tone === "sky"
      ? "text-sky-300"
      : tone === "amber"
        ? "text-amber-300"
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
      <ClipboardList
        size={32}
        strokeWidth={1.5}
        className="mx-auto mb-4 text-white/30"
      />
      <h3 className="text-base font-medium text-white">
        {hasFilter ? "Tidak ada PO yang cocok" : "Belum ada Purchase Order"}
      </h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-white/50">
        {hasFilter
          ? "Coba ubah filter pencarian."
          : "PO adalah dokumen pendahulu dari finance ke vendor. Setelah disetujui, gudang akan menerima barang dan otomatis tertaut."}
      </p>
      {!hasFilter && onCreate ? (
        <Button onClick={onCreate} className="mt-5 gap-2">
          <Plus size={16} strokeWidth={2} />
          PO Pertama
        </Button>
      ) : null}
    </div>
  );
}

function PaymentSection({
  form,
  setForm,
  bankAccounts,
  formTotal,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  bankAccounts: BankAccountRow[];
  formTotal: number;
}) {
  const computedDp =
    form.payment_type === "cash"
      ? formTotal
      : form.payment_type === "dp"
        ? form.dp_mode === "percent"
          ? Math.round((formTotal * form.dp_percent) / 100)
          : form.dp_amount
        : 0;

  const sisaCredit = Math.max(0, formTotal - computedDp);

  const activeBanks = bankAccounts.filter((b) => b.is_active);
  const defaultBank = activeBanks.find((b) => b.is_default);

  // Auto-pick default bank when switching to cash/dp mode and no bank selected yet
  function selectPayment(t: PoPaymentType) {
    setForm({
      ...form,
      payment_type: t,
      dp_bank_account_id:
        form.dp_bank_account_id || (t !== "credit" ? defaultBank?.id ?? "" : ""),
    });
  }

  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#1f1f1f] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-white">Pembayaran ke Vendor</h4>
          <p className="text-[11px] text-white/40 mt-0.5">
            Pilih cara bayar saat membuat PO. Saat barang diterima, sistem otomatis catat sesuai pilihan ini.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <PayOption
          active={form.payment_type === "credit"}
          onClick={() => selectPayment("credit")}
          title="Kredit"
          desc="Bayar nanti — bayar manual setelah faktur"
        />
        <PayOption
          active={form.payment_type === "cash"}
          onClick={() => selectPayment("cash")}
          title="Bayar Lunas"
          desc="Bayar penuh saat barang diterima"
        />
        <PayOption
          active={form.payment_type === "dp"}
          onClick={() => selectPayment("dp")}
          title="Uang Muka (DP)"
          desc="Bayar sebagian sekarang, sisanya kredit"
        />
      </div>

      {form.payment_type === "dp" ? (
        <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3 space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, dp_mode: "percent" })}
              className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                form.dp_mode === "percent"
                  ? "border-sky-500/40 bg-sky-500/10 text-sky-200"
                  : "border-white/[0.08] bg-transparent text-white/50 hover:text-white/80"
              }`}
            >
              Persentase (%)
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, dp_mode: "manual" })}
              className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                form.dp_mode === "manual"
                  ? "border-sky-500/40 bg-sky-500/10 text-sky-200"
                  : "border-white/[0.08] bg-transparent text-white/50 hover:text-white/80"
              }`}
            >
              Manual (Rp)
            </button>
          </div>

          {form.dp_mode === "percent" ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={5}
                  max={95}
                  step={5}
                  value={form.dp_percent}
                  onChange={(e) =>
                    setForm({ ...form, dp_percent: Number(e.target.value) })
                  }
                  className="flex-1 accent-sky-400"
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={form.dp_percent}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        dp_percent: Math.max(1, Math.min(99, Number(e.target.value))),
                      })
                    }
                    className="h-8 w-16 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 text-right text-sm tabular-nums text-white focus:border-white/20 focus:outline-none"
                  />
                  <span className="text-sm text-white/50">%</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[10, 25, 30, 50, 70, 80].map((p) => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => setForm({ ...form, dp_percent: p })}
                    className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                      form.dp_percent === p
                        ? "bg-sky-500/20 text-sky-200"
                        : "bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white/80"
                    }`}
                  >
                    {p}%
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <input
                type="number"
                min={0}
                value={form.dp_amount}
                onChange={(e) =>
                  setForm({ ...form, dp_amount: Math.max(0, Number(e.target.value)) })
                }
                placeholder="0"
                className="h-9 w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-3 text-right text-sm tabular-nums text-white placeholder-white/20 focus:border-white/20 focus:outline-none"
              />
            </div>
          )}
        </div>
      ) : null}

      {form.payment_type !== "credit" ? (
        <div>
          <FieldLabel htmlFor="dp_bank">Sumber Dana (Bank / Kas)</FieldLabel>
          <Select
            id="dp_bank"
            value={form.dp_bank_account_id}
            onChange={(e) =>
              setForm({ ...form, dp_bank_account_id: e.target.value })
            }
          >
            <option value="">— Pilih sumber dana —</option>
            {activeBanks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({fmtRupiah(Number(b.current_balance))})
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {form.payment_type !== "credit" && formTotal > 0 ? (
        <div className="rounded-md border border-white/[0.06] bg-[#262626] p-3 space-y-1 text-sm">
          <div className="flex items-center justify-between text-white/50">
            <span>{form.payment_type === "cash" ? "Bayar Lunas" : "Bayar DP"}</span>
            <span className="tabular-nums font-semibold text-emerald-300">
              {fmtRupiah(computedDp)}
              {form.payment_type === "dp" && formTotal > 0 ? (
                <span className="ml-1 text-[10px] text-white/40">
                  ({Math.round((computedDp / formTotal) * 100)}%)
                </span>
              ) : null}
            </span>
          </div>
          {form.payment_type === "dp" ? (
            <div className="flex items-center justify-between text-white/50">
              <span>Sisa (Kredit)</span>
              <span className="tabular-nums text-amber-300">{fmtRupiah(sisaCredit)}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PayOption({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
        active
          ? "border-sky-500/40 bg-sky-500/10"
          : "border-white/[0.08] bg-transparent hover:border-white/[0.15] hover:bg-white/[0.02]"
      }`}
    >
      <div
        className={`text-sm font-semibold ${active ? "text-sky-200" : "text-white/85"}`}
      >
        {title}
      </div>
      <div className="mt-0.5 text-[11px] leading-snug text-white/45">{desc}</div>
    </button>
  );
}
