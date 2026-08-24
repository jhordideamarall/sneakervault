"use client";

import { useState, useMemo, useTransition, useEffect, type ChangeEvent } from "react";
import {
  Button,
  Input,
  Card,
  FieldLabel,
  Alert,
  cn,
  NumberInput,
} from "@sneakervault/ui";
import { formatRupiah } from "@/lib/format";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Package,
  Pencil,
  Search,
  ShieldAlert,
  Clock,
  ClipboardList,
  Plus,
  Trash2,
} from "lucide-react";
import { createProductVariantsBatch } from "@/lib/actions/products";
import { createClient } from "@sneakervault/supabase/client";
import { useToast } from "@/components/toast";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  size_label: string;
  color: string | null;
  barcode: string;
  quantity: number;
  hpp: number;
  sell_price: number;
  price_offline: number;
  price_website: number | null;
  price_shopee: number | null;
  price_tiktok: number | null;
  price_tokopedia: number | null;
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

type InventorySummary = {
  totalQty: number;
  normalQty: number;
  defectQty: number;
  dormantQty: number;
};

function groupByModel(products: Product[]): ModelGroup[] {
  const map = new Map<string, ModelGroup>();
  for (const p of products) {
    // Variant dikelompokkan per SKU (colorway). SKU = jangkar; size = variant.
    // Nama model boleh beda antar baris — yang menentukan grup adalah SKU.
    const key = p.sku;
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

function channelPrice(price: number | null | undefined, fallback: number) {
  return price ?? fallback;
}

// ─── Main Component ─────────────────────────────────────────────────────────
export function InventoryClient({
  products,
  total,
  totalModels,
  page,
  pageSize,
  searchQuery,
  summary,
  roles,
}: {
  products: Product[];
  total: number;
  totalModels: number;
  page: number;
  pageSize: number;
  searchQuery: string;
  summary: InventorySummary;
  roles: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const urlSearchParams = useSearchParams();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [pagePending, startPageTransition] = useTransition();
  const roleList = roles as Role[];

  const [searchState, setSearchState] = useState(() => ({
    source: searchQuery,
    value: searchQuery,
  }));
  const search = searchState.source === searchQuery ? searchState.value : searchQuery;
  const setSearch = (value: string) => setSearchState({ source: searchQuery, value });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Product | null>(null);
  const [conditionEditing, setConditionEditing] = useState<Product | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const showHpp = canSeeHpp(roleList);
  const canEditPrice = canEditPriceFn(roleList);
  const canEditInventory =
    roleList.includes("owner") || roleList.includes("admin_gudang");
  const canCreateProduct =
    canEditInventory || roleList.includes("finance");
  const canUseStockOpname =
    canEditInventory || roleList.includes("finance");
  const canChangeCondition = canChangeProductCondition(roleList);

  useLiveRefresh(["products"]);

  const paramsSnapshot = urlSearchParams.toString();

  useEffect(() => {
    const nextSearch = search.trim();
    if (nextSearch === searchQuery) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(paramsSnapshot);
      if (nextSearch) params.set("q", nextSearch);
      else params.delete("q");
      params.delete("page");
      const qs = params.toString();
      startPageTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, searchQuery, paramsSnapshot, pathname, router]);

  const displayProducts = products;

  const groups = useMemo(() => groupByModel(displayProducts), [displayProducts]);

  const totalPages = Math.max(1, Math.ceil(totalModels / pageSize));
  const fromModel = totalModels === 0 ? 0 : (page - 1) * pageSize + 1;
  const toModel = Math.min(page * pageSize, totalModels);

  function pushPage(nextPage: number) {
    const params = new URLSearchParams(paramsSnapshot);
    if (nextPage <= 1) params.delete("page");
    else params.set("page", String(nextPage));
    const qs = params.toString();
    startPageTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

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
            {fromModel}-{toModel} dari {totalModels} model · {total} SKU
            {searchQuery ? ` · filter "${searchQuery}"` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButtons
            title="Inventori Dewinst.id"
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
              "Harga Website",
              "Harga Shopee",
              "Harga TikTok",
              "Harga Tokopedia",
            ]}
            rows={displayProducts.map((p) => {
              const g = groups.find((gr) => gr.brand === p.brand && gr.model === p.model);
              const hppForRow = g ? g.avgHpp : p.hpp;
              return [
                p.brand,
                p.model,
                p.size_label,
                p.sku,
                p.barcode,
                p.quantity,
                p.condition,
                ...(showHpp ? [hppForRow] : []),
                p.sell_price,
                p.price_offline,
                channelPrice(p.price_website, p.sell_price),
                channelPrice(p.price_shopee, p.sell_price),
                channelPrice(p.price_tiktok, p.sell_price),
                channelPrice(p.price_tokopedia, p.sell_price),
              ];
            })}
            pdfLabel="Produk PDF"
            excelLabel="Produk Excel"
          />
          {canUseStockOpname && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => router.push("/inventory/opname")}
            >
              <ClipboardList size={14} />
              Stock Opname
            </Button>
          )}
          {canEditInventory && <BulkImportButton />}
          {canCreateProduct && (
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
        Menu ini untuk <strong>data produk internal</strong>: tambah SKU, ubah harga, dan export/import master produk.
        Bukan untuk laporan pesanan marketplace.
        <br />
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

      {pagePending && (
        <p className="text-[11px] text-white/40">Memuat hasil inventory...</p>
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
                canEdit={canEditInventory || canEditPrice}
                canChangeCondition={canChangeCondition}
                onEdit={setEditing}
                onChangeCondition={setConditionEditing}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-white/45">
        <span>
          Halaman {page.toLocaleString("id-ID")} dari {totalPages.toLocaleString("id-ID")}
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => pushPage(page - 1)}
            disabled={page <= 1 || pagePending}
          >
            <ChevronLeft size={14} className="mr-1" />
            Sebelumnya
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => pushPage(page + 1)}
            disabled={page >= totalPages || pagePending}
          >
            Selanjutnya
            <ChevronRight size={14} className="ml-1" />
          </Button>
        </div>
      </div>

      {/* Modals */}
      {editing && (
        <EditProductModal
          open={true}
          onOpenChange={(o) => !o && setEditing(null)}
          product={editing}
          canEditPrice={canEditPrice}
          canEditIdentity={canEditInventory}
          canEditImage={canEditInventory}
        />
      )}
      {conditionEditing && (
        <ConditionUpdaterModal
          open={true}
          onOpenChange={(o) => !o && setConditionEditing(null)}
          productId={conditionEditing.id}
          productLabel={`${conditionEditing.brand} ${conditionEditing.model} — size ${conditionEditing.size_label}`}
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
            <table className="w-full min-w-[1120px] text-xs [&_th]:px-3 [&_td]:px-3 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
              <thead>
                <tr className="text-left text-white/40">
                  <th className="py-2 font-medium">Size</th>
                  <th className="py-2 font-medium">SKU</th>
                  <th className="py-2 font-medium">Barcode</th>
                  <th className="py-2 text-right font-medium">Stok</th>
                  <th className="py-2 text-right font-medium">Online</th>
                  <th className="py-2 text-right font-medium">Offline</th>
                  <th className="py-2 text-right font-medium">Website</th>
                  <th className="py-2 text-right font-medium">Shopee</th>
                  <th className="py-2 text-right font-medium">TikTok</th>
                  <th className="py-2 text-right font-medium">Tokopedia</th>
                  <th className="py-2 pl-6 font-medium">Kondisi</th>
                  {(canEdit || canChangeCondition) && (
                    <th className="py-2 text-right font-medium"></th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {group.variants.map((v) => (
                  <tr key={v.id} className="transition-colors hover:bg-white/[0.02]">
                    <td className="py-2.5 font-semibold text-white">{v.size_label}</td>
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
                    <ChannelPriceCell value={v.price_website} fallback={v.sell_price} />
                    <ChannelPriceCell value={v.price_shopee} fallback={v.sell_price} />
                    <ChannelPriceCell value={v.price_tiktok} fallback={v.sell_price} />
                    <ChannelPriceCell value={v.price_tokopedia} fallback={v.sell_price} />
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

function ChannelPriceCell({
  value,
  fallback,
}: {
  value: number | null;
  fallback: number;
}) {
  const usesFallback = value == null;
  return (
    <td
      className={cn(
        "py-2.5 text-right tabular-nums",
        usesFallback ? "text-white/45" : "text-white",
      )}
      title={usesFallback ? "Belum diisi khusus, pakai Harga Online" : undefined}
    >
      {formatRupiah(channelPrice(value, fallback))}
    </td>
  );
}

// ─── Add Product Form ───────────────────────────────────────────────────────
type SharedAddFormState = {
  brand: string;
  model: string;
  sku: string;
  color: string;
  hpp: number;
  image_url: string;
};

type VariantAddFormState = {
  key: string;
  size_label: string;
  barcode: string;
  sell_price: number;
  price_offline: number;
  price_website: number;
  price_shopee: number;
  price_tiktok: number;
  price_tokopedia: number;
  channel_prices_open: boolean;
  channel_prices_custom: boolean;
};

type VariantPriceKey = Exclude<
  keyof VariantAddFormState,
  | "key"
  | "size_label"
  | "barcode"
  | "channel_prices_open"
  | "channel_prices_custom"
>;

type VariantChannelPriceKey = Extract<
  VariantPriceKey,
  | "price_website"
  | "price_shopee"
  | "price_tiktok"
  | "price_tokopedia"
>;

function emptyVariant(): VariantAddFormState {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    size_label: "",
    barcode: "",
    sell_price: 0,
    price_offline: 0,
    price_website: 0,
    price_shopee: 0,
    price_tiktok: 0,
    price_tokopedia: 0,
    channel_prices_open: false,
    channel_prices_custom: false,
  };
}

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
  const [shared, setShared] = useState<SharedAddFormState>({
    brand: "",
    model: "",
    sku: "",
    color: "",
    hpp: 0,
    image_url: "",
  });
  const [variants, setVariants] = useState<VariantAddFormState[]>([
    emptyVariant(),
  ]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  function updateVariant(
    key: string,
    patch: Partial<Omit<VariantAddFormState, "key">>,
  ) {
    setVariants((current) =>
      current.map((variant) =>
        variant.key === key ? { ...variant, ...patch } : variant,
      ),
    );
  }

  function updateVariantChannel(
    key: string,
    field: VariantChannelPriceKey,
    value: number,
  ) {
    setVariants((current) =>
      current.map((variant) => {
        if (variant.key !== key) return variant;
        return {
          ...variant,
          price_website: variant.channel_prices_custom
            ? variant.price_website
            : variant.sell_price,
          price_shopee: variant.channel_prices_custom
            ? variant.price_shopee
            : variant.sell_price,
          price_tiktok: variant.channel_prices_custom
            ? variant.price_tiktok
            : variant.sell_price,
          price_tokopedia: variant.channel_prices_custom
            ? variant.price_tokopedia
            : variant.sell_price,
          [field]: value,
          channel_prices_custom: true,
        };
      }),
    );
  }

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
    setShared((current) => ({ ...current, image_url: data.publicUrl }));
    setUploading(false);
  }

  function handleSubmit() {
    setFieldErrors({});
    startTransition(async () => {
      const result = await createProductVariantsBatch({
        sharedProduct: {
          brand: shared.brand,
          model: shared.model,
          sku: shared.sku,
          color: shared.color,
          hpp: canEditPrice ? shared.hpp : 0,
          image_url: shared.image_url.trim() || null,
        },
        variants: variants.map((variant) => ({
          size_label: variant.size_label,
          barcode: variant.barcode,
          sell_price: canEditPrice ? variant.sell_price : 0,
          price_offline: canEditPrice ? variant.price_offline : 0,
          price_website: canEditPrice
            ? variant.channel_prices_custom
              ? variant.price_website
              : variant.sell_price
            : 0,
          price_shopee: canEditPrice
            ? variant.channel_prices_custom
              ? variant.price_shopee
              : variant.sell_price
            : 0,
          price_tiktok: canEditPrice
            ? variant.channel_prices_custom
              ? variant.price_tiktok
              : variant.sell_price
            : 0,
          price_tokopedia: canEditPrice
            ? variant.channel_prices_custom
              ? variant.price_tokopedia
              : variant.sell_price
            : 0,
        })),
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
      toast.push(`${variants.length} variant size berhasil ditambahkan`, "success");
      onClose();
      router.refresh();
    });
  }

  const sharedIncomplete =
    !shared.brand.trim() ||
    !shared.model.trim() ||
    !shared.sku.trim() ||
    !shared.color.trim();
  const variantIncomplete = variants.some(
    (variant) => !variant.size_label.trim() || !variant.barcode.trim(),
  );

  return (
    <Card className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white">Tambah Produk Banyak Size</h3>
        <p className="mt-1 text-xs text-white/45">
          Isi detail colorway satu kali, lalu tambahkan barcode dan harga untuk setiap size.
        </p>
      </div>

      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
          Detail bersama
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <FieldLabel htmlFor="add-brand">Brand</FieldLabel>
          <Input
            id="add-brand"
            value={shared.brand}
            onChange={(e) => setShared({ ...shared, brand: e.target.value })}
            placeholder="Adidas"
          />
        </div>
        <div>
          <FieldLabel htmlFor="add-model">Model</FieldLabel>
          <Input
            id="add-model"
            value={shared.model}
            onChange={(e) => setShared({ ...shared, model: e.target.value })}
            placeholder="Samba White"
          />
        </div>
        <div>
          <FieldLabel htmlFor="add-sku">SKU</FieldLabel>
          <Input
            id="add-sku"
            value={shared.sku}
            onChange={(e) => setShared({ ...shared, sku: e.target.value })}
            placeholder="ADS-SAMBA-WHT"
          />
        </div>
        <div>
          <FieldLabel htmlFor="add-color">Warna</FieldLabel>
          <Input
            id="add-color"
            value={shared.color}
            onChange={(e) => setShared({ ...shared, color: e.target.value })}
            placeholder="Cloud White"
          />
        </div>
        </div>

        <div>
          <FieldLabel htmlFor="add-image">Foto Produk</FieldLabel>
          {shared.image_url ? (
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shared.image_url}
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
                onClick={() => setShared({ ...shared, image_url: "" })}
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
                value={shared.image_url}
                onChange={(e) => setShared({ ...shared, image_url: e.target.value })}
                placeholder="atau paste link gambar…"
              />
            </div>
          )}
          <p className="mt-1 text-[11px] text-white/40">
            Upload dari galeri/HP, atau paste URL gambar.
          </p>
        </div>
        {canEditPrice ? (
          <div className="max-w-sm">
              <FieldLabel htmlFor="add-hpp">
                HPP / Modal (Rp)
              </FieldLabel>
              <NumberInput
                id="add-hpp"
                align="left"
                placeholder="0"
                value={shared.hpp}
                onValueChange={(n) => setShared({ ...shared, hpp: n })}
              />
              <p className="mt-1 text-[11px] text-white/40">
                Satu HPP untuk seluruh size dalam SKU
              </p>
          </div>
        ) : (
          <Alert tone="info">
            HPP dan harga jual akan disimpan 0. Owner/Finance dapat melengkapinya lewat Edit Produk.
          </Alert>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
              Variant size
            </p>
            <p className="mt-1 text-[11px] text-white/35">
              Isi empat data utama per size. Harga marketplace mengikuti harga online kecuali diatur khusus.
            </p>
          </div>
          <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] text-white/45">
            {variants.length} size
          </span>
        </div>

        {variants.map((variant, index) => (
          <div
            key={variant.key}
            className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-white/55">Size #{index + 1}</p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={variants.length === 1}
                onClick={() =>
                  setVariants((current) =>
                    current.filter((item) => item.key !== variant.key),
                  )
                }
                aria-label={`Hapus variant size ${index + 1}`}
              >
                <Trash2 size={14} />
              </Button>
            </div>

            <div
              className={cn(
                "grid gap-3",
                canEditPrice
                  ? "sm:grid-cols-2 xl:grid-cols-[minmax(100px,0.65fr)_minmax(180px,1.2fr)_minmax(145px,1fr)_minmax(145px,1fr)]"
                  : "sm:grid-cols-2",
              )}
            >
              <div>
                <FieldLabel htmlFor={`add-size-${variant.key}`}>Size</FieldLabel>
                <Input
                  id={`add-size-${variant.key}`}
                  value={variant.size_label}
                  onChange={(event) =>
                    updateVariant(variant.key, { size_label: event.target.value })
                  }
                  placeholder="42 atau 42 2/3"
                />
              </div>
              <div>
                <FieldLabel htmlFor={`add-barcode-${variant.key}`}>Barcode Accurate</FieldLabel>
                <Input
                  id={`add-barcode-${variant.key}`}
                  value={variant.barcode}
                  onChange={(event) =>
                    updateVariant(variant.key, { barcode: event.target.value })
                  }
                  placeholder="104163"
                  className="font-mono"
                />
              </div>
              {canEditPrice && (
                <>
                  <div>
                    <FieldLabel htmlFor={`sell-price-${variant.key}`}>
                      Harga Online (Rp)
                    </FieldLabel>
                    <NumberInput
                      id={`sell-price-${variant.key}`}
                      min={0}
                      align="left"
                      value={variant.sell_price}
                      onValueChange={(value) =>
                        updateVariant(variant.key, { sell_price: value })
                      }
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor={`offline-price-${variant.key}`}>
                      Harga Offline (Rp)
                    </FieldLabel>
                    <NumberInput
                      id={`offline-price-${variant.key}`}
                      min={0}
                      align="left"
                      value={variant.price_offline}
                      onValueChange={(value) =>
                        updateVariant(variant.key, { price_offline: value })
                      }
                    />
                  </div>
                </>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-white/30">
                Barcode dikunci setelah produk disimpan.
              </p>
              {canEditPrice && (
                <button
                  type="button"
                  aria-expanded={variant.channel_prices_open}
                  onClick={() =>
                    updateVariant(variant.key, {
                      channel_prices_open: !variant.channel_prices_open,
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-cyan-300/75 transition hover:bg-cyan-400/[0.07] hover:text-cyan-200"
                >
                  {variant.channel_prices_custom
                    ? "Harga marketplace khusus"
                    : "Atur harga marketplace"}
                  <ChevronDown
                    size={13}
                    className={cn(
                      "transition-transform",
                      variant.channel_prices_open && "rotate-180",
                    )}
                  />
                </button>
              )}
            </div>

            {canEditPrice && variant.channel_prices_open && (
              <div className="mt-3 rounded-lg border border-white/[0.06] bg-black/10 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-white/40">
                    Kosong dari pengaturan khusus = mengikuti harga online.
                  </p>
                  {variant.channel_prices_custom && (
                    <button
                      type="button"
                      onClick={() =>
                        updateVariant(variant.key, {
                          channel_prices_custom: false,
                        })
                      }
                      className="text-[11px] font-medium text-cyan-300/75 hover:text-cyan-200"
                    >
                      Samakan dengan harga online
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {(
                    [
                      ["price_website", "Website"],
                      ["price_shopee", "Shopee"],
                      ["price_tiktok", "TikTok"],
                      ["price_tokopedia", "Tokopedia"],
                    ] as Array<[VariantChannelPriceKey, string]>
                  ).map(([field, label]) => (
                    <div key={field}>
                      <FieldLabel htmlFor={`${field}-${variant.key}`}>
                        {label} (Rp)
                      </FieldLabel>
                      <NumberInput
                        id={`${field}-${variant.key}`}
                        min={0}
                        align="left"
                        value={
                          variant.channel_prices_custom
                            ? variant[field]
                            : variant.sell_price
                        }
                        onValueChange={(value) =>
                          updateVariantChannel(variant.key, field, value)
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() => setVariants((current) => [...current, emptyVariant()])}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.12] px-4 py-3 text-sm font-medium text-white/55 transition hover:border-cyan-400/30 hover:bg-cyan-400/[0.04] hover:text-cyan-200"
        >
          <Plus size={15} />
          Tambah size berikutnya
        </button>
      </div>

      {fieldErrors._form && (
        <Alert tone="error">
          {fieldErrors._form}
        </Alert>
      )}
      {fieldErrors.sharedProduct && (
        <Alert tone="error">{fieldErrors.sharedProduct}</Alert>
      )}
      {fieldErrors.variants && <Alert tone="error">{fieldErrors.variants}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pending || uploading || sharedIncomplete || variantIncomplete}
          onClick={handleSubmit}
        >
          {pending ? "Menyimpan semua…" : `Simpan ${variants.length} Variant`}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Batal
        </Button>
      </div>
    </Card>
  );
}
