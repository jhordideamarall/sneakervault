"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Card, Badge } from "@sneakervault/ui";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileUp,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Link2,
  Search,
  X,
} from "lucide-react";
import {
  parseMarketplaceFile,
  isExpectedOrderTemplate,
  type MarketplaceChannel,
  type MarketplaceOrder,
} from "@/lib/marketplace/parsers";
import {
  reconcileMarketplaceOrders,
  commitMarketplaceOrders,
  mapMarketplaceSku,
  searchProductsForMapping,
  createMissingProductsFromMarketplaceOrders,
  createProductFromMarketplaceLine,
  topUpProductStockForMarketplaceImport,
  type ReconcileResult,
  type OrderDiff,
  type CommitResult,
} from "@/lib/actions/marketplace-import";

type ImportState = "upload" | "review" | "processing" | "result";

const DRAFT_KEY = "sneakervault:marketplace-import-review";

const CHANNELS: { id: MarketplaceChannel; label: string; dot: string; badge: string }[] = [
  { id: "shopee", label: "Shopee", dot: "bg-orange-500", badge: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  { id: "tokopedia", label: "Tokopedia", dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  { id: "tiktok", label: "TikTok", dot: "bg-pink-500", badge: "bg-pink-500/10 text-pink-400 border-pink-500/20" },
];

function isStockExportTemplate(rows: Record<string, unknown>[]): boolean {
  const keys = new Set(Object.keys(rows[0] ?? {}).map((key) => key.trim().toLowerCase()));
  return (
    keys.has("et_title_product_id") ||
    keys.has("et_title_variation_stock") ||
    keys.has("warehouse_quantity")
  );
}

export function ImportMarketplaceClient() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ImportState>("upload");
  const [channel, setChannel] = useState<MarketplaceChannel>("shopee");
  const [fileName, setFileName] = useState<string>("");
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [diff, setDiff] = useState<ReconcileResult | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const channelMeta = CHANNELS.find((c) => c.id === channel)!;

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        channel?: MarketplaceChannel;
        fileName?: string;
        orders?: MarketplaceOrder[];
      };
      if (!draft.channel || !Array.isArray(draft.orders) || draft.orders.length === 0) return;
      queueMicrotask(() => {
        setChannel(draft.channel!);
        setFileName(draft.fileName ?? "Draft import marketplace");
        setOrders(draft.orders!);
        startTransition(async () => {
          try {
            await runReconcile(draft.channel!, draft.orders!);
            setState("review");
          } catch {
            sessionStorage.removeItem(DRAFT_KEY);
          }
        });
      });
    } catch (error) {
      void error;
      sessionStorage.removeItem(DRAFT_KEY);
    }
  }, []);

  function saveDraft(ch: MarketplaceChannel, name: string, ords: MarketplaceOrder[]) {
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ channel: ch, fileName: name, orders: ords }),
      );
    } catch (error) {
      void error;
      // Best effort only; file can always be uploaded again.
    }
  }

  function reset() {
    setState("upload");
    setOrders([]);
    setDiff(null);
    setResult(null);
    setFileName("");
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch (error) {
      void error;
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function runReconcile(ch: MarketplaceChannel, ords: MarketplaceOrder[]) {
    const r = await reconcileMarketplaceOrders(ch, ords);
    setDiff(r);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const data = ev.target?.result;
      if (!data) return;
      try {
        const XLSX = await import("xlsx");
        const isCsv = file.name.toLowerCase().endsWith(".csv");
        const wb = XLSX.read(data, { type: isCsv ? "string" : "array" });
        const sheetName = wb.SheetNames[0];
        const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
        if (!sheet) {
          toast.push("File Excel tidak valid", "error");
          return;
        }
        const rows = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: "" }) as Record<string, unknown>[];
        if (rows.length === 0) {
          toast.push("File kosong", "error");
          return;
        }

        if (isStockExportTemplate(rows)) {
          toast.push(
            "File ini template update stok/harga. Pakai menu Penjualan → Export Stok, bukan Import Pesanan.",
            "error",
          );
          return;
        }

        if (!isExpectedOrderTemplate(channel, rows)) {
          toast.push(`Template tidak sesuai tab ${channelMeta.label}. Pilih tab marketplace yang benar lalu upload ulang.`, "error");
          return;
        }

        const parsed = parseMarketplaceFile(channel, rows);
        if (parsed.length === 0) {
          toast.push("Tidak ada order valid terbaca. Pastikan tab channel sesuai file.", "error");
          return;
        }

        setOrders(parsed);
        saveDraft(channel, file.name, parsed);
        startTransition(async () => {
          try {
            await runReconcile(channel, parsed);
            setState("review");
          } catch (error) {
            toast.push(
              error instanceof Error ? error.message : "Gagal mereview file import",
              "error",
            );
          }
        });
      } catch {
        toast.push("Gagal memproses file", "error");
      }
    };
    if (file.name.toLowerCase().endsWith(".csv")) reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  }

  function handleCommit() {
    startTransition(async () => {
      setState("processing");
      const r = await commitMarketplaceOrders(channel, orders, fileName);
      setResult(r);
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch (error) {
        void error;
      }
      setState("result");
      if (r.success > 0) toast.push(`${r.success} order berhasil diimport`, "success");
    });
  }

  async function handleMapped() {
    // Re-reconcile after a manual SKU map so statuses refresh.
    startTransition(async () => {
      await runReconcile(channel, orders);
    });
  }

  return (
    <div className="space-y-6">
      {state === "upload" && (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 rounded-full bg-white/5 p-4 text-white/40">
            <Upload size={32} />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-white">Import Pesanan Marketplace</h2>
          <p className="mb-6 max-w-sm text-sm text-white/50">
            Pilih channel, lalu upload laporan pesanan/order report. Jangan pakai template stok atau settlement di menu ini.
          </p>

          {/* Channel selector = explicit import source label */}
          <div className="mb-8 flex gap-2 rounded-lg border border-white/[0.06] bg-[#262626] p-1.5">
            {CHANNELS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setChannel(c.id)}
                className={
                  "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors " +
                  (channel === c.id
                    ? "bg-white/[0.1] text-white"
                    : "text-white/45 hover:bg-white/[0.04] hover:text-white/70")
                }
              >
                <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                {c.label}
              </button>
            ))}
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black transition-all hover:bg-white/90 active:scale-95">
            <FileUp size={18} />
            Upload Laporan Pesanan {channelMeta.label}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFile}
              className="hidden"
            />
          </label>
          <p className="mt-4 text-xs text-white/30">File order report Excel/CSV dari {channelMeta.label} Seller Center</p>
        </Card>
      )}

      {state === "review" && diff && (
        <ReviewDiff
          diff={diff}
          orders={orders}
          channel={channel}
          channelBadge={channelMeta.badge}
          channelLabel={channelMeta.label}
          fileName={fileName}
          pending={pending}
          onCancel={reset}
          onCommit={handleCommit}
          onMapped={handleMapped}
        />
      )}

      {state === "processing" && (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 size-10 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
          <p className="text-sm text-white/50">Menyimpan order ke sistem…</p>
        </Card>
      )}

      {state === "result" && result && (
        <ResultView result={result} channelLabel={channelMeta.label} onReset={reset} onInvoice={() => router.push("/penjualan/invoice")} />
      )}
    </div>
  );
}

function statusBadge(status: OrderDiff["status"]) {
  if (status === "ready") return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Siap</Badge>;
  if (status === "duplicate") return <Badge className="bg-white/[0.06] text-white/40 border-white/10">Sudah diimport</Badge>;
  return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">Perlu tindakan</Badge>;
}

function ReviewDiff({
  diff,
  orders,
  channel,
  channelBadge,
  channelLabel,
  fileName,
  pending,
  onCancel,
  onCommit,
  onMapped,
}: {
  diff: ReconcileResult;
  orders: MarketplaceOrder[];
  channel: MarketplaceChannel;
  channelBadge: string;
  channelLabel: string;
  fileName: string;
  pending: boolean;
  onCancel: () => void;
  onCommit: () => void;
  onMapped: () => void;
}) {
  const { summary } = diff;
  const toast = useToast();
  const [fixing, startFixing] = useTransition();

  function createAllMissingProducts() {
    startFixing(async () => {
      const result = await createMissingProductsFromMarketplaceOrders(channel, orders);
      if (result.errors.length > 0) {
        toast.push(`${result.created} produk dibuat, ${result.errors.length} gagal dibuat`, "info");
      } else {
        toast.push(`${result.created} produk dibuat dari order`, "success");
      }
      onMapped();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Badge className={channelBadge}>{channelLabel}</Badge>
          <h2 className="text-xl font-bold text-white">Review Import</h2>
          <span className="text-xs text-white/30">{fileName}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>Batal</Button>
          <Button onClick={onCommit} disabled={pending || summary.ready === 0}>
            {pending ? "Memproses…" : `Konfirmasi Import (${summary.ready})`}
            <ChevronRight size={16} className="ml-1" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <SummaryStat label="Siap" value={summary.ready} tone="text-emerald-400" />
        <SummaryStat label="Perlu tindakan" value={summary.blocked} tone="text-amber-400" />
        <SummaryStat label="Sudah diimport" value={summary.duplicate} tone="text-white/50" />
      </div>

      {summary.unmapped_skus.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-xs text-amber-200/80">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <strong>{summary.unmapped_skus.length} SKU belum dikenali.</strong>{" "}
              Petakan ke produk existing, atau buat produk baru dari data order. Mapping akan diingat untuk import berikutnya.
            </div>
            <Button size="sm" variant="secondary" onClick={createAllMissingProducts} disabled={fixing || pending}>
              {fixing ? "Membuat..." : "Buat Semua Produk"}
            </Button>
          </div>
        </div>
      )}

      {summary.missing_hpp_skus.length > 0 && (
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.06] px-4 py-3 text-xs text-sky-100/75">
          {summary.missing_hpp_skus.length} SKU HPP-nya masih 0. Import tetap bisa, tapi jurnal HPP/COGS dan laba belum final sampai HPP diisi lewat Barang Masuk, Stock Opname, atau cutover Accurate.
        </div>
      )}

      <div className="space-y-3">
        {diff.orders.map((order) => (
          <OrderRow key={order.order_id} order={order} channel={channel} onMapped={onMapped} />
        ))}
      </div>
    </div>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-white/[0.04] bg-[#262626] p-4">
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/30">{label}</div>
    </div>
  );
}

function OrderRow({ order, channel, onMapped }: { order: OrderDiff; channel: MarketplaceChannel; onMapped: () => void }) {
  const dim = order.status === "duplicate";
  return (
    <Card className={"border-white/[0.04] bg-[#262626] p-4 " + (dim ? "opacity-50" : "")}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-white/80">{order.order_id}</span>
          <span className="text-[11px] text-white/35">{order.order_date}</span>
        </div>
        {statusBadge(order.status)}
      </div>
      <div className="space-y-2">
        {order.lines.map((line, i) => (
          <LineRow key={i} line={line} channel={channel} disabled={dim} onMapped={onMapped} />
        ))}
      </div>
    </Card>
  );
}

function LineRow({
  line,
  channel,
  disabled,
  onMapped,
}: {
  line: OrderDiff["lines"][number];
  channel: MarketplaceChannel;
  disabled: boolean;
  onMapped: () => void;
}) {
  const [mapping, setMapping] = useState(false);
  return (
    <div className="rounded-lg bg-black/15 p-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs text-white/80" title={line.product_name}>{line.product_name || "—"}</div>
          <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-white/40">
            <span>SKU: {line.sku}</span>
            <span>·</span>
            <span>{line.qty}×</span>
            {line.variation_name && (
              <>
                <span>·</span>
                <span>{line.variation_name}</span>
              </>
            )}
          </div>
          {line.product && (
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-300/70">
              <Link2 size={11} />
              <span className="truncate">{line.product.label}</span>
              {line.via === "map" && <span className="text-white/30">(dipetakan)</span>}
              {line.cost_issue === "missing_hpp" && <span className="text-sky-300/80">(HPP 0)</span>}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          {line.issue === "ok" && <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">OK · stok {line.product?.quantity}</Badge>}
          {line.issue === "low_stock" && (
            <LowStockAction line={line} onMapped={onMapped} />
          )}
          {line.issue === "unmapped" && !disabled && (
            <div className="flex flex-wrap justify-end gap-2">
              <CreateProductAction line={line} channel={channel} onMapped={onMapped} />
              <Button size="sm" variant="secondary" onClick={() => setMapping((v) => !v)}>
                <Search size={13} className="mr-1" /> Petakan SKU
              </Button>
            </div>
          )}
        </div>
      </div>
      {mapping && (
        <SkuMapper
          channel={channel}
          marketplaceSku={line.sku}
          onClose={() => setMapping(false)}
          onMapped={() => {
            setMapping(false);
            onMapped();
          }}
        />
      )}
    </div>
  );
}

function CreateProductAction({
  line,
  channel,
  onMapped,
}: {
  line: OrderDiff["lines"][number];
  channel: MarketplaceChannel;
  onMapped: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function createProduct() {
    startTransition(async () => {
      const result = await createProductFromMarketplaceLine(channel, {
        sku: line.sku,
        qty: line.qty,
        unit_price: line.unit_price,
        product_name: line.product_name,
        variation_name: line.variation_name,
      });
      if (result.error) {
        toast.push(result.error, "error");
        return;
      }
      toast.push("Produk dibuat. HPP masih 0 sampai diisi.", "success");
      onMapped();
    });
  }

  return (
    <Button size="sm" variant="secondary" onClick={createProduct} disabled={pending}>
      {pending ? "Membuat..." : "Buat Produk"}
    </Button>
  );
}

function LowStockAction({
  line,
  onMapped,
}: {
  line: OrderDiff["lines"][number];
  onMapped: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const missing = Math.max(0, line.qty - Number(line.product?.quantity ?? 0));

  function addStock() {
    if (!line.product) return;
    startTransition(async () => {
      const result = await topUpProductStockForMarketplaceImport(line.product!.id, line.qty);
      if (result.error) {
        toast.push(result.error, "error");
        return;
      }
      toast.push(result.added ? `Stok ditambah ${result.added}` : "Stok sudah cukup", "success");
      onMapped();
    });
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Badge className="bg-red-500/10 text-red-400 border-red-500/20">Stok {line.product?.quantity} &lt; {line.qty}</Badge>
      {line.product && missing > 0 && (
        <Button size="sm" variant="secondary" onClick={addStock} disabled={pending}>
          {pending ? "Menambah..." : `Tambah stok ${missing}`}
        </Button>
      )}
    </div>
  );
}

function SkuMapper({
  channel,
  marketplaceSku,
  onClose,
  onMapped,
}: {
  channel: MarketplaceChannel;
  marketplaceSku: string;
  onClose: () => void;
  onMapped: () => void;
}) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchProductsForMapping>>>([]);
  const [pending, startTransition] = useTransition();

  function search(value: string) {
    setQ(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    startTransition(async () => setResults(await searchProductsForMapping(value)));
  }

  function choose(productId: string) {
    startTransition(async () => {
      const r = await mapMarketplaceSku(channel, marketplaceSku, productId);
      if (r.error) toast.push(r.error, "error");
      else {
        toast.push("SKU dipetakan", "success");
        onMapped();
      }
    });
  }

  return (
    <div className="mt-2 rounded-lg border border-white/10 bg-black/30 p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] text-white/40">Cari produk sistem untuk SKU <span className="font-mono text-white/60">{marketplaceSku}</span></span>
        <button onClick={onClose} className="text-white/30 hover:text-white/60"><X size={13} /></button>
      </div>
      <input
        autoFocus
        value={q}
        onChange={(e) => search(e.target.value)}
        placeholder="Brand / model / SKU / barcode…"
        className="w-full rounded-md border border-white/10 bg-[#1F1F1E] px-3 py-2 text-xs text-white placeholder:text-white/25 focus:border-white/25 focus:outline-none"
      />
      <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
        {pending && <div className="px-1 py-1 text-[11px] text-white/30">Mencari…</div>}
        {results.map((p) => (
          <button
            key={p.id}
            onClick={() => choose(p.id)}
            className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-white/70 hover:bg-white/[0.05]"
          >
            <span className="truncate">{p.label}</span>
            <span className="shrink-0 text-white/30">stok {p.quantity}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultView({
  result,
  channelLabel,
  onReset,
  onInvoice,
}: {
  result: CommitResult;
  channelLabel: string;
  onReset: () => void;
  onInvoice: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card className="border-white/[0.06] bg-[#262626] p-8 text-center">
        <div className="mb-4 flex justify-center">
          {result.errors.length === 0 ? (
            <div className="rounded-full bg-emerald-500/10 p-4 text-emerald-500"><CheckCircle2 size={48} /></div>
          ) : (
            <div className="rounded-full bg-amber-500/10 p-4 text-amber-500"><AlertCircle size={48} /></div>
          )}
        </div>
        <h2 className="mb-2 text-2xl font-bold text-white">Import Selesai</h2>
        <p className="mb-8 text-white/50">Hasil pemrosesan laporan {channelLabel}.</p>

        <div className="mb-8 grid grid-cols-3 gap-4">
          <div className="rounded-xl bg-white/[0.03] p-4">
            <div className="text-lg font-bold text-emerald-400">{result.success}</div>
            <div className="text-[10px] uppercase text-white/30">Berhasil</div>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-4">
            <div className="text-lg font-bold text-white/60">{result.skipped}</div>
            <div className="text-[10px] uppercase text-white/30">Dilewati</div>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-4">
            <div className="text-lg font-bold text-red-400">{result.errors.length}</div>
            <div className="text-[10px] uppercase text-white/30">Gagal</div>
          </div>
        </div>

        {result.errors.length > 0 && (
          <div className="mb-8 space-y-2 text-left">
            <div className="px-1 text-xs font-semibold uppercase tracking-wider text-white/40">Detail Kesalahan</div>
            <div className="max-h-60 space-y-1.5 overflow-y-auto rounded-xl bg-black/20 p-4 font-mono text-[11px]">
              {result.errors.map((err, i) => (
                <div key={i} className="flex gap-3 text-white/60">
                  <span className="text-red-400/80">[{err.order_id}]</span>
                  <span>{err.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onReset}>Import File Lain</Button>
          <Button className="flex-1" onClick={onInvoice}>Lihat Invoice</Button>
        </div>
      </Card>
    </div>
  );
}
