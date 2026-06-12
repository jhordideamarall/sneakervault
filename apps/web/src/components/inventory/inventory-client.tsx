"use client";

import { useState, useMemo, useTransition, useEffect, type ChangeEvent } from "react";
import {
  Button,
  Input,
  Card,
  FieldLabel,
  FieldError,
  Alert,
  cn,
} from "@sneakervault/ui";
import { formatRupiah } from "@/lib/format";
import {
  ChevronDown,
  ChevronRight,
  ImageOff,
  Package,
  Pencil,
  Search,
  ShieldAlert,
  Clock,
} from "lucide-react";
import { createProduct, searchProductsFuzzy } from "@/lib/actions/products";
import { createClient } from "@sneakervault/supabase/client";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";
import { ExportButtons } from "@/components/export-buttons";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { BulkImportButton } from "@/components/inventory/bulk-import-button";
import { ConditionBadge } from "@/components/inventory/condition-badge";
import { ConditionUpdaterModal } from "@/components/inventory/condition-updater-modal";
import { EditProductModal } from "@/components/inventory/edit-product-modal";
import { QuickTip } from "@/components/ui/quick-tip";
import type { ProductCondition, Role } from "@sneakervault/shared";
import {
  canSeeHpp,
  canEditPrice as canEditPriceFn,
  canChangeProductCondition,
} from "@/config/permissions";

// ─── Types ──────────────────────────────────────────────────────────────────
type Product = {
  id: string;
  brand: string;
  model: string;
  sku: string;
  size: number;
  color: string | null;
  barcode: string;
  quantity: number;
  hpp: number;
  sell_price: number;
  price_offline: number;
  image_url: string | null;
  condition: ProductCondition;
  defect_reason: string | null;
};

type ModelGroup = {
  key: string;
  brand: string;
  model: string;
  image_url: string | null;
  totalQty: number;
  activeQty: number;
  defectQty: number;
  dormantQty: number;
  variants: Product[];
  hasDefect: boolean;
  hasDormant: boolean;
  minOnline: number;
  maxOnline: number;
  avgHpp: number; // weighted average HPP across all sizes in the SKU
};

function groupByModel(products: Product[]): ModelGroup[] {
  const map = new Map<string, ModelGroup>();
  for (const p of products) {
    const key = `${p.brand}::${p.model}`;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        brand: p.brand,
        model: p.model,
        image_url: p.image_url,
        totalQty: 0,
        activeQty: 0,
        defectQty: 0,
        dormantQty: 0,
        variants: [],
        hasDefect: false,
        hasDormant: false,
        minOnline: p.sell_price,
        maxOnline: p.sell_price,
        avgHpp: 0,
      };
      map.set(key, group);
    }
    if (!group.image_url && p.image_url) group.image_url = p.image_url;
    group.totalQty += p.quantity;
    if (p.condition === "normal") group.activeQty += p.quantity;
    if (p.condition === "defect") {
      group.defectQty += p.quantity;
      group.hasDefect = true;
    }
    if (p.condition === "dormant") {
      group.dormantQty += p.quantity;
      group.hasDormant = true;
    }
    if (p.sell_price > 0) {
      group.minOnline = Math.min(group.minOnline || p.sell_price, p.sell_price);
      group.maxOnline = Math.max(group.maxOnline, p.sell_price);
    }
    group.variants.push(p);
  }
  for (const g of map.values()) {
    g.variants.sort((a, b) => a.size - b.size);

    // HPP rata-rata per SKU/model — weighted by quantity, fall back to simple average if no stock.
    let weightedSum = 0;
    let totalQty = 0;
    let hppSum = 0;
    let hppCount = 0;
    for (const v of g.variants) {
      if (v.hpp > 0) {
        weightedSum += v.hpp * v.quantity;
        totalQty += v.quantity;
        hppSum += v.hpp;
        hppCount += 1;
      }
    }
    g.avgHpp =
      totalQty > 0
        ? Math.round(weightedSum / totalQty)
        : hppCount > 0
          ? Math.round(hppSum / hppCount)
          : 0;
  }
  return Array.from(map.values()).sort((a, b) =>
    a.brand === b.brand
      ? a.model.localeCompare(b.model)
      : a.brand.localeCompare(b.brand),
  );
}

function formatPriceRange(min: number, max: number): string {
  if (min === max) return formatRupiah(min);
  return `${formatRupiah(min)} – ${formatRupiah(max)}`;
}

// ─── Main Component ─────────────────────────────────────────────────────────
export function InventoryClient({
  products,
  total,
  roles,
}: {
  products: Product[];
  total: number;
  roles: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const roleList = roles as Role[];

  const [search, setSearch] = useState("");
  const [fuzzyResults, setFuzzyResults] = useState<Product[] | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Product | null>(null);
  const [conditionEditing, setConditionEditing] = useState<Product | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const showHpp = canSeeHpp(roleList);
  const canEditPrice = canEditPriceFn(roleList);
  const canEditInventory =
    roleList.includes("owner") || roleList.includes("admin_gudang");
  const canChangeCondition = canChangeProductCondition(roleList);

  useLiveRefresh(["products"]);

  // Fuzzy search via RPC (meeting 2: "samba" ≈ "cloud white")
  useEffect(() => {
    if (search.trim().length < 2) {
      setFuzzyResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      const results = (await searchProductsFuzzy(search, 100)) as Product[];
      setFuzzyResults(results);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const displayProducts = useMemo(() => {
    if (fuzzyResults) return fuzzyResults;
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.brand.toLowerCase().includes(q) ||
        p.model.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        (p.color ?? "").toLowerCase().includes(q),
    );
  }, [products, fuzzyResults, search]);

  const groups = useMemo(() => groupByModel(displayProducts), [displayProducts]);

  // Totals for the summary strip
  const summary = useMemo(() => {
    let totalQty = 0;
    let normalQty = 0;
    let defectQty = 0;
    let dormantQty = 0;
    for (const p of products) {
      totalQty += p.quantity;
      if (p.condition === "normal") normalQty += p.quantity;
      else if (p.condition === "defect") defectQty += p.quantity;
      else if (p.condition === "dormant") dormantQty += p.quantity;
    }
    return { totalQty, normalQty, defectQty, dormantQty };
  }, [products]);

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function expandAll() {
    setExpandedGroups(new Set(groups.map((g) => g.key)));
  }
  function collapseAll() {
    setExpandedGroups(new Set());
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Inventori</h1>
          <p className="mt-1 text-sm text-white/50">
            {groups.length} model · {total} SKU
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButtons
            title="Inventori Dewins.id"
            sheetName="Inventori"
            columns={[
              "Brand",
              "Model",
              "Size",
              "SKU",
              "Barcode",
              "Stok",
              "Kondisi",
              ...(showHpp ? ["HPP"] : []),
              "Harga Online",
              "Harga Offline",
            ]}
            rows={displayProducts.map((p) => {
              const g = groups.find((gr) => gr.brand === p.brand && gr.model === p.model);
              const hppForRow = g ? g.avgHpp : p.hpp;
              return [
                p.brand,
                p.model,
                p.size,
                p.sku,
                p.barcode,
                p.quantity,
                p.condition,
                ...(showHpp ? [hppForRow] : []),
                p.sell_price,
                p.price_offline,
              ];
            })}
          />
          {canEditInventory && <BulkImportButton />}
          {canEditInventory && (
            <Button size="sm" onClick={() => setShowAdd(true)}>
              + Tambah Produk
            </Button>
          )}
        </div>
      </div>

      <QuickTip
        id="inventory-hpp-intro-v2"
        title="Cara HPP & stok dihitung"
        tone="info"
      >
        <strong>1 SKU = 1 HPP</strong> (weighted average semua size dalam model yang sama).
        HPP rata-rata ditampilkan di header model — bukan per size — supaya tidak membingungkan.
        Tiap kali ada penerimaan barang dengan harga beda, HPP rata-rata otomatis ter-update.
        <br />
        <span className="mt-1 inline-block text-[12px] text-white/55">
          💡 Stok turun otomatis dari <em>penjualan marketplace</em> + <em>POS</em>. Untuk cek fisik vs sistem, pakai{" "}
          <strong>Stock Opname</strong> di menu Gudang.
        </span>
      </QuickTip>

      {/* Summary strip — at-a-glance stock by condition */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile
          label="Total stok"
          value={summary.totalQty}
          tone="default"
        />
        <SummaryTile
          label="Siap jual"
          value={summary.normalQty}
          tone="success"
        />
        <SummaryTile
          label="Defect"
          value={summary.defectQty}
          tone="danger"
        />
        <SummaryTile
          label="Lama tidak laku"
          value={summary.dormantQty}
          tone="warning"
        />
      </div>

      {/* Search + controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[280px] flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
          />
          <Input
            placeholder="Cari: Samba, Cloud White, NB530, barcode, atau SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={expandAll}
          disabled={groups.length === 0}
        >
          Buka Semua
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={collapseAll}
          disabled={expandedGroups.size === 0}
        >
          Tutup Semua
        </Button>
      </div>

      {fuzzyResults !== null && search.trim().length >= 2 && (
        <p className="text-[11px] text-white/40">
          Pencarian fuzzy aktif — mencocokkan ejaan mendekati (“samba white” ≈ “samba cloud white”).
        </p>
      )}

      {/* Add product form (inline) */}
      {showAdd && (
        <AddProductForm
          canEditPrice={canEditPrice}
          onClose={() => setShowAdd(false)}
          pending={pending}
          startTransition={startTransition}
          toast={toast}
          router={router}
        />
      )}

      {/* Model list */}
      <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#262626]">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-white/40">
            <Package size={32} className="opacity-40" />
            <p className="text-sm">Tidak ada produk.</p>
            {search.trim().length > 0 && (
              <p className="text-xs">Coba kata kunci lain atau cek ejaan.</p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {groups.map((group) => (
              <ModelGroupRow
                key={group.key}
                group={group}
                expanded={expandedGroups.has(group.key)}
                onToggle={() => toggleGroup(group.key)}
                showHpp={showHpp}
                canEdit={canEditInventory}
                canChangeCondition={canChangeCondition}
                onEdit={setEditing}
                onChangeCondition={setConditionEditing}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Modals */}
      {editing && (
        <EditProductModal
          open={true}
          onOpenChange={(o) => !o && setEditing(null)}
          product={editing}
          canEditPrice={canEditPrice}
          canEditImage={canEditInventory}
        />
      )}
      {conditionEditing && (
        <ConditionUpdaterModal
          open={true}
          onOpenChange={(o) => !o && setConditionEditing(null)}
          productId={conditionEditing.id}
          productLabel={`${conditionEditing.brand} ${conditionEditing.model} — size ${conditionEditing.size}`}
          currentCondition={conditionEditing.condition}
        />
      )}
    </div>
  );
}

// ─── Summary Tile ───────────────────────────────────────────────────────────
function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "default" | "success" | "warning" | "danger";
}) {
  const toneValueColor =
    tone === "success"
      ? "text-emerald-400"
      : tone === "warning"
        ? "text-amber-400"
        : tone === "danger"
          ? "text-red-400"
          : "text-white";
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#262626] px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">
        {label}
      </p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums", toneValueColor)}>
        {value.toLocaleString("id-ID")}
      </p>
    </div>
  );
}

// ─── Model Group Row ────────────────────────────────────────────────────────
function ModelGroupRow({
  group,
  expanded,
  onToggle,
  showHpp,
  canEdit,
  canChangeCondition,
  onEdit,
  onChangeCondition,
}: {
  group: ModelGroup;
  expanded: boolean;
  onToggle: () => void;
  showHpp: boolean;
  canEdit: boolean;
  canChangeCondition: boolean;
  onEdit: (p: Product) => void;
  onChangeCondition: (p: Product) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span className="text-white/40">
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </span>

        {/* Thumbnail */}
        <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.03]">
          {group.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={group.image_url}
              alt={`${group.brand} ${group.model}`}
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-white/20">
              <ImageOff size={20} />
            </div>
          )}
        </div>

        {/* Label */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-white">
              {group.brand} {group.model}
            </span>
            {group.hasDefect && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400 ring-1 ring-inset ring-red-500/20">
                <ShieldAlert size={10} /> {group.defectQty} defect
              </span>
            )}
            {group.hasDormant && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400 ring-1 ring-inset ring-amber-500/20">
                <Clock size={10} /> {group.dormantQty} dormant
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-white/40">
            <span>{group.variants.length} varian size</span>
            {group.minOnline > 0 && (
              <>
                <span className="text-white/20">·</span>
                <span>{formatPriceRange(group.minOnline, group.maxOnline)}</span>
              </>
            )}
            {showHpp && group.avgHpp > 0 && (
              <>
                <span className="text-white/20">·</span>
                <span className="inline-flex items-center gap-1 rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] tabular-nums text-white/60">
                  <span className="uppercase tracking-wider text-white/40">HPP</span>
                  {formatRupiah(group.avgHpp)}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Aggregate stock */}
        <div className="flex-shrink-0 text-right">
          <div className="text-sm font-semibold tabular-nums text-white">
            {group.totalQty} <span className="text-white/40">pcs</span>
          </div>
          <div className="text-[11px] text-white/40">
            {group.activeQty} siap jual
          </div>
        </div>
      </button>

      {/* Expanded detail table */}
      {expanded && (
        <div className="border-t border-white/[0.04] bg-[#1f1f1f] px-4 py-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-xs [&_th]:px-3 [&_td]:px-3 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
              <thead>
                <tr className="text-left text-white/40">
                  <th className="py-2 font-medium">Size</th>
                  <th className="py-2 font-medium">SKU</th>
                  <th className="py-2 font-medium">Barcode</th>
                  <th className="py-2 text-right font-medium">Stok</th>
                  <th className="py-2 text-right font-medium">Online</th>
                  <th className="py-2 text-right font-medium">Offline</th>
                  <th className="py-2 pl-6 font-medium">Kondisi</th>
                  {(canEdit || canChangeCondition) && (
                    <th className="py-2 text-right font-medium"></th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {group.variants.map((v) => (
                  <tr key={v.id} className="transition-colors hover:bg-white/[0.02]">
                    <td className="py-2.5 font-semibold text-white">{v.size}</td>
                    <td className="py-2.5 font-mono text-[11px] text-white/50">
                      {v.sku}
                    </td>
                    <td className="py-2.5 font-mono text-[11px] text-white/50">
                      {v.barcode}
                    </td>
                    <td
                      className={cn(
                        "py-2.5 text-right font-semibold tabular-nums",
                        v.quantity === 0
                          ? "text-white/20"
                          : v.quantity <= 2
                            ? "text-amber-400"
                            : "text-white",
                      )}
                    >
                      {v.quantity}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-white">
                      {formatRupiah(v.sell_price)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-emerald-400">
                      {formatRupiah(v.price_offline)}
                    </td>
                    <td className="py-2.5 pl-6">
                      <ConditionBadge condition={v.condition} />
                      {v.defect_reason && (
                        <div
                          className="mt-0.5 max-w-[180px] truncate text-[10px] text-white/30"
                          title={v.defect_reason}
                        >
                          {v.defect_reason}
                        </div>
                      )}
                    </td>
                    {(canEdit || canChangeCondition) && (
                      <td className="py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          {canEdit && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onEdit(v)}
                              className="h-7 px-2"
                              title="Edit produk"
                            >
                              <Pencil size={12} />
                            </Button>
                          )}
                          {canChangeCondition && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onChangeCondition(v)}
                              className="h-7 px-2 text-[11px]"
                            >
                              Status
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </li>
  );
}

// ─── Add Product Form ───────────────────────────────────────────────────────
type AddFormState = {
  brand: string;
  model: string;
  sku: string;
  size: string;
  color: string;
  barcode: string;
  sell_price: number;
  price_offline: number;
  image_url: string;
};

type TransitionFn = (scope: () => void | Promise<void>) => void;

function AddProductForm({
  canEditPrice,
  onClose,
  pending,
  startTransition,
  toast,
  router,
}: {
  canEditPrice: boolean;
  onClose: () => void;
  pending: boolean;
  startTransition: TransitionFn;
  toast: ReturnType<typeof useToast>;
  router: ReturnType<typeof useRouter>;
}) {
  const [form, setForm] = useState<AddFormState>({
    brand: "",
    model: "",
    sku: "",
    size: "",
    color: "",
    barcode: "",
    sell_price: 0,
    price_offline: 0,
    image_url: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  async function handlePhotoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.push("File harus berupa gambar", "error");
      return;
    }
    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage
      .from("product-photos")
      .upload(path, file, { upsert: false, cacheControl: "3600" });
    if (error) {
      toast.push(`Gagal upload foto: ${error.message}`, "error");
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("product-photos").getPublicUrl(path);
    setForm((f) => ({ ...f, image_url: data.publicUrl }));
    setUploading(false);
  }

  function handleSubmit() {
    setFieldErrors({});
    startTransition(async () => {
      const result = await createProduct({
        brand: form.brand,
        model: form.model,
        sku: form.sku,
        size: Number(form.size),
        color: form.color,
        barcode: form.barcode,
        sell_price: form.sell_price,
        price_offline: form.price_offline || form.sell_price,
        image_url: form.image_url.trim() || null,
        quantity: 0,
        hpp: 0,
      });
      if ("error" in result && result.error) {
        const errs: Record<string, string> = {};
        for (const [k, v] of Object.entries(result.error)) {
          if (Array.isArray(v) && v[0]) errs[k] = v[0];
        }
        setFieldErrors(errs);
        toast.push("Gagal menambah produk", "error");
        return;
      }
      toast.push("Produk berhasil ditambahkan", "success");
      onClose();
      router.refresh();
    });
  }

  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-white">Tambah Produk Baru</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <FieldLabel htmlFor="add-brand">Brand</FieldLabel>
          <Input
            id="add-brand"
            value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
            placeholder="Adidas"
          />
        </div>
        <div>
          <FieldLabel htmlFor="add-model">Model</FieldLabel>
          <Input
            id="add-model"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder="Samba White"
          />
        </div>
        <div>
          <FieldLabel htmlFor="add-sku">SKU</FieldLabel>
          <Input
            id="add-sku"
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
            placeholder="ADS-SAMBA-WHT-42"
          />
        </div>
        <div>
          <FieldLabel htmlFor="add-size">Size</FieldLabel>
          <Input
            id="add-size"
            type="number"
            step="0.5"
            value={form.size}
            onChange={(e) => setForm({ ...form, size: e.target.value })}
            placeholder="42"
          />
        </div>
        <div>
          <FieldLabel htmlFor="add-color">Warna</FieldLabel>
          <Input
            id="add-color"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            placeholder="Cloud White"
          />
        </div>
        <div>
          <FieldLabel htmlFor="add-barcode">Barcode</FieldLabel>
          <Input
            id="add-barcode"
            value={form.barcode}
            onChange={(e) => setForm({ ...form, barcode: e.target.value })}
            placeholder="104163"
          />
        </div>
        <div className="sm:col-span-3">
          <FieldLabel htmlFor="add-image">Foto Produk</FieldLabel>
          {form.image_url ? (
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.image_url}
                alt="Pratinjau"
                className="size-12 flex-shrink-0 rounded-lg border border-white/10 object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-emerald-400">✓ Foto terpasang</p>
                <p className="text-[11px] text-white/30">Tersimpan aman di storage</p>
              </div>
              <label className="flex-shrink-0 cursor-pointer rounded-lg border border-white/[0.08] px-3 py-1.5 text-[12px] text-white/70 transition hover:bg-white/[0.06]">
                {uploading ? "…" : "Ganti"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                  disabled={uploading}
                />
              </label>
              <button
                type="button"
                onClick={() => setForm({ ...form, image_url: "" })}
                className="flex-shrink-0 text-[12px] text-white/40 transition hover:text-rose-300"
              >
                Hapus
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <label
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white/80 transition cursor-pointer hover:bg-white/[0.08]",
                  uploading && "pointer-events-none opacity-50",
                )}
              >
                {uploading ? "Mengunggah…" : "Upload dari galeri / HP"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                  disabled={uploading}
                />
              </label>
              <Input
                id="add-image"
                type="url"
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                placeholder="atau paste link gambar…"
              />
            </div>
          )}
          <p className="mt-1 text-[11px] text-white/40">
            Upload dari galeri/HP, atau paste URL gambar.
          </p>
        </div>
        {canEditPrice && (
          <>
            <div>
              <FieldLabel htmlFor="add-price-online">
                Harga Online (Rp)
              </FieldLabel>
              <Input
                id="add-price-online"
                type="number"
                value={form.sell_price}
                onChange={(e) =>
                  setForm({ ...form, sell_price: Number(e.target.value) })
                }
              />
              <p className="mt-1 text-[11px] text-white/40">
                Shopee / TikTok / marketplace
              </p>
            </div>
            <div>
              <FieldLabel htmlFor="add-price-offline">
                Harga Offline (Rp)
              </FieldLabel>
              <Input
                id="add-price-offline"
                type="number"
                value={form.price_offline}
                onChange={(e) =>
                  setForm({ ...form, price_offline: Number(e.target.value) })
                }
              />
              <p className="mt-1 text-[11px] text-white/40">
                WA / transfer langsung / website
              </p>
            </div>
          </>
        )}
      </div>
      {fieldErrors._form && (
        <Alert tone="error" className="mt-3">
          {fieldErrors._form}
        </Alert>
      )}
      <div className="mt-4 flex gap-2">
        <Button size="sm" disabled={pending} onClick={handleSubmit}>
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Batal
        </Button>
      </div>
    </Card>
  );
}
