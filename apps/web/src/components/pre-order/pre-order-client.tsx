"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  Card,
  FieldLabel,
  Input,
  NumberInput,
  Select,
} from "@sneakervault/ui";
import {
  PRE_ORDER_STATUS_LABELS,
  PRE_ORDER_STATUS_TONES,
} from "@sneakervault/shared";
import type { PreOrderSource, PreOrderStatus } from "@sneakervault/shared";
import { useToast } from "@/components/toast";
import { ShoeSizePicker } from "@/components/ui/shoe-size-picker";
import { formatDate, formatRupiah } from "@/lib/format";
import type {
  PreOrderChannel,
  PreOrderRow,
  SalesProductPickerRow,
} from "@/lib/queries";
import { cancelPreOrder, createPreOrder } from "@/lib/actions/pre-orders";
import { createPurchaseOrderFromPreOrder } from "@/lib/actions/purchase-orders";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Package,
  Plus,
  Search,
  ShoppingBag,
  X,
  XCircle,
} from "lucide-react";

const CHANNEL_LABELS: Record<PreOrderChannel, string> = {
  manual: "Manual",
  wa: "WhatsApp",
  shopee: "Shopee",
  tiktok: "TikTok Shop",
  tokopedia: "Tokopedia",
  offline: "Offline / Toko",
  website: "Website",
  other: "Lainnya",
};

type DraftLine = {
  product_id: string | null;
  sku: string;
  product_name: string;
  brand: string;
  model: string;
  color: string;
  size_label: string;
  requested_qty: number;
  unit_price: number;
  estimated_cost: number;
  notes: string;
};

type FormState = {
  source: PreOrderSource;
  channel: PreOrderChannel;
  marketplace_order_id: string;
  customer_name: string;
  order_date: string;
  deadline_date: string;
  marketplace_status: string;
  notes: string;
  lines: DraftLine[];
};

type ManualDraft = {
  brand: string;
  model: string;
  color: string;
  sku: string;
  product_name: string;
  size_label: string;
  requested_qty: number;
  unit_price: number;
  estimated_cost: number;
  notes: string;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm(): FormState {
  return {
    source: "manual",
    channel: "wa",
    marketplace_order_id: "",
    customer_name: "",
    order_date: todayIso(),
    deadline_date: "",
    marketplace_status: "",
    notes: "",
    lines: [],
  };
}

function emptyManual(): ManualDraft {
  return {
    brand: "",
    model: "",
    color: "",
    sku: "",
    product_name: "",
    size_label: "",
    requested_qty: 1,
    unit_price: 0,
    estimated_cost: 0,
    notes: "",
  };
}

function numericSize(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (/^\d+(\.\d+)?$/.test(normalized)) return Number(normalized);
  return null;
}

function fieldErrorText(error: unknown): string {
  if (!error) return "Gagal menyimpan Pre Order.";
  if (typeof error === "string") return error;
  if (typeof error !== "object") return String(error);
  return Object.entries(error as Record<string, unknown>)
    .flatMap(([field, value]) => {
      if (Array.isArray(value)) return value.map((item) => `${field}: ${item}`);
      return [`${field}: ${String(value)}`];
    })
    .join("\n");
}

function lineFromProduct(product: SalesProductPickerRow): DraftLine {
  const sizeLabel = product.size_label ?? String(Number(product.size));
  return {
    product_id: product.id,
    sku: product.sku,
    product_name: `${product.brand} ${product.model} ${product.color}`,
    brand: product.brand,
    model: product.model,
    color: product.color,
    size_label: sizeLabel,
    requested_qty: 1,
    unit_price: product.sell_price,
    estimated_cost: product.hpp,
    notes: "",
  };
}

export function PreOrderClient({
  preOrders,
  products,
  suppliers,
  roles,
}: {
  preOrders: PreOrderRow[];
  products: SalesProductPickerRow[];
  suppliers: { id: string; name: string }[];
  roles: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PreOrderStatus | "all">(
    "all",
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [procurementOrder, setProcurementOrder] = useState<PreOrderRow | null>(null);
  const [procurementSupplierId, setProcurementSupplierId] = useState("");
  const [procurementExpectedDate, setProcurementExpectedDate] = useState("");
  const [procurementError, setProcurementError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);

  const canManage =
    roles.includes("owner") ||
    roles.includes("finance") ||
    roles.includes("admin_online");
  const canProcure = roles.includes("owner") || roles.includes("finance");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return preOrders.filter((order) => {
      if (statusFilter !== "all" && order.computed_status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        order.customer_name.toLowerCase().includes(q) ||
        (order.marketplace_order_id ?? "").toLowerCase().includes(q) ||
        order.lines.some((line) =>
          `${line.product_name} ${line.sku} ${line.size_label}`
            .toLowerCase()
            .includes(q),
        )
      );
    });
  }, [preOrders, search, statusFilter]);

  const stats = useMemo(() => {
    return preOrders.reduce(
      (acc, order) => {
        acc.total += 1;
        acc.qty += order.total_qty;
        acc.shortage += order.shortage_qty;
        if (order.computed_status === "review") acc.review += 1;
        if (order.computed_status === "ready_from_stock") acc.ready += 1;
        if (order.computed_status === "needs_purchase") acc.needsPurchase += 1;
        return acc;
      },
      { total: 0, qty: 0, shortage: 0, review: 0, ready: 0, needsPurchase: 0 },
    );
  }, [preOrders]);

  function openNew() {
    setForm(emptyForm());
    setFormError(null);
    setModalOpen(true);
  }

  function addProductLine(productId: string) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    setForm((current) => {
      const existingIndex = current.lines.findIndex(
        (line) => line.product_id === product.id,
      );
      if (existingIndex >= 0) {
        return {
          ...current,
          lines: current.lines.map((line, index) =>
            index === existingIndex
              ? { ...line, requested_qty: line.requested_qty + 1 }
              : line,
          ),
        };
      }
      return { ...current, lines: [...current.lines, lineFromProduct(product)] };
    });
  }

  function removeLine(index: number) {
    setForm((current) => ({
      ...current,
      lines: current.lines.filter((_, lineIndex) => lineIndex !== index),
    }));
  }

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    }));
  }

  function save() {
    setFormError(null);
    if (!canManage) return;
    if (form.lines.length === 0) {
      setFormError("Tambahkan minimal 1 item Pre Order.");
      return;
    }

    startTransition(async () => {
      const result = await createPreOrder({
        ...form,
        marketplace_order_id: form.marketplace_order_id.trim() || undefined,
        deadline_date: form.deadline_date || null,
        marketplace_status: form.marketplace_status.trim() || undefined,
        notes: form.notes.trim() || undefined,
        lines: form.lines.map((line) => ({
          ...line,
          size_value: numericSize(line.size_label),
          notes: line.notes.trim() || undefined,
        })),
      });

      if ("error" in result && result.error) {
        setFormError(fieldErrorText(result.error));
        return;
      }

      toast.push("Pre Order tersimpan", "success");
      setModalOpen(false);
      router.refresh();
    });
  }

  function cancel(id: string) {
    const reason = window.prompt("Alasan pembatalan Pre Order:");
    if (reason === null) return;
    startTransition(async () => {
      const result = await cancelPreOrder(id, reason.trim() || undefined);
      if ("error" in result && result.error) {
        toast.push(result.error, "error");
        return;
      }
      toast.push("Pre Order dibatalkan", "success");
      router.refresh();
    });
  }

  function openProcurement(order: PreOrderRow) {
    setProcurementOrder(order);
    setProcurementSupplierId(suppliers[0]?.id ?? "");
    setProcurementExpectedDate("");
    setProcurementError(null);
  }

  function createProcurementPo() {
    if (!procurementOrder) return;
    if (!procurementSupplierId) {
      setProcurementError("Pilih vendor terlebih dahulu.");
      return;
    }
    setProcurementError(null);
    startTransition(async () => {
      const result = await createPurchaseOrderFromPreOrder({
        pre_order_id: procurementOrder.id,
        supplier_id: procurementSupplierId,
        expected_date: procurementExpectedDate || null,
      });
      if ("error" in result && result.error) {
        setProcurementError(fieldErrorText(result.error));
        return;
      }
      toast.push(
        `Pembelian Barang ${result.data?.po_number ?? ""} dibuat dari Pre Order`,
        "success",
      );
      setProcurementOrder(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-white/[0.06] text-white/80">
            <ClipboardList size={22} strokeWidth={1.8} />
          </div>
          <h1 className="text-2xl font-bold text-white">Pre Order</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/45">
            Catat permintaan customer sebelum jadi invoice. Item bisa diambil
            dari stok ready atau ditandai perlu pembelian supplier.
          </p>
        </div>
        {canManage ? (
          <Button onClick={openNew} className="gap-2">
            <Plus size={16} />
            Pre Order Baru
          </Button>
        ) : null}
      </div>

      <Alert tone="info" className="text-xs leading-relaxed">
        Pre Order bukan stok fisik. Sistem membuat reservasi jika stok tersedia,
        dan menampilkan kekurangan sebagai kebutuhan pembelian. Nomor order
        marketplace tetap tampil eksplisit supaya gudang tidak bingung saat
        packing.
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total Pre Order" value={stats.total} />
        <StatCard label="Qty Diminta" value={stats.qty} />
        <StatCard label="Siap dari Stok" value={stats.ready} tone="success" />
        <StatCard label="Perlu Pembelian" value={stats.needsPurchase} tone="danger" />
        <StatCard label="Qty Kurang" value={stats.shortage} tone="warning" />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari customer, nomor order marketplace, SKU, atau produk..."
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as PreOrderStatus | "all")
            }
          >
            <option value="all">Semua status</option>
            {Object.entries(PRE_ORDER_STATUS_LABELS).map(([status, label]) => (
              <option key={status} value={status}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
        <div className="grid grid-cols-[1.2fr_1fr_1fr_120px_140px_132px] gap-3 border-b border-white/[0.06] px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">
          <div>Customer / Order</div>
          <div>Item</div>
          <div>Channel</div>
          <div className="text-right">Qty</div>
          <div>Status</div>
          <div className="text-right">Aksi</div>
        </div>
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-white/45">
            Belum ada Pre Order sesuai filter.
          </div>
        ) : (
          filtered.map((order) => (
            <div
              key={order.id}
              className="grid grid-cols-[1.2fr_1fr_1fr_120px_140px_132px] gap-3 border-b border-white/[0.04] px-4 py-3 text-sm last:border-0"
            >
              <div>
                <div className="font-medium text-white">{order.customer_name}</div>
                <div className="mt-1 text-xs text-white/40">
                  {formatDate(order.order_date)}
                  {order.marketplace_order_id
                    ? ` • Ref. ${order.marketplace_order_id}`
                    : ""}
                </div>
              </div>
              <div>
                <div className="text-white/80">
                  {order.lines[0]?.product_name ?? "-"}
                </div>
                <div className="mt-1 text-xs text-white/40">
                  {order.line_count} item
                  {order.lines[0]
                    ? ` • SKU ${order.lines[0].sku} • Size ${order.lines[0].size_label}`
                    : ""}
                </div>
              </div>
              <div>
                <Badge tone="neutral">{CHANNEL_LABELS[order.channel]}</Badge>
                {order.source === "marketplace" ? (
                  <div className="mt-1 text-xs text-white/40">
                    Pre Order Marketplace
                  </div>
                ) : null}
              </div>
              <div className="text-right">
                <div className="text-white">{order.total_qty}</div>
                <div className="text-xs text-white/40">
                  siap {order.ready_qty} / kurang {order.shortage_qty}
                </div>
              </div>
              <div>
                <Badge tone={PRE_ORDER_STATUS_TONES[order.computed_status]}>
                  {PRE_ORDER_STATUS_LABELS[order.computed_status]}
                </Badge>
                {order.total_amount > 0 ? (
                  <div className="mt-1 text-xs text-white/40">
                    {formatRupiah(order.total_amount)}
                  </div>
                ) : null}
              </div>
              <div className="flex justify-end gap-1">
                {canProcure &&
                order.lines.some(
                  (line) =>
                    line.shortage_qty > 0 &&
                    line.procurement_po_numbers.length === 0,
                ) &&
                !["cancelled", "packed"].includes(order.computed_status) ? (
                  <button
                    type="button"
                    onClick={() => openProcurement(order)}
                    className="rounded-lg px-2 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/10"
                    title="Buat Pembelian Barang dari kekurangan Pre Order"
                  >
                    Buat Pembelian Barang
                  </button>
                ) : null}
                {canManage && order.computed_status !== "cancelled" ? (
                  <button
                    type="button"
                    onClick={() => cancel(order.id)}
                    className="rounded-lg p-2 text-white/40 hover:bg-white/[0.06] hover:text-red-300"
                    title="Batalkan Pre Order"
                  >
                    <XCircle size={16} />
                  </button>
                ) : (
                  <span className="text-white/25">-</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {modalOpen ? (
        <PreOrderModal
          form={form}
          setForm={setForm}
          products={products}
          formError={formError}
          pending={pending}
          onClose={() => setModalOpen(false)}
          onSave={save}
          onAddProductLine={addProductLine}
          onRemoveLine={removeLine}
          onUpdateLine={updateLine}
        />
      ) : null}
      {procurementOrder ? (
        <ProcurementModal
          order={procurementOrder}
          suppliers={suppliers}
          supplierId={procurementSupplierId}
          expectedDate={procurementExpectedDate}
          error={procurementError}
          pending={pending}
          onSupplierChange={setProcurementSupplierId}
          onExpectedDateChange={setProcurementExpectedDate}
          onClose={() => setProcurementOrder(null)}
          onCreate={createProcurementPo}
        />
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-300"
      : tone === "warning"
        ? "text-amber-300"
        : tone === "danger"
          ? "text-red-300"
          : "text-white";
  return (
    <Card className="p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-white/35">
        {label}
      </div>
      <div className={`mt-3 text-2xl font-semibold ${toneClass}`}>{value}</div>
    </Card>
  );
}

function ProcurementModal({
  order,
  suppliers,
  supplierId,
  expectedDate,
  error,
  pending,
  onSupplierChange,
  onExpectedDateChange,
  onClose,
  onCreate,
}: {
  order: PreOrderRow;
  suppliers: { id: string; name: string }[];
  supplierId: string;
  expectedDate: string;
  error: string | null;
  pending: boolean;
  onSupplierChange: (value: string) => void;
  onExpectedDateChange: (value: string) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  const shortageLines = order.lines.filter(
    (line) => line.shortage_qty > 0 && line.procurement_po_numbers.length === 0,
  );
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-white/[0.08] bg-[#262626] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-white/[0.06] px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">
              Buat Pembelian Barang dari Pre Order
            </h2>
            <p className="mt-1 text-xs text-white/45">
              Customer {order.customer_name}
              {order.marketplace_order_id
                ? ` / Ref. ${order.marketplace_order_id}`
                : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/45 hover:bg-white/[0.06] hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {error ? (
            <Alert tone="error" className="whitespace-pre-line text-xs">
              {error}
            </Alert>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <FieldLabel htmlFor="po_supplier">Vendor *</FieldLabel>
              <Select
                id="po_supplier"
                value={supplierId}
                onChange={(event) => onSupplierChange(event.target.value)}
              >
                <option value="">Pilih vendor</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="po_eta">ETA Diterima</FieldLabel>
              <Input
                id="po_eta"
                type="date"
                value={expectedDate}
                onChange={(event) => onExpectedDateChange(event.target.value)}
              />
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.06]">
            <div className="border-b border-white/[0.06] px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white/40">
              Item yang perlu dibelikan
            </div>
            <div className="divide-y divide-white/[0.05]">
              {shortageLines.map((line) => (
                <div
                  key={line.id}
                  className="grid grid-cols-[1fr_80px_110px] gap-3 px-4 py-3 text-sm"
                >
                  <div>
                    <div className="font-medium text-white">
                      {line.product_name}
                    </div>
                    <div className="mt-1 text-xs text-white/40">
                      SKU {line.sku} / Size {line.size_label}
                    </div>
                  </div>
                  <div className="text-right text-white">
                    {line.shortage_qty}
                  </div>
                  <div className="text-right text-white/55">
                    {formatRupiah(line.estimated_cost)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Alert tone="info" className="text-xs leading-relaxed">
            Dokumen Pembelian Barang dibuat sebagai Draft. Saat Pembelian Barang
            diterima, barang masuk inventory dan link Pre Order tetap tersimpan
            untuk tracking demand.
          </Alert>
        </div>

        <div className="flex justify-end gap-2 border-t border-white/[0.06] px-6 py-4">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Batal
          </Button>
          <Button onClick={onCreate} disabled={pending || suppliers.length === 0}>
            {pending ? "Membuat..." : "Buat Pembelian Barang"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PreOrderModal({
  form,
  setForm,
  products,
  formError,
  pending,
  onClose,
  onSave,
  onAddProductLine,
  onRemoveLine,
  onUpdateLine,
}: {
  form: FormState;
  setForm: (form: FormState) => void;
  products: SalesProductPickerRow[];
  formError: string | null;
  pending: boolean;
  onClose: () => void;
  onSave: () => void;
  onAddProductLine: (productId: string) => void;
  onRemoveLine: (index: number) => void;
  onUpdateLine: (index: number, patch: Partial<DraftLine>) => void;
}) {
  const [tab, setTab] = useState<"inventory" | "manual">("inventory");
  const [productSearch, setProductSearch] = useState("");
  const [manual, setManual] = useState<ManualDraft>(emptyManual());

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const source = q
      ? products.filter((product) =>
          `${product.brand} ${product.model} ${product.color} ${product.sku}`
            .toLowerCase()
            .includes(q),
        )
      : products;
    return source.slice(0, 60);
  }, [productSearch, products]);

  function addManual() {
    const name =
      manual.product_name.trim() ||
      [manual.brand, manual.model, manual.color].filter(Boolean).join(" ");
    if (!name.trim() || !manual.sku.trim() || !manual.size_label.trim()) return;
    setForm({
      ...form,
      lines: [
        ...form.lines,
        {
          product_id: null,
          sku: manual.sku.trim(),
          product_name: name.trim(),
          brand: manual.brand.trim(),
          model: manual.model.trim(),
          color: manual.color.trim(),
          size_label: manual.size_label.trim(),
          requested_qty: Math.max(1, Number(manual.requested_qty) || 1),
          unit_price: Number(manual.unit_price) || 0,
          estimated_cost: Number(manual.estimated_cost) || 0,
          notes: manual.notes.trim(),
        },
      ],
    });
    setManual(emptyManual());
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#262626] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">Pre Order Baru</h2>
            <p className="mt-1 text-xs text-white/45">
              Simpan demand customer dulu, lalu sistem pisahkan stok ready dan
              kebutuhan pembelian.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/45 hover:bg-white/[0.06] hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {formError ? (
            <Alert tone="error" className="whitespace-pre-line text-xs">
              {formError}
            </Alert>
          ) : null}

          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <FieldLabel htmlFor="source">Sumber *</FieldLabel>
              <Select
                id="source"
                value={form.source}
                onChange={(event) => {
                  const source = event.target.value as PreOrderSource;
                  setForm({
                    ...form,
                    source,
                    channel: source === "marketplace" ? "shopee" : "wa",
                  });
                }}
              >
                <option value="manual">Manual Customer</option>
                <option value="marketplace">Pre Order Marketplace</option>
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="channel">Channel *</FieldLabel>
              <Select
                id="channel"
                value={form.channel}
                onChange={(event) =>
                  setForm({
                    ...form,
                    channel: event.target.value as PreOrderChannel,
                  })
                }
              >
                {Object.entries(CHANNEL_LABELS)
                  .filter(([value]) =>
                    form.source === "marketplace"
                      ? ["shopee", "tiktok", "tokopedia", "other"].includes(value)
                      : !["manual", "other"].includes(value),
                  )
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="order_date">Tanggal Order *</FieldLabel>
              <Input
                id="order_date"
                type="date"
                value={form.order_date}
                onChange={(event) =>
                  setForm({ ...form, order_date: event.target.value })
                }
              />
            </div>
            <div>
              <FieldLabel htmlFor="deadline_date">Target / Deadline</FieldLabel>
              <Input
                id="deadline_date"
                type="date"
                value={form.deadline_date}
                onChange={(event) =>
                  setForm({ ...form, deadline_date: event.target.value })
                }
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <FieldLabel htmlFor="customer_name">Customer *</FieldLabel>
              <Input
                id="customer_name"
                value={form.customer_name}
                onChange={(event) =>
                  setForm({ ...form, customer_name: event.target.value })
                }
                placeholder="Nama customer"
              />
            </div>
            <div>
              <FieldLabel htmlFor="marketplace_order_id">
                Nomor Order / Referensi
              </FieldLabel>
              <Input
                id="marketplace_order_id"
                value={form.marketplace_order_id}
                onChange={(event) =>
                  setForm({ ...form, marketplace_order_id: event.target.value })
                }
                placeholder="Wajib untuk pesanan online, contoh WA-000123"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <FieldLabel htmlFor="marketplace_status">Status Marketplace</FieldLabel>
              <Input
                id="marketplace_status"
                value={form.marketplace_status}
                onChange={(event) =>
                  setForm({ ...form, marketplace_status: event.target.value })
                }
                placeholder="Contoh: Perlu dikirim / Menunggu pengadaan / Menunggu pembayaran"
              />
            </div>
            <div>
              <FieldLabel htmlFor="notes">Catatan</FieldLabel>
              <Input
                id="notes"
                value={form.notes}
                onChange={(event) =>
                  setForm({ ...form, notes: event.target.value })
                }
                placeholder="Catatan internal"
              />
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.06]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Item Pre Order
                </h3>
                <p className="mt-0.5 text-xs text-white/40">
                  Pilih produk ready dari inventory atau input manual produk
                  yang belum ada.
                </p>
              </div>
              <Badge tone={form.lines.length > 0 ? "success" : "warning"}>
                {form.lines.length} item
              </Badge>
            </div>

            <div className="border-b border-white/[0.06] bg-[#1f1f1f] p-3">
              <div className="mb-3 flex rounded-lg bg-white/[0.04] p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setTab("inventory")}
                  className={`flex-1 rounded-md px-3 py-2 font-medium ${tab === "inventory" ? "bg-white/[0.1] text-white" : "text-white/45"}`}
                >
                  Dari Inventory
                </button>
                <button
                  type="button"
                  onClick={() => setTab("manual")}
                  className={`flex-1 rounded-md px-3 py-2 font-medium ${tab === "manual" ? "bg-white/[0.1] text-white" : "text-white/45"}`}
                >
                  Produk Manual
                </button>
              </div>

              {tab === "inventory" ? (
                <div className="space-y-3">
                  <div className="relative">
                    <Search
                      size={14}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35"
                    />
                    <Input
                      value={productSearch}
                      onChange={(event) => setProductSearch(event.target.value)}
                      className="pl-9"
                      placeholder="Cari brand, model, SKU, warna..."
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto rounded-lg border border-white/[0.05] bg-[#262626]">
                    {filteredProducts.length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-white/40">
                        Produk tidak ditemukan. Pakai tab Produk Manual untuk
                        demand barang baru.
                      </div>
                    ) : (
                      filteredProducts.map((product) => (
                        <button
                          type="button"
                          key={product.id}
                          onClick={() => onAddProductLine(product.id)}
                          className="flex w-full items-center justify-between border-b border-white/[0.04] px-3 py-2 text-left text-sm last:border-0 hover:bg-white/[0.04]"
                        >
                          <div>
                            <div className="text-white">
                              {product.brand} {product.model}{" "}
                              <span className="text-white/45">
                                {product.color} / Size{" "}
                                {product.size_label ?? Number(product.size)}
                              </span>
                            </div>
                            <div className="text-[11px] text-white/40">
                              SKU {product.sku} / stok {product.quantity} /
                              harga {formatRupiah(product.sell_price)}
                            </div>
                          </div>
                          {product.quantity > 0 ? (
                            <CheckCircle2 size={15} className="text-emerald-300" />
                          ) : (
                            <AlertTriangle size={15} className="text-amber-300" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <Alert tone="warning" className="text-xs leading-relaxed">
                    Produk manual berarti barang belum punya variant inventory.
                    Sistem akan menandai item perlu review/pembelian sampai
                    barang dibuat atau diterima.
                  </Alert>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Input
                      placeholder="Brand"
                      value={manual.brand}
                      onChange={(event) =>
                        setManual({ ...manual, brand: event.target.value })
                      }
                    />
                    <Input
                      placeholder="Model"
                      value={manual.model}
                      onChange={(event) =>
                        setManual({ ...manual, model: event.target.value })
                      }
                    />
                    <Input
                      placeholder="Warna"
                      value={manual.color}
                      onChange={(event) =>
                        setManual({ ...manual, color: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Input
                      placeholder="SKU *"
                      value={manual.sku}
                      onChange={(event) =>
                        setManual({ ...manual, sku: event.target.value })
                      }
                    />
                    <Input
                      placeholder="Nama produk *"
                      value={manual.product_name}
                      onChange={(event) =>
                        setManual({
                          ...manual,
                          product_name: event.target.value,
                        })
                      }
                    />
                    <ShoeSizePicker
                      value={manual.size_label}
                      onChange={(value) =>
                        setManual({ ...manual, size_label: value })
                      }
                      required
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    <NumberInput
                      min={1}
                      value={manual.requested_qty}
                      onValueChange={(value) =>
                        setManual({
                          ...manual,
                          requested_qty: value || 1,
                        })
                      }
                      placeholder="Qty"
                    />
                    <NumberInput
                      min={0}
                      value={manual.unit_price}
                      onValueChange={(value) =>
                        setManual({
                          ...manual,
                          unit_price: value || 0,
                        })
                      }
                      placeholder="Harga jual"
                    />
                    <NumberInput
                      min={0}
                      value={manual.estimated_cost}
                      onValueChange={(value) =>
                        setManual({
                          ...manual,
                          estimated_cost: value || 0,
                        })
                      }
                      placeholder="Estimasi HPP"
                    />
                    <Button
                      type="button"
                      onClick={addManual}
                      className="gap-2"
                      disabled={
                        !manual.sku.trim() ||
                        !manual.size_label.trim() ||
                        !(
                          manual.product_name.trim() ||
                          manual.brand.trim() ||
                          manual.model.trim()
                        )
                      }
                    >
                      <Plus size={14} />
                      Tambah
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {form.lines.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-10 text-center text-sm text-white/40">
                <ShoppingBag size={24} className="mb-3 text-white/25" />
                Belum ada item.
              </div>
            ) : (
              <div className="divide-y divide-white/[0.05]">
                {form.lines.map((line, index) => (
                  <div
                    key={`${line.sku}-${line.size_label}-${index}`}
                    className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_120px_140px_44px]"
                  >
                    <div>
                      <div className="text-sm font-medium text-white">
                        {line.product_name}
                      </div>
                      <div className="mt-1 text-xs text-white/40">
                        SKU {line.sku} / Size {line.size_label}
                        {line.product_id ? " / inventory" : " / manual"}
                      </div>
                    </div>
                    <NumberInput
                      min={1}
                      value={line.requested_qty}
                      onValueChange={(value) =>
                        onUpdateLine(index, {
                          requested_qty: value || 1,
                        })
                      }
                    />
                    <NumberInput
                      min={0}
                      value={line.unit_price}
                      onValueChange={(value) =>
                        onUpdateLine(index, {
                          unit_price: value || 0,
                        })
                      }
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveLine(index)}
                      className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06] hover:text-red-300"
                    >
                      <XCircle size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.06] px-6 py-4">
          <div className="flex items-center gap-2 text-xs text-white/40">
            <Package size={14} />
            Stok tidak berkurang sampai invoice/packing berjalan.
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Batal
            </Button>
            <Button onClick={onSave} disabled={pending} className="gap-2">
              {pending ? "Menyimpan..." : "Simpan Pre Order"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
