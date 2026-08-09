"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
import { TransactionDeleteDialog } from "@/components/transaction-delete-dialog";
import { exportToExcel, exportToPDF } from "@/lib/export";
import { PO_STATUS_LABELS, PO_STATUS_TONES } from "@sneakervault/shared";
import type { PoStatus } from "@sneakervault/shared";
import { useToast } from "@/components/toast";
import { formatRupiah as fmtRupiah, formatDate as fmtDate } from "@/lib/format";
import {
  createPurchaseOrder,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  deletePurchaseOrder,
  updatePurchaseOrder,
  loadPoDetailAction,
} from "@/lib/actions/purchase-orders";
import type { TransactionDeleteResult } from "@/lib/actions/transaction-deletes";
import { createSupplier } from "@/lib/actions/suppliers";
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
  Receipt,
  FileSpreadsheet,
  Download,
} from "lucide-react";

type SupplierOpt = { id: string; name: string };

type FormLine = {
  product_id: string | null;
  product_label: string;
  ordered_qty: number;
  unit_cost: number;
  notes: string;
  // Manual new-product line (product_id null) — created on receive.
  new_brand?: string;
  new_model?: string;
  new_size?: number;
  new_size_label?: string;
  new_color?: string;
  new_sku?: string;
};

export type ManualLineInput = {
  brand: string;
  model: string;
  size: number;
  color: string;
  sku: string;
  unit_cost: number;
  ordered_qty: number;
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
  const [supplierOptions, setSupplierOptions] = useState<SupplierOpt[]>(suppliers);
  const [detailCache, setDetailCache] =
    useState<Record<string, PoDetail>>(detailById);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    referenceNumber: string;
    blocker: TransactionDeleteResult | null;
  } | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      setSupplierOptions(suppliers);
    });
  }, [suppliers]);

  useEffect(() => {
    setDetailCache(detailById);
  }, [detailById]);

  const canManage = roles.includes("owner") || roles.includes("finance");
  const canDelete = canManage;

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
    const taxRate =
      lineSubtotal > 0 && po.tax > 0
        ? Number(((po.tax / lineSubtotal) * 100).toFixed(2))
        : 0;
    setForm({
      supplier_id: po.supplier_id,
      order_date: po.order_date,
      expected_date: po.expected_date ?? "",
      tax: taxRate,
      shipping: po.shipping,
      notes: po.notes ?? "",
      lines: po.lines.map((l) => ({
        product_id: l.product_id,
        product_label: l.product_label,
        ordered_qty: l.ordered_qty,
        unit_cost: l.unit_cost,
        notes: l.notes ?? "",
        new_brand: l.new_brand ?? undefined,
        new_model: l.new_model ?? undefined,
        new_size: l.new_size ?? undefined,
        new_size_label: l.new_size_label ?? undefined,
        new_color: l.new_color ?? undefined,
        new_sku: l.new_sku ?? undefined,
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

  async function loadDetail(id: string): Promise<PoDetail | null> {
    const cached = detailCache[id];
    if (cached) return cached;

    setDetailLoadingId(id);
    try {
      const result = (await loadPoDetailAction(id)) as {
        data?: PoDetail;
        error?: string;
      };
      if (result.error || !result.data) {
        toast.push(result.error ?? "Detail Pembelian Barang tidak ditemukan", "error");
        return null;
      }
      setDetailCache((prev) => ({ ...prev, [id]: result.data! }));
      return result.data;
    } finally {
      setDetailLoadingId((current) => (current === id ? null : current));
    }
  }

  async function openViewById(id: string) {
    const detail = await loadDetail(id);
    if (detail) openView(detail);
  }

  async function openEditById(id: string) {
    const detail = await loadDetail(id);
    if (detail) openEdit(detail);
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

  function addManualLine(m: ManualLineInput) {
    setForm((f) => ({
      ...f,
      lines: [
        ...f.lines,
        {
          product_id: null,
          product_label: `${m.brand} ${m.model} ${m.color} • Size ${m.size} • ${m.sku} (baru)`,
          ordered_qty: m.ordered_qty,
          unit_cost: m.unit_cost,
          notes: "",
          new_brand: m.brand,
          new_model: m.model,
          new_size: m.size,
          new_size_label: String(m.size),
          new_color: m.color || undefined,
          new_sku: m.sku,
        },
      ],
    }));
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
  const formTaxAmount = Math.round((formSubtotal * form.tax) / 100);
  const formTotal = formSubtotal + formTaxAmount + form.shipping;

  function handleSave() {
    if (!editing || editing.mode === "view") return;
    if (form.lines.length === 0) {
      setFormError("Tambahkan minimal 1 item ke Pembelian Barang");
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
        setFormError(
          "DP tidak boleh melebihi atau sama dengan total Pembelian Barang. Pakai 'Bayar Lunas' jika ingin bayar penuh.",
        );
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
      tax: formTaxAmount,
      shipping: form.shipping,
      notes: form.notes || undefined,
      lines: form.lines.map((l) => ({
        product_id: l.product_id ?? undefined,
        ordered_qty: l.ordered_qty,
        unit_cost: l.unit_cost,
        notes: l.notes || undefined,
        new_brand: l.product_id ? undefined : l.new_brand,
        new_model: l.product_id ? undefined : l.new_model,
        new_size: l.product_id ? undefined : l.new_size,
        new_size_label: l.product_id ? undefined : l.new_size_label,
        new_color: l.product_id ? undefined : l.new_color,
        new_sku: l.product_id ? undefined : l.new_sku,
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
        editing.mode === "new"
          ? "Pembelian Barang berhasil dibuat"
          : "Pembelian Barang diperbarui",
        "success",
      );
      close();
      router.refresh();
    });
  }

  function handleApprove(id: string) {
    if (
      !confirm(
        "Setujui Pembelian Barang ini? Setelah disetujui, transaksi tidak bisa diedit.",
      )
    )
      return;
    startTransition(async () => {
      const r = await approvePurchaseOrder(id);
      if ("error" in r && r.error) {
        toast.push(typeof r.error === "string" ? r.error : "Gagal", "error");
        return;
      }
      toast.push(
        "Pembelian Barang disetujui; pembayaran tunai/DP sudah memotong kas/bank dan barang siap diterima",
        "success",
      );
      close();
      router.refresh();
    });
  }

  function handleCancel(id: string) {
    const reason = prompt(
      "Alasan supplier membatalkan Pembelian Barang? Alasan wajib diisi.",
    );
    if (reason === null) return;
    if (!reason.trim()) {
      toast.push("Alasan pembatalan supplier wajib diisi", "error");
      return;
    }
    startTransition(async () => {
      const r = await cancelPurchaseOrder(id, reason.trim());
      if ("error" in r && r.error) {
        toast.push(typeof r.error === "string" ? r.error : "Gagal", "error");
        return;
      }
      toast.push("Pembelian Barang dibatalkan oleh supplier", "success");
      close();
      router.refresh();
    });
  }

  function openDelete(id: string, referenceNumber: string) {
    setDeleteTarget({ id, referenceNumber, blocker: null });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      const r = await deletePurchaseOrder(target.id);
      if ("error" in r && r.error) {
        toast.push(typeof r.error === "string" ? r.error : "Gagal", "error");
        return;
      }
      if (r.data && !r.data.deleted) {
        setDeleteTarget({ ...target, blocker: r.data });
        return;
      }
      toast.push("Pembelian Barang dihapus", "success");
      setDeleteTarget(null);
      close();
      router.refresh();
    });
  }

  async function exportOrders(format: "pdf" | "excel") {
    const rows = filtered.map((order) => [
      order.po_number,
      order.supplier_name,
      fmtDate(order.order_date),
      order.expected_date ? fmtDate(order.expected_date) : "",
      order.line_count,
      order.total,
      PO_STATUS_LABELS[order.status],
    ]);
    const params = {
      title: "Daftar Pembelian Barang Supplier",
      sheetName: "Pembelian Barang",
      filename:
        format === "pdf"
          ? "purchase-order.pdf"
          : "purchase-order.xlsx",
      columns: [
        "No PO",
        "Vendor",
        "Tanggal",
        "ETA",
        "Items",
        "Total",
        "Status",
      ],
      rows,
      summary: [
        { label: "Total Pembelian Barang", value: String(filtered.length) },
        { label: "Outstanding", value: fmtRupiah(stats.open_value) },
      ],
    };
    if (format === "pdf") await exportToPDF(params);
    else await exportToExcel(params);
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
              Pembelian Barang
            </h1>
            <p className="text-sm text-white/50">
              Daftar pembelian dari finance ke vendor sebelum barang masuk
            </p>
          </div>
        </div>
        {canManage ? (
          <Button onClick={openNew} className="gap-2">
            <Plus size={16} strokeWidth={2} />
            Pembelian Barang Baru
          </Button>
        ) : null}
      </div>

      <QuickTip
        id="pembelian-po-intro-v3"
        title="Alur Pembelian Barang dari supplier"
        tone="info"
      >
        <strong>1. Buat Pembelian Barang</strong> → <strong>2. Setujui</strong> → <strong>3. Penerimaan Barang</strong> (stok dan HPP otomatis, lalu{" "}
        Untuk tunai/DP, faktur dan pembayaran dibuat saat <strong>Pembelian Barang disetujui</strong>.
        Untuk kredit, lanjut <strong>Terima Barang → Faktur Pembelian → Bayar Vendor</strong>.
        <br />
        <span className="mt-1 inline-block text-[12px] text-white/55">
          <strong>Pembelian Barang supplier berbeda dari Pre Order customer.</strong>{" "}
          Hapus salah input dari tahap terakhir: Pembayaran Vendor → Faktur Pembelian → Penerimaan Barang → Pembelian Barang.{" "}
          <strong>Batalkan Pembelian Barang</strong> hanya untuk supplier batal order sebelum ada penerimaan.
        </span>
      </QuickTip>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="Total Pembelian Barang" value={stats.total.toString()} />
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
        <Button type="button" variant="secondary" onClick={() => exportOrders("pdf")}>
          <Download size={14} />
          PDF
        </Button>
        <Button type="button" variant="secondary" onClick={() => exportOrders("excel")}>
          <FileSpreadsheet size={14} />
          Excel
        </Button>
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
                const detailLoading = detailLoadingId === o.id;
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
                        <button
                          onClick={() => void openViewById(o.id)}
                          disabled={detailLoading}
                          className="rounded p-1.5 text-white/50 hover:bg-white/[0.06] hover:text-white disabled:cursor-wait disabled:opacity-40"
                          title="Lihat detail"
                        >
                          <Eye size={14} strokeWidth={1.8} />
                        </button>
                        {canManage && o.status === "draft" ? (
                          <button
                            onClick={() => void openEditById(o.id)}
                            disabled={detailLoading}
                            className="rounded p-1.5 text-white/50 hover:bg-white/[0.06] hover:text-white disabled:cursor-wait disabled:opacity-40"
                            title="Edit"
                          >
                            <Pencil size={14} strokeWidth={1.8} />
                          </button>
                        ) : null}
                        {canManage && ["approved", "receiving"].includes(o.status) ? (
                          <button
                            onClick={() =>
                              router.push(`/pembelian/penerimaan?po=${o.id}`)
                            }
                            className="rounded p-1.5 text-sky-300/70 hover:bg-sky-500/10 hover:text-sky-200"
                            title="Lanjut ke penerimaan barang"
                          >
                            <Package size={14} strokeWidth={1.8} />
                          </button>
                        ) : null}
                        {canManage && ["receiving", "completed"].includes(o.status) ? (
                          <button
                            onClick={() =>
                              router.push(`/pembelian/faktur?po=${o.id}`)
                            }
                            className="rounded p-1.5 text-emerald-300/70 hover:bg-emerald-500/10 hover:text-emerald-200"
                            title="Lanjut ke faktur pembelian"
                          >
                            <Receipt size={14} strokeWidth={1.8} />
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button
                            onClick={() => openDelete(o.id, o.po_number)}
                            disabled={pending}
                            className="rounded p-1.5 text-white/40 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
                            title="Hapus Pembelian Barang"
                          >
                            <Trash2 size={14} strokeWidth={1.8} />
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
          suppliers={supplierOptions}
          products={products}
          bankAccounts={bankAccounts}
          formError={formError}
          fieldErrors={fieldErrors}
          formSubtotal={formSubtotal}
          formTaxAmount={formTaxAmount}
          formTotal={formTotal}
          pending={pending}
          onClose={close}
          onSave={handleSave}
          onAddLine={addLine}
          onAddManual={addManualLine}
          onRemoveLine={removeLine}
          onUpdateLine={updateLine}
          onSupplierCreated={(supplier) => {
            setSupplierOptions((prev) =>
              prev.some((item) => item.id === supplier.id)
                ? prev
                : [...prev, supplier].sort((a, b) => a.name.localeCompare(b.name)),
            );
            setForm((prev) => ({ ...prev, supplier_id: supplier.id }));
          }}
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
          onDelete={() => openDelete(editing.po.id, editing.po.po_number)}
        />
      ) : null}
      {deleteTarget ? (
        <TransactionDeleteDialog
          open
          title={`Hapus Pembelian Barang ${deleteTarget.referenceNumber}?`}
          description="Tindakan ini membuang dokumen Purchase Order supplier secara permanen."
          impacts={[
            "Pembayaran Vendor, Faktur Pembelian, dan Penerimaan Barang harus sudah dihapus dari tahap terakhir.",
            "Sistem tidak menghapus transaksi turunan secara otomatis.",
            "Pre Order customer tetap ada; hanya tautan pengadaannya yang dilepas.",
          ]}
          pending={pending}
          blocker={deleteTarget.blocker}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          onConfirm={confirmDelete}
          onOpenBlocker={() => {
            const href = deleteTarget.blocker?.blocker_href;
            if (!href) return;
            setDeleteTarget(null);
            close();
            router.push(href);
          }}
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
  formTaxAmount,
  formTotal,
  pending,
  onClose,
  onSave,
  onAddLine,
  onAddManual,
  onRemoveLine,
  onUpdateLine,
  onSupplierCreated,
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
  formTaxAmount: number;
  formTotal: number;
  pending: boolean;
  onClose: () => void;
  onSave: () => void;
  onAddLine: (p: ProductPickerRow) => void;
  onAddManual: (m: ManualLineInput) => void;
  onRemoveLine: (idx: number) => void;
  onUpdateLine: (idx: number, patch: Partial<FormLine>) => void;
  onSupplierCreated: (supplier: SupplierOpt) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerTab, setPickerTab] = useState<"existing" | "manual">("existing");
  const [manual, setManual] = useState({ brand: "", model: "", size: "", color: "", sku: "", unit_cost: "", qty: "1" });
  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: "", contact_person: "", phone: "" });
  const [supplierErrors, setSupplierErrors] = useState<Record<string, string>>({});
  const [supplierPending, startSupplierTransition] = useTransition();

  function submitSupplier() {
    setSupplierErrors({});
    startSupplierTransition(async () => {
      const result = (await createSupplier({
        name: supplierForm.name.trim(),
        contact_person: supplierForm.contact_person.trim() || undefined,
        phone: supplierForm.phone.trim() || undefined,
      })) as { error?: unknown; data?: { id: string; name: string } };
      if (result.error) {
        const errs: Record<string, string> = {};
        if (typeof result.error === "object") {
          for (const [key, value] of Object.entries(result.error)) {
            errs[key] = Array.isArray(value) ? value[0] ?? "" : String(value);
          }
        } else {
          errs._form = String(result.error);
        }
        setSupplierErrors(errs);
        return;
      }
      if (result.data) {
        const supplier = result.data;
        onSupplierCreated({ id: supplier.id, name: supplier.name });
        setSupplierForm({ name: "", contact_person: "", phone: "" });
        setSupplierFormOpen(false);
      }
    });
  }

  function submitManual() {
    const size = Number(manual.size);
    const qty = Math.max(1, Number(manual.qty) || 1);
    if (!manual.brand.trim() || !manual.model.trim() || !manual.sku.trim() || !manual.size) return;
    onAddManual({
      brand: manual.brand.trim(),
      model: manual.model.trim(),
      size,
      color: manual.color.trim(),
      sku: manual.sku.trim(),
      unit_cost: Number(manual.unit_cost) || 0,
      ordered_qty: qty,
    });
    setManual({ brand: "", model: "", size: "", color: "", sku: "", unit_cost: "", qty: "1" });
    setPickerTab("existing");
    setPickerOpen(false);
  }

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
              ? "Pembelian Barang Baru"
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
              {suppliers.length === 0 ? (
                <p className="mt-1.5 text-[11px] text-amber-300/80">
                  Belum ada vendor. Tambahkan langsung di sini atau lewat <span className="font-medium">Master Data → Supplier</span>.
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => setSupplierFormOpen((open) => !open)}
                className="mt-2 text-[12px] font-medium text-sky-300/85 hover:text-sky-200"
              >
                + Tambah vendor baru
              </button>
              {supplierFormOpen ? (
                <div className="mt-3 rounded-xl border border-white/[0.06] bg-[#1f1f1f] p-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Input
                      placeholder="Nama vendor *"
                      value={supplierForm.name}
                      onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                    />
                    <Input
                      placeholder="PIC"
                      value={supplierForm.contact_person}
                      onChange={(e) => setSupplierForm({ ...supplierForm, contact_person: e.target.value })}
                    />
                    <Input
                      placeholder="No. HP"
                      value={supplierForm.phone}
                      onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                    />
                  </div>
                  {supplierErrors._form || supplierErrors.name ? (
                    <p className="mt-2 text-[11px] text-red-300">
                      {supplierErrors.name || supplierErrors._form}
                    </p>
                  ) : null}
                  <div className="mt-3 flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSupplierFormOpen(false)}
                      disabled={supplierPending}
                    >
                      Batal
                    </Button>
                    <Button
                      size="sm"
                      onClick={submitSupplier}
                      disabled={supplierPending || !supplierForm.name.trim()}
                    >
                      {supplierPending ? "Menyimpan..." : "Simpan Vendor"}
                    </Button>
                  </div>
                </div>
              ) : null}
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
                <div className="flex gap-1 rounded-lg bg-[#262626] p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setPickerTab("existing")}
                    className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${pickerTab === "existing" ? "bg-white/[0.1] text-white" : "text-white/45 hover:text-white/70"}`}
                  >
                    Produk Ada
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickerTab("manual")}
                    className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${pickerTab === "manual" ? "bg-white/[0.1] text-white" : "text-white/45 hover:text-white/70"}`}
                  >
                    Tulis Manual (barang baru)
                  </button>
                </div>

                {pickerTab === "existing" ? (
                  <>
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
                          {products.length === 0
                            ? "Belum ada produk di sistem. Pakai tab “Tulis Manual” untuk pesan barang baru — produknya dibuat otomatis saat barang diterima."
                            : "Tidak ada produk cocok. Atau pakai “Tulis Manual”."}
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
                  </>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] leading-relaxed text-white/45">
                      Barang baru yang belum ada di sistem. Produk dibuat otomatis & masuk inventory saat <span className="text-white/70">barang diterima</span> (Penerimaan).
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Brand *" value={manual.brand} onChange={(e) => setManual({ ...manual, brand: e.target.value })} />
                      <Input placeholder="Model *" value={manual.model} onChange={(e) => setManual({ ...manual, model: e.target.value })} />
                      <Input placeholder="Size *" type="number" value={manual.size} onChange={(e) => setManual({ ...manual, size: e.target.value })} />
                      <Input placeholder="Warna (opsional)" value={manual.color} onChange={(e) => setManual({ ...manual, color: e.target.value })} />
                      <Input placeholder="SKU *" value={manual.sku} onChange={(e) => setManual({ ...manual, sku: e.target.value })} />
                      <NumberInput align="left" placeholder="Harga beli / unit" value={manual.unit_cost} onValueChange={(n) => setManual({ ...manual, unit_cost: String(n) })} />
                      <Input placeholder="Qty" type="number" value={manual.qty} onChange={(e) => setManual({ ...manual, qty: e.target.value })} />
                    </div>
                    <Button
                      onClick={submitManual}
                      disabled={!manual.brand.trim() || !manual.model.trim() || !manual.sku.trim() || !manual.size}
                      className="w-full gap-1.5"
                    >
                      <Plus size={14} strokeWidth={2} /> Tambah Item Baru
                    </Button>
                  </div>
                )}
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
                        <NumberInput
                          value={l.unit_cost}
                          onValueChange={(n) =>
                            onUpdateLine(idx, { unit_cost: Math.max(0, n) })
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
              <FieldLabel htmlFor="tax">Pajak (%)</FieldLabel>
              <NumberInput
                id="tax"
                min={0}
                value={form.tax}
                onValueChange={(value) =>
                  setForm({ ...form, tax: Math.max(0, value) })
                }
              />
              <p className="mt-1 text-[11px] text-white/40">
                Input 11 untuk PPN 11%
              </p>
            </div>
            <div>
              <FieldLabel htmlFor="shipping">Ongkos Kirim</FieldLabel>
              <NumberInput
                id="shipping"
                min={0}
                value={form.shipping}
                onValueChange={(value) =>
                  setForm({
                    ...form,
                    shipping: Math.max(0, value),
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
              <span className="text-white/50">Pajak ({form.tax || 0}%)</span>
              <span className="tabular-nums text-white/80">
                {fmtRupiah(formTaxAmount)}
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
            {canDelete ? (
              <button
                onClick={onDelete}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs text-white/60 hover:bg-red-500/10 hover:text-red-300"
              >
                <Trash2 size={13} strokeWidth={1.8} />
                Hapus Pembelian Barang
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Tutup
            </Button>
            {canManage &&
            (po.status === "draft" || po.status === "approved") ? (
              <Button
                variant="ghost"
                onClick={onCancel}
                disabled={pending}
                className="gap-1.5 text-red-300 hover:bg-red-500/10"
              >
                <XCircle size={14} strokeWidth={1.8} />
                Batalkan Pembelian (Supplier)
              </Button>
            ) : null}
            {canManage && po.status === "draft" ? (
              <Button onClick={onApprove} disabled={pending} className="gap-1.5">
                <CheckCircle2 size={14} strokeWidth={1.8} />
                Setujui Pembelian Barang
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
        {hasFilter
          ? "Tidak ada Pembelian Barang yang cocok"
          : "Belum ada Pembelian Barang"}
      </h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-white/50">
        {hasFilter
          ? "Coba ubah filter pencarian."
          : "Pembelian Barang adalah dokumen Purchase Order dari finance ke supplier. Setelah disetujui, gudang menerima barang dan transaksi tetap terhubung."}
      </p>
      {!hasFilter && onCreate ? (
        <Button onClick={onCreate} className="mt-5 gap-2">
          <Plus size={16} strokeWidth={2} />
          Pembelian Barang Pertama
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
            Pilih cara bayar saat membuat Pembelian Barang. Saat disetujui,
            sistem otomatis mencatat sesuai pilihan ini.
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
          desc="Bayar penuh saat Pembelian Barang disetujui"
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
              <NumberInput
                min={0}
                value={form.dp_amount}
                onValueChange={(value) =>
                  setForm({ ...form, dp_amount: Math.max(0, value) })
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
