"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  NumberInput,
  Select,
  FieldLabel,
  Alert,
} from "@sneakervault/ui";
import { QuickTip } from "@/components/ui/quick-tip";
import { TransactionDeleteDialog } from "@/components/transaction-delete-dialog";
import { formatRupiah as fmtRupiah, formatDate } from "@/lib/format";
import {
  CUSTOMER_CHANNELS,
  SALES_INVOICE_STATUS_LABELS,
  SALES_INVOICE_STATUS_TONES,
} from "@sneakervault/shared";
import type {
  CustomerChannel,
  SalesInvoiceStatus,
} from "@sneakervault/shared";
import { useToast } from "@/components/toast";
import {
  createSalesInvoice,
  updateSalesInvoice,
  issueSalesInvoice,
  deleteSalesInvoice,
  loadSalesInvoiceDetailAction,
} from "@/lib/actions/sales-invoices";
import type { TransactionDeleteResult } from "@/lib/actions/transaction-deletes";
import type {
  SalesInvoiceRow,
  SalesInvoiceDetail,
  SalesProductPickerRow,
  CustomerRow,
} from "@/lib/queries";
import {
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  X,
  FileText,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Send,
  Package,
  Wallet,
} from "lucide-react";

type FormLine = {
  product_id: string;
  product_label: string;
  qty: number;
  unit_price: number;
  available_qty: number;
  hpp: number;
  price_online: number;
  price_offline: number;
};

type FormState = {
  customer_id: string;
  customer_name: string;
  channel: CustomerChannel;
  invoice_date: string;
  due_date: string;
  discount: number;
  shipping: number;
  marketplace_fee: number;
  tax: number;
  marketplace_order_id: string;
  notes: string;
  lines: FormLine[];
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm = (): FormState => ({
  customer_id: "",
  customer_name: "",
  channel: "wa",
  invoice_date: todayIso(),
  due_date: "",
  discount: 0,
  shipping: 0,
  marketplace_fee: 0,
  tax: 0,
  marketplace_order_id: "",
  notes: "",
  lines: [],
});

function fmtDate(iso: string | null): string {
  return iso ? formatDate(iso) : "—";
}

const channelLabel = (c: CustomerChannel): string =>
  CUSTOMER_CHANNELS.find((x) => x.value === c)?.label ?? c;

const channelTone: Record<CustomerChannel, string> = {
  wa: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  shopee: "bg-orange-500/15 text-orange-300 border-orange-500/20",
  tiktok: "bg-pink-500/15 text-pink-300 border-pink-500/20",
  tokopedia: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  offline: "bg-sky-500/15 text-sky-300 border-sky-500/20",
  website: "bg-violet-500/15 text-violet-300 border-violet-500/20",
  mixed: "bg-white/10 text-white/70 border-white/15",
};

function marketplaceOrderMeta(notes: string | null) {
  const raw = notes ?? "";
  const lower = raw.toLowerCase();
  const isPreorder =
    /jenis\s+po marketplace|pre[-\s]?order|preorder|\bpo marketplace\b/.test(lower);
  const status = raw.match(/Status Marketplace:\s*([^•]+)/i)?.[1]?.trim();
  return {
    kind: isPreorder ? "Pre Order Marketplace" : "Order Langsung",
    tone: isPreorder
      ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
      : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    status,
  };
}

// Online channels use sell_price (price_online); offline use price_offline
function priceForChannel(
  channel: CustomerChannel,
  online: number,
  offline: number,
): number {
  if (channel === "wa" || channel === "offline" || channel === "website")
    return offline > 0 ? offline : online;
  return online;
}

export function SalesInvoiceClient({
  invoices,
  customers,
  products,
  detailById,
  roles,
}: {
  invoices: SalesInvoiceRow[];
  customers: CustomerRow[];
  products: SalesProductPickerRow[];
  detailById: Record<string, SalesInvoiceDetail>;
  roles: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<
    | { mode: "new" }
    | { mode: "edit"; inv: SalesInvoiceDetail }
    | { mode: "view"; inv: SalesInvoiceDetail }
    | null
  >(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    SalesInvoiceStatus | "all"
  >("all");
  const [channelFilter, setChannelFilter] = useState<CustomerChannel | "all">(
    "all",
  );
  const [detailCache, setDetailCache] =
    useState<Record<string, SalesInvoiceDetail>>(detailById);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    referenceNumber: string;
    blocker: TransactionDeleteResult | null;
  } | null>(null);

  useEffect(() => {
    setDetailCache(detailById);
  }, [detailById]);

  const canManage =
    roles.includes("owner") ||
    roles.includes("finance") ||
    roles.includes("admin_online");
  const canDelete = roles.includes("owner") || roles.includes("finance");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (channelFilter !== "all" && i.channel !== channelFilter) return false;
      if (!q) return true;
      return (
        i.invoice_number.toLowerCase().includes(q) ||
        i.customer_name.toLowerCase().includes(q) ||
        (i.marketplace_order_id ?? "").toLowerCase().includes(q)
      );
    });
  }, [invoices, search, statusFilter, channelFilter]);

  const stats = useMemo(() => {
    const s = {
      total: invoices.length,
      issued: 0,
      paid: 0,
      outstanding: 0,
      this_month_revenue: 0,
    };
    const today = new Date();
    for (const i of invoices) {
      if (i.status === "cancelled" || i.status === "draft") continue;
      if (i.status === "issued") s.issued++;
      if (i.status === "paid") s.paid++;
      if (i.status === "issued" || i.status === "partial") {
        s.outstanding += i.total - i.paid_amount;
      }
      const d = new Date(i.invoice_date);
      if (
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth()
      ) {
        s.this_month_revenue += i.total;
      }
    }
    return s;
  }, [invoices]);

  function openNew() {
    setEditing({ mode: "new" });
    setForm(emptyForm());
    setFormError(null);
  }

  function openEdit(inv: SalesInvoiceDetail) {
    setEditing({ mode: "edit", inv });
    setForm({
      customer_id: inv.customer_id ?? "",
      customer_name: inv.customer_name,
      channel: inv.channel,
      invoice_date: inv.invoice_date,
      due_date: inv.due_date ?? "",
      discount: inv.discount,
      shipping: inv.shipping,
      marketplace_fee: inv.marketplace_fee,
      tax: inv.tax,
      marketplace_order_id: inv.marketplace_order_id ?? "",
      notes: inv.notes ?? "",
      lines: inv.lines.map((l) => {
        const prod = products.find((p) => p.id === l.product_id);
        return {
          product_id: l.product_id ?? "",
          product_label: l.product_label,
          qty: l.qty,
          unit_price: l.unit_price,
          available_qty: prod?.quantity ?? 0,
          hpp: l.unit_cost,
          price_online: prod?.sell_price ?? l.unit_price,
          price_offline: prod?.price_offline ?? l.unit_price,
        };
      }),
    });
    setFormError(null);
  }

  function openView(inv: SalesInvoiceDetail) {
    setEditing({ mode: "view", inv });
  }

  async function loadDetail(id: string): Promise<SalesInvoiceDetail | null> {
    const cached = detailCache[id];
    if (cached) return cached;

    setDetailLoadingId(id);
    try {
      const result = (await loadSalesInvoiceDetailAction(id)) as {
        data?: SalesInvoiceDetail;
        error?: string;
      };
      if (result.error || !result.data) {
        toast.push(result.error ?? "Detail invoice tidak ditemukan", "error");
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

  function pickCustomer(id: string) {
    if (!id) {
      setForm({ ...form, customer_id: "" });
      return;
    }
    const c = customers.find((x) => x.id === id);
    if (!c) return;
    setForm({
      ...form,
      customer_id: id,
      customer_name: c.name,
      channel: c.channel,
      // Re-price lines based on new channel
      lines: form.lines.map((l) => ({
        ...l,
        unit_price: priceForChannel(c.channel, l.price_online, l.price_offline),
      })),
    });
  }

  function changeChannel(ch: CustomerChannel) {
    setForm({
      ...form,
      channel: ch,
      lines: form.lines.map((l) => ({
        ...l,
        unit_price: priceForChannel(ch, l.price_online, l.price_offline),
      })),
    });
  }

  function addLine(product: SalesProductPickerRow) {
    const existing = form.lines.find((l) => l.product_id === product.id);
    if (existing) {
      setForm({
        ...form,
        lines: form.lines.map((l) =>
          l.product_id === product.id ? { ...l, qty: l.qty + 1 } : l,
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
          qty: 1,
          unit_price: priceForChannel(
            form.channel,
            product.sell_price,
            product.price_offline,
          ),
          available_qty: product.quantity,
          hpp: product.hpp,
          price_online: product.sell_price,
          price_offline: product.price_offline,
        },
      ],
    });
  }

  function updateLine(idx: number, patch: Partial<FormLine>) {
    setForm({
      ...form,
      lines: form.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    });
  }

  function removeLine(idx: number) {
    setForm({ ...form, lines: form.lines.filter((_, i) => i !== idx) });
  }

  const formSubtotal = form.lines.reduce(
    (acc, l) => acc + l.qty * l.unit_price,
    0,
  );
  const formTotal = Math.max(
    0,
    formSubtotal -
      form.discount +
      form.shipping +
      form.marketplace_fee +
      form.tax,
  );

  function buildPayload() {
    return {
      customer_id: form.customer_id || null,
      customer_name: form.customer_name,
      channel: form.channel,
      invoice_date: form.invoice_date,
      due_date: form.due_date || null,
      discount: form.discount,
      shipping: form.shipping,
      marketplace_fee: form.marketplace_fee,
      tax: form.tax,
      marketplace_order_id: form.marketplace_order_id || undefined,
      notes: form.notes || undefined,
      lines: form.lines.map((l) => ({
        product_id: l.product_id,
        qty: l.qty,
        unit_price: l.unit_price,
      })),
    };
  }

  function handleSave(issue: boolean) {
    if (!editing || editing.mode === "view") return;
    if (form.lines.length === 0) {
      setFormError("Tambahkan minimal 1 item");
      return;
    }
    if (!form.customer_name.trim()) {
      setFormError("Nama customer wajib diisi");
      return;
    }
    // Stock check (UI guard)
    if (issue) {
      const insufficient = form.lines.find((l) => l.qty > l.available_qty);
      if (insufficient) {
        setFormError(
          `Stok tidak cukup untuk ${insufficient.product_label} (tersedia ${insufficient.available_qty})`,
        );
        return;
      }
    }
    setFormError(null);
    const payload = buildPayload();
    startTransition(async () => {
      const result =
        editing.mode === "new"
          ? ((await createSalesInvoice(payload, { issue })) as {
              error?: unknown;
              data?: unknown;
            })
          : ((await updateSalesInvoice(editing.inv.id, payload)) as {
              error?: unknown;
              success?: boolean;
            });
      if (result.error) {
        const e = result.error as { _form?: string[] };
        setFormError(e._form?.[0] ?? "Gagal menyimpan");
        return;
      }
      toast.push(
        editing.mode === "new"
          ? issue
            ? "Invoice terbit & stok ter-update"
            : "Invoice draft tersimpan"
          : "Invoice diperbarui",
        "success",
      );
      close();
      router.refresh();
    });
  }

  function handleIssue(id: string) {
    if (!confirm("Terbitkan invoice? Stok akan otomatis berkurang.")) return;
    startTransition(async () => {
      const r = await issueSalesInvoice(id);
      if ("error" in r && r.error) {
        toast.push(typeof r.error === "string" ? r.error : "Gagal", "error");
        return;
      }
      toast.push("Invoice diterbitkan, stok ter-update", "success");
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
      const r = await deleteSalesInvoice(target.id);
      if ("error" in r && r.error) {
        toast.push(typeof r.error === "string" ? r.error : "Gagal", "error");
        return;
      }
      if (r.data && !r.data.deleted) {
        setDeleteTarget({ ...target, blocker: r.data });
        return;
      }
      toast.push("Invoice Penjualan dihapus", "success");
      setDeleteTarget(null);
      close();
      router.refresh();
    });
  }

  function openReceivePayment(invoiceId: string) {
    router.push(`/penjualan/penerimaan-kas?invoice=${invoiceId}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] text-white/80">
            <FileText size={20} strokeWidth={1.7} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Invoice Penjualan
            </h1>
            <p className="text-sm text-white/50">
              Faktur penjualan ke customer — sumber Account Receivable
            </p>
          </div>
        </div>
        {canManage ? (
          <Button onClick={openNew} className="gap-2">
            <Plus size={16} strokeWidth={2} />
            Invoice Baru
          </Button>
        ) : null}
      </div>

      <QuickTip
        id="penjualan-invoice-intro"
        title="Alur Penjualan singkat"
        tone="info"
      >
        <strong>Draft</strong> → <strong>Terbitkan</strong> (stok turun + jurnal Dr Piutang/Cr Pendapatan + Dr HPP/Cr Persediaan dibuat otomatis) → <strong>Penerimaan Kas</strong> (bayar piutang).
        Harga otomatis terisi sesuai kanal: <em>Online (Shopee/TikTok)</em> pakai harga online, <em>Offline (WA/Toko)</em> pakai harga offline. Jenis pesanan marketplace dibaca dari kolom status/type export. Biaya admin final dibukukan dari settlement.
        Untuk koreksi salah input, hapus Penerimaan Customer lebih dulu, lalu hapus Invoice Penjualan.
      </QuickTip>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="Total Invoice" value={stats.total.toString()} />
        <StatTile
          label="Terbit (Belum Lunas)"
          value={stats.issued.toString()}
          tone="amber"
        />
        <StatTile
          label="Lunas"
          value={stats.paid.toString()}
          tone="emerald"
        />
        <StatTile
          label="Piutang Outstanding"
          value={fmtRupiah(stats.outstanding)}
          tone={stats.outstanding > 0 ? "amber" : undefined}
        />
        <StatTile
          label="Omset Bulan Ini"
          value={fmtRupiah(stats.this_month_revenue)}
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
            placeholder="Cari nomor invoice, customer, order marketplace…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as SalesInvoiceStatus | "all")
          }
          className="min-w-[140px]"
        >
          <option value="all">Semua status</option>
          {(Object.keys(SALES_INVOICE_STATUS_LABELS) as SalesInvoiceStatus[]).map(
            (s) => (
              <option key={s} value={s}>
                {SALES_INVOICE_STATUS_LABELS[s]}
              </option>
            ),
          )}
        </Select>
        <Select
          value={channelFilter}
          onChange={(e) =>
            setChannelFilter(e.target.value as CustomerChannel | "all")
          }
          className="min-w-[140px]"
        >
          <option value="all">Semua channel</option>
          {CUSTOMER_CHANNELS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          hasFilter={
            search.length > 0 ||
            statusFilter !== "all" ||
            channelFilter !== "all"
          }
          onCreate={canManage ? openNew : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-[#262626]">
          <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-white/40">
                <th className="px-4 py-3 font-medium">No Invoice</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Order Marketplace</th>
                <th className="px-4 py-3 font-medium">Channel</th>
                <th className="px-4 py-3 font-medium">Tanggal</th>
                <th className="px-4 py-3 text-center font-medium">Items</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-right font-medium">Sisa</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const remaining = i.total - i.paid_amount;
                const detailLoading = detailLoadingId === i.id;
                const orderMeta = marketplaceOrderMeta(i.notes);
                return (
                  <tr
                    key={i.id}
                    className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-white/80">
                      {i.invoice_number}
                    </td>
                    <td className="px-4 py-3 text-white/90">
                      {i.customer_name}
                    </td>
                    <td className="px-4 py-3">
                      {i.marketplace_order_id ? (
                        <div className="space-y-1">
                          <div className="font-mono text-[11px] text-white/75">
                            {i.marketplace_order_id}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium ${orderMeta.tone}`}>
                              {orderMeta.kind}
                            </span>
                            {orderMeta.status ? (
                              <span className="max-w-[220px] truncate text-[10px] text-white/35" title={orderMeta.status}>
                                {orderMeta.status}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <span className="text-white/25">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-medium ${channelTone[i.channel]}`}
                      >
                        {channelLabel(i.channel)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      {fmtDate(i.invoice_date)}
                    </td>
                    <td className="px-4 py-3 text-center text-white/70">
                      {i.line_count}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-white">
                      {fmtRupiah(i.total)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {i.status === "paid" ||
                      i.status === "cancelled" ||
                      i.status === "draft" ? (
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
                        className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-medium ${SALES_INVOICE_STATUS_TONES[i.status]}`}
                      >
                        {SALES_INVOICE_STATUS_LABELS[i.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => void openViewById(i.id)}
                          disabled={detailLoading}
                          className="rounded p-1.5 text-white/50 hover:bg-white/[0.06] hover:text-white disabled:cursor-wait disabled:opacity-40"
                          title="Detail"
                        >
                          <Eye size={14} strokeWidth={1.8} />
                        </button>
                        {canManage &&
                        (i.status === "issued" || i.status === "partial") &&
                        remaining > 0 ? (
                          <button
                            onClick={() => openReceivePayment(i.id)}
                            disabled={detailLoading}
                            className="rounded p-1.5 text-white/50 hover:bg-emerald-500/10 hover:text-emerald-300 disabled:cursor-wait disabled:opacity-40"
                            title="Terima pembayaran"
                          >
                            <Wallet size={14} strokeWidth={1.8} />
                          </button>
                        ) : null}
                        {canManage && i.status === "draft" ? (
                          <button
                            onClick={() => void openEditById(i.id)}
                            disabled={detailLoading}
                            className="rounded p-1.5 text-white/50 hover:bg-white/[0.06] hover:text-white disabled:cursor-wait disabled:opacity-40"
                            title="Edit"
                          >
                            <Pencil size={14} strokeWidth={1.8} />
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button
                            onClick={() => openDelete(i.id, i.invoice_number)}
                            disabled={pending}
                            className="rounded p-1.5 text-white/40 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
                            title="Hapus Invoice Penjualan"
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
        </div>
      )}

      {editing && editing.mode !== "view" ? (
        <FormModal
          editing={editing}
          form={form}
          setForm={setForm}
          customers={customers}
          products={products}
          formError={formError}
          formSubtotal={formSubtotal}
          formTotal={formTotal}
          pending={pending}
          onClose={close}
          onSaveDraft={() => handleSave(false)}
          onSaveAndIssue={() => handleSave(true)}
          onPickCustomer={pickCustomer}
          onChangeChannel={changeChannel}
          onAddLine={addLine}
          onUpdateLine={updateLine}
          onRemoveLine={removeLine}
        />
      ) : null}
      {editing && editing.mode === "view" ? (
        <ViewModal
          inv={editing.inv}
          onClose={close}
          canManage={canManage}
          canDelete={canDelete}
          pending={pending}
          onIssue={() => handleIssue(editing.inv.id)}
          onDelete={() =>
            openDelete(editing.inv.id, editing.inv.invoice_number)
          }
          onReceivePayment={() => openReceivePayment(editing.inv.id)}
        />
      ) : null}
      {deleteTarget ? (
        <TransactionDeleteDialog
          open
          title={`Hapus Invoice Penjualan ${deleteTarget.referenceNumber}?`}
          description="Invoice accounting ini akan dibuang permanen, bukan dibatalkan atau dibuatkan reversal."
          impacts={[
            "Penerimaan Customer yang masih teralokasi harus dihapus lebih dulu.",
            "Untuk invoice issued, stok dikembalikan dan mutasi serta jurnal penjualan dihapus.",
            "Invoice POS, marketplace, packing, retur, dan settlement tetap dilindungi dan tidak dapat dihapus dari flow ini.",
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
  customers,
  products,
  formError,
  formSubtotal,
  formTotal,
  pending,
  onClose,
  onSaveDraft,
  onSaveAndIssue,
  onPickCustomer,
  onChangeChannel,
  onAddLine,
  onUpdateLine,
  onRemoveLine,
}: {
  editing: { mode: "new" } | { mode: "edit"; inv: SalesInvoiceDetail };
  form: FormState;
  setForm: (f: FormState) => void;
  customers: CustomerRow[];
  products: SalesProductPickerRow[];
  formError: string | null;
  formSubtotal: number;
  formTotal: number;
  pending: boolean;
  onClose: () => void;
  onSaveDraft: () => void;
  onSaveAndIssue: () => void;
  onPickCustomer: (id: string) => void;
  onChangeChannel: (ch: CustomerChannel) => void;
  onAddLine: (p: SalesProductPickerRow) => void;
  onUpdateLine: (idx: number, patch: Partial<FormLine>) => void;
  onRemoveLine: (idx: number) => void;
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

  const isOnline = form.channel === "shopee" || form.channel === "tiktok" || form.channel === "tokopedia";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#262626] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <h2 className="text-base font-semibold text-white">
            {editing.mode === "new"
              ? "Invoice Penjualan Baru"
              : `Edit ${editing.inv.invoice_number}`}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-white/50 hover:bg-white/[0.06] hover:text-white"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {formError ? <Alert tone="error">{formError}</Alert> : null}

          {/* Customer + channel */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="customer_id">
                Customer (pilih dari daftar)
              </FieldLabel>
              <Select
                id="customer_id"
                value={form.customer_id}
                onChange={(e) => onPickCustomer(e.target.value)}
              >
                <option value="">— Walk-in / Manual —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({channelLabel(c.channel)})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="customer_name">Nama di Invoice *</FieldLabel>
              <Input
                id="customer_name"
                value={form.customer_name}
                onChange={(e) =>
                  setForm({ ...form, customer_name: e.target.value })
                }
                placeholder="cth: Budi Hartanto"
              />
              <p className="mt-1 text-[11px] text-white/40">
                Nama manual otomatis disimpan ke Master Data Customer saat invoice disimpan.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <FieldLabel htmlFor="channel">Channel *</FieldLabel>
              <Select
                id="channel"
                value={form.channel}
                onChange={(e) =>
                  onChangeChannel(e.target.value as CustomerChannel)
                }
              >
                {CUSTOMER_CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-[11px] text-white/40">
                {isOnline ? "Pakai harga online" : "Pakai harga offline"}
              </p>
            </div>
            <div>
              <FieldLabel htmlFor="invoice_date">Tanggal *</FieldLabel>
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
            </div>
          </div>

          {isOnline ? (
            <div>
              <FieldLabel htmlFor="marketplace_order_id">
                ID Order Marketplace
              </FieldLabel>
              <Input
                id="marketplace_order_id"
                value={form.marketplace_order_id}
                onChange={(e) =>
                  setForm({
                    ...form,
                    marketplace_order_id: e.target.value,
                  })
                }
                placeholder="cth: 2403200000ABCDEF"
              />
            </div>
          ) : null}

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
              <div className="space-y-2 border-b border-white/[0.06] bg-[#1f1f1f] p-3">
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
                    filteredProducts.map((p) => {
                      const outOfStock = p.quantity <= 0;
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            if (!outOfStock) onAddLine(p);
                            setPickerSearch("");
                          }}
                          disabled={outOfStock}
                          className={`flex w-full items-center justify-between border-b border-white/[0.04] px-3 py-2 text-left text-sm last:border-0 ${outOfStock ? "opacity-40" : "hover:bg-white/[0.04]"}`}
                        >
                          <div>
                            <div className="text-white">
                              {p.brand} {p.model}{" "}
                              <span className="text-white/50">
                                · {p.color} · Size {p.size}
                              </span>
                            </div>
                            <div className="text-[11px] text-white/40">
                              SKU {p.sku} · Stok{" "}
                              <span
                                className={
                                  outOfStock
                                    ? "text-red-300"
                                    : p.quantity <= 2
                                      ? "text-amber-300"
                                      : ""
                                }
                              >
                                {p.quantity}
                              </span>{" "}
                              · Online {fmtRupiah(p.sell_price)} · Offline{" "}
                              {fmtRupiah(p.price_offline)}
                            </div>
                          </div>
                          {outOfStock ? (
                            <span className="text-[10px] text-red-300">
                              Habis
                            </span>
                          ) : (
                            <Plus
                              size={14}
                              strokeWidth={2}
                              className="text-white/40"
                            />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}

            {form.lines.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-white/40">
                Belum ada item. Klik "Tambah Item".
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.04] text-left text-[11px] uppercase tracking-wider text-white/40">
                    <th className="px-3 py-2 font-medium">Produk</th>
                    <th className="px-3 py-2 font-medium" style={{ width: "80px" }}>
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
                  {form.lines.map((l, idx) => {
                    const overStock = l.qty > l.available_qty;
                    return (
                      <tr
                        key={`${l.product_id}-${idx}`}
                        className="border-b border-white/[0.04] last:border-0"
                      >
                        <td className="px-3 py-2 text-white/80">
                          {l.product_label}
                          <div className="text-[11px] text-white/40">
                            Stok tersedia:{" "}
                            <span
                              className={
                                overStock ? "text-red-300" : "text-white/60"
                              }
                            >
                              {l.available_qty}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={1}
                            value={l.qty}
                            onChange={(e) =>
                              onUpdateLine(idx, {
                                qty: Math.max(1, Number(e.target.value)),
                              })
                            }
                            className={`h-8 px-2 ${overStock ? "ring-1 ring-red-500/40" : ""}`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <NumberInput
                            min={0}
                            value={l.unit_price}
                            onValueChange={(value) =>
                              onUpdateLine(idx, {
                                unit_price: Math.max(0, value),
                              })
                            }
                            className="h-8 px-2"
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-white">
                          {fmtRupiah(l.qty * l.unit_price)}
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
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Adjustments */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>
              <FieldLabel htmlFor="discount">Diskon</FieldLabel>
              <NumberInput
                id="discount"
                min={0}
                value={form.discount}
                onValueChange={(value) =>
                  setForm({
                    ...form,
                    discount: Math.max(0, value),
                  })
                }
              />
            </div>
            <div>
              <FieldLabel htmlFor="shipping">Ongkir</FieldLabel>
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
              <FieldLabel htmlFor="marketplace_fee">Fee Marketplace</FieldLabel>
              <NumberInput
                id="marketplace_fee"
                min={0}
                value={form.marketplace_fee}
                onValueChange={(value) =>
                  setForm({
                    ...form,
                    marketplace_fee: Math.max(0, value),
                  })
                }
              />
              {isOnline ? (
                <p className="mt-1 text-[11px] leading-relaxed text-white/40">
                  Opsional di invoice. Fee aktual marketplace akan dikunci dari settlement saat dana cair.
                </p>
              ) : null}
            </div>
            <div>
              <FieldLabel htmlFor="tax">Pajak</FieldLabel>
              <NumberInput
                id="tax"
                min={0}
                value={form.tax}
                onValueChange={(value) =>
                  setForm({
                    ...form,
                    tax: Math.max(0, value),
                  })
                }
              />
            </div>
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

          {/* Totals */}
          <div className="space-y-1.5 rounded-lg border border-white/[0.06] bg-[#1f1f1f] p-4">
            <Row label="Subtotal" value={fmtRupiah(formSubtotal)} />
            {form.discount > 0 ? (
              <Row
                label="Diskon"
                value={`- ${fmtRupiah(form.discount)}`}
                tone="amber"
              />
            ) : null}
            {form.shipping > 0 ? (
              <Row label="Ongkir" value={fmtRupiah(form.shipping)} />
            ) : null}
            {form.marketplace_fee > 0 ? (
              <Row
                label="Fee Marketplace"
                value={fmtRupiah(form.marketplace_fee)}
              />
            ) : null}
            {form.tax > 0 ? <Row label="Pajak" value={fmtRupiah(form.tax)} /> : null}
            <div className="mt-2 flex items-center justify-between border-t border-white/[0.04] pt-2 text-base font-semibold">
              <span className="text-white">Total</span>
              <span className="tabular-nums text-white">{fmtRupiah(formTotal)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center justify-between gap-2 border-t border-white/[0.06] px-6 py-4">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Batal
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={onSaveDraft}
              disabled={pending || form.lines.length === 0}
            >
              {pending ? "Menyimpan…" : "Simpan Draft"}
            </Button>
            {editing.mode === "new" ? (
              <Button
                onClick={onSaveAndIssue}
                disabled={pending || form.lines.length === 0}
                className="gap-1.5"
              >
                <Send size={14} strokeWidth={2} />
                Simpan & Terbitkan
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewModal({
  inv,
  onClose,
  canManage,
  canDelete,
  pending,
  onIssue,
  onDelete,
  onReceivePayment,
}: {
  inv: SalesInvoiceDetail;
  onClose: () => void;
  canManage: boolean;
  canDelete: boolean;
  pending: boolean;
  onIssue: () => void;
  onDelete: () => void;
  onReceivePayment: () => void;
}) {
  const remaining = inv.total - inv.paid_amount;
  const canReceivePayment =
    canManage &&
    remaining > 0 &&
    (inv.status === "issued" || inv.status === "partial");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#262626] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-start justify-between border-b border-white/[0.06] px-6 py-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="font-mono text-base font-semibold text-white">
                {inv.invoice_number}
              </h2>
              <span
                className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-medium ${SALES_INVOICE_STATUS_TONES[inv.status]}`}
              >
                {SALES_INVOICE_STATUS_LABELS[inv.status]}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm text-white/60">
              <span>{inv.customer_name}</span>
              <span className="text-white/30">·</span>
              <span
                className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium ${channelTone[inv.channel]}`}
              >
                {channelLabel(inv.channel)}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-white/50 hover:bg-white/[0.06] hover:text-white"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {inv.status === "draft" ? (
            <Alert tone="warning">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} strokeWidth={1.8} className="mt-0.5" />
                <span>
                  Invoice masih Draft. Stok belum berkurang. Klik "Terbitkan"
                  untuk konfirmasi penjualan.
                </span>
              </div>
            </Alert>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <Meta
              icon={<Calendar size={11} strokeWidth={2} />}
              label="Tanggal"
              value={fmtDate(inv.invoice_date)}
            />
            {inv.due_date ? (
              <Meta
                icon={<Calendar size={11} strokeWidth={2} />}
                label="Jatuh Tempo"
                value={fmtDate(inv.due_date)}
              />
            ) : null}
            {inv.marketplace_order_id ? (
              <Meta
                icon={<FileText size={11} strokeWidth={2} />}
                label="Order Marketplace"
                value={inv.marketplace_order_id}
                mono
              />
            ) : null}
            {inv.marketplace_order_id ? (
              <Meta
                icon={<FileText size={11} strokeWidth={2} />}
                label="Jenis Pesanan"
                value={marketplaceOrderMeta(inv.notes).kind}
              />
            ) : null}
          </div>

          <div className="rounded-lg border border-white/[0.06]">
            <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#1f1f1f] px-4 py-2 text-sm font-medium text-white">
              <Package size={14} strokeWidth={1.8} />
              Item ({inv.lines.length})
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.04] text-left text-[11px] uppercase tracking-wider text-white/40">
                  <th className="px-3 py-2 font-medium">Produk</th>
                  <th className="px-3 py-2 text-center font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Harga</th>
                  <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {inv.lines.map((l) => (
                  <tr
                    key={l.id}
                    className="border-b border-white/[0.04] last:border-0"
                  >
                    <td className="px-3 py-2 text-white/80">{l.product_label}</td>
                    <td className="px-3 py-2 text-center text-white">{l.qty}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-white/70">
                      {fmtRupiah(l.unit_price)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-white">
                      {fmtRupiah(l.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-1.5 rounded-lg border border-white/[0.06] bg-[#1f1f1f] p-4">
            <Row label="Subtotal" value={fmtRupiah(inv.subtotal)} />
            {inv.discount > 0 ? (
              <Row
                label="Diskon"
                value={`- ${fmtRupiah(inv.discount)}`}
                tone="amber"
              />
            ) : null}
            {inv.shipping > 0 ? (
              <Row label="Ongkir" value={fmtRupiah(inv.shipping)} />
            ) : null}
            {inv.marketplace_fee > 0 ? (
              <Row label="Fee Marketplace" value={fmtRupiah(inv.marketplace_fee)} />
            ) : null}
            {inv.tax > 0 ? <Row label="Pajak" value={fmtRupiah(inv.tax)} /> : null}
            <div className="mt-2 flex items-center justify-between border-t border-white/[0.04] pt-2 text-base font-semibold">
              <span className="text-white">Total</span>
              <span className="tabular-nums text-white">{fmtRupiah(inv.total)}</span>
            </div>
            <Row label="Sudah Dibayar" value={fmtRupiah(inv.paid_amount)} />
            <div className="flex items-center justify-between pt-1 text-base font-semibold">
              <span className="text-white">Sisa Piutang</span>
              <span
                className={`tabular-nums ${remaining > 0 ? "text-amber-300" : "text-emerald-300"}`}
              >
                {fmtRupiah(remaining)}
              </span>
            </div>
          </div>

          {inv.notes ? (
            <div className="rounded-lg border border-white/[0.06] bg-[#1f1f1f] p-4">
              <div className="text-[11px] uppercase tracking-wider text-white/40">
                Catatan
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-white/80">
                {inv.notes}
              </p>
            </div>
          ) : null}

          {canReceivePayment ? (
            <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] p-3 text-xs text-emerald-200/80">
              Pembayaran bisa dicatat langsung dari invoice ini. Klik{" "}
              <strong>Terima Pembayaran</strong> untuk membuka Penerimaan Kas
              dengan invoice ini otomatis terpilih.
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
            {canReceivePayment ? (
              <Button
                variant="secondary"
                onClick={onReceivePayment}
                disabled={pending}
                className="gap-1.5"
              >
                <Wallet size={14} strokeWidth={1.8} />
                Terima Pembayaran
              </Button>
            ) : null}
            {canManage && inv.status === "draft" ? (
              <Button onClick={onIssue} disabled={pending} className="gap-1.5">
                <CheckCircle2 size={14} strokeWidth={1.8} />
                Terbitkan
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "amber";
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-white/50">{label}</span>
      <span
        className={`tabular-nums ${tone === "amber" ? "text-amber-300" : "text-white/80"}`}
      >
        {value}
      </span>
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
      <FileText
        size={32}
        strokeWidth={1.5}
        className="mx-auto mb-4 text-white/30"
      />
      <h3 className="text-base font-medium text-white">
        {hasFilter
          ? "Tidak ada invoice cocok"
          : "Belum ada invoice penjualan"}
      </h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-white/50">
        {hasFilter
          ? "Coba ubah filter pencarian."
          : "Buat invoice penjualan untuk customer WA, Shopee, TikTok, atau offline. Stok otomatis berkurang saat invoice diterbitkan."}
      </p>
      {!hasFilter && onCreate ? (
        <Button onClick={onCreate} className="mt-5 gap-2">
          <Plus size={16} strokeWidth={2} />
          Invoice Pertama
        </Button>
      ) : null}
    </div>
  );
}
