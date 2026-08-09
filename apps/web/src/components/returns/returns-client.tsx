"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowRight,
  ClipboardList,
  PackageCheck,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { initiateReturn, processReturn, verifyReturn } from "@/lib/actions/returns";
import {
  Alert,
  Badge,
  Button,
  Card,
  FieldError,
  FieldLabel,
  Input,
  Select,
  Textarea,
} from "@sneakervault/ui";
import { useToast } from "@/components/toast";
import { RETURN_STATUS_LABELS as statusLabel, RETURN_STATUS_TONES as statusTones } from "@sneakervault/shared";
import { formatDate as formatDateBase } from "@/lib/format";

type ReturnRow = Record<string, unknown> & {
  id: string;
  type: "exchange_size" | "refund";
  reason: string;
  status: "pending" | "verified" | "processed" | "cancelled";
  original_size: number;
  new_size: number | null;
  created_at: string;
  verified_at: string | null;
  processed_at: string | null;
  original_product_id: string;
  original?: { brand: string; model: string; size: number; size_label?: string | null } | null;
  new?: { brand: string; model: string; size: number; size_label?: string | null } | null;
  packing_items?: {
    id: string;
    packing_sessions?: { platform_order_id: string | null; platform: string } | null;
  } | null;
};

type ReturnableItem = Record<string, unknown> & {
  id: string;
  barcode_scanned: string;
  products?: { id: string; brand: string; model: string; size: number; size_label?: string | null; sku: string } | null;
  packing_sessions?: { platform_order_id: string | null; platform: string } | null;
};

const typeLabel: Record<ReturnRow["type"], string> = {
  exchange_size: "Tukar Size",
  refund: "Refund",
};

function formatDate(value: string | null) {
  return value ? formatDateBase(value) : "—";
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function ReturnsClient({
  returns,
  returnableItems,
  roles,
}: {
  returns: ReturnRow[];
  returnableItems: ReturnableItem[];
  roles: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"list" | "initiate">("list");

  const canInitiate = roles.includes("owner") || roles.includes("admin_online");
  const canVerify = roles.includes("owner") || roles.includes("admin_gudang");
  const canProcess = canVerify;

  const stats = useMemo(() => {
    const pendingCount = returns.filter((item) => item.status === "pending").length;
    const verifiedCount = returns.filter((item) => item.status === "verified").length;
    const processedCount = returns.filter((item) => item.status === "processed").length;

    return {
      total: returns.length,
      pending: pendingCount,
      verified: verifiedCount,
      processed: processedCount,
    };
  }, [returns]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/[0.06] bg-[#262626] p-6">
        <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-start 2xl:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.05] text-white/80">
                <RotateCcw size={20} strokeWidth={1.8} />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white">Retur</h1>
                <p className="text-sm text-white/50">
                  Pantau retur, verifikasi barang fisik, dan proses refund atau tukar size.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant={tab === "list" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setTab("list")}
              >
                <ClipboardList size={14} strokeWidth={1.8} />
                Daftar Retur
              </Button>
              {canInitiate ? (
                <Button
                  variant={tab === "initiate" ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setTab("initiate")}
                >
                  <Undo2 size={14} strokeWidth={1.8} />
                  Buat Retur
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:max-w-[560px] 2xl:flex-1">
            <StatCard label="Total Retur" value={stats.total} tone="default" />
            <StatCard label="Menunggu" value={stats.pending} tone="warning" />
            <StatCard label="Terverifikasi" value={stats.verified} tone="info" />
            <StatCard label="Selesai" value={stats.processed} tone="success" />
          </div>
        </div>
      </section>

      {tab === "list" ? (
        <ReturnsList
          returns={returns}
          canVerify={canVerify}
          canProcess={canProcess}
          pending={pending}
          onVerify={(id) => {
            startTransition(async () => {
              const result = await verifyReturn(id);
              if ("error" in result && typeof result.error === "string") {
                toast.push(result.error, "error");
                return;
              }
              toast.push("Retur berhasil diverifikasi", "success");
              router.refresh();
            });
          }}
          onProcess={(id, type, newProductId) => {
            startTransition(async () => {
              const result = await processReturn({
                return_id: id,
                new_product_id: type === "exchange_size" ? newProductId : undefined,
              });
              if ("error" in result && result.error) {
                const msg = (result.error as { _form?: string[] })._form?.[0] ?? "Gagal memproses retur";
                toast.push(msg, "error");
                return;
              }
              toast.push(
                type === "refund"
                  ? "Barang refund sudah masuk dan HPP dibalik. Pengembalian uang dicatat terpisah di Kas & Bank."
                  : "Tukar size selesai; stok dan jurnal HPP sudah disesuaikan.",
                "success",
              );
              router.refresh();
            });
          }}
        />
      ) : (
        <InitiateReturnForm
          items={returnableItems}
          pending={pending}
          onSubmit={(itemId, type, reason) => {
            startTransition(async () => {
              const result = await initiateReturn({ packing_item_id: itemId, type, reason });
              if ("error" in result && result.error) {
                const msg = (result.error as { _form?: string[] })._form?.[0] ?? "Gagal membuat retur";
                toast.push(msg, "error");
                return;
              }
              toast.push("Retur dibuat dan menunggu verifikasi gudang", "success");
              router.refresh();
              setTab("list");
            });
          }}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "default" | "warning" | "info" | "success";
}) {
  const toneClasses = {
    default: "text-white/80",
    warning: "text-amber-300",
    info: "text-sky-300",
    success: "text-emerald-300",
  } as const;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
      <p className="min-h-8 text-[11px] leading-4 uppercase tracking-[0.1em] text-white/60">{label}</p>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", toneClasses[tone])}>{value}</p>
    </div>
  );
}

function ReturnsList({
  returns,
  canVerify,
  canProcess,
  pending,
  onVerify,
  onProcess,
}: {
  returns: ReturnRow[];
  canVerify: boolean;
  canProcess: boolean;
  pending: boolean;
  onVerify: (id: string) => void;
  onProcess: (id: string, type: ReturnRow["type"], newProductId?: string) => void;
}) {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | ReturnRow["status"]>("all");
  const [query, setQuery] = useState("");

  const filteredReturns = useMemo(() => {
    const lowered = query.trim().toLowerCase();

    return returns.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!lowered) return true;

      const haystack = [
        item.reason,
        item.original?.brand,
        item.original?.model,
        item.packing_items?.packing_sessions?.platform_order_id,
        typeLabel[item.type],
        statusLabel[item.status],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(lowered);
    });
  }, [query, returns, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-[#262626] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search
            size={16}
            strokeWidth={1.8}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari order, produk, alasan retur"
            className="pl-10"
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-[220px]">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | ReturnRow["status"])}>
              <option value="all">Semua status</option>
              <option value="pending">Menunggu verifikasi</option>
              <option value="verified">Siap diproses</option>
              <option value="processed">Selesai diproses</option>
              <option value="cancelled">Dibatalkan</option>
            </Select>
          </div>
          <p className="text-xs text-white/60">
            Menampilkan {filteredReturns.length} dari {returns.length} retur
          </p>
        </div>
      </div>

      {filteredReturns.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.04] text-white/45">
            <PackageCheck size={20} strokeWidth={1.8} />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-white/85">Belum ada retur yang cocok</h2>
          <p className="mt-2 text-sm text-white/60">
            Coba ubah filter, kata kunci pencarian, atau buat retur baru dari item yang sudah dikirim.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredReturns.map((item) => (
            <Card key={item.id} className="p-0 overflow-hidden">
              <div className="border-b border-white/[0.06] px-5 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={statusTones[item.status] ?? "default"}>{statusLabel[item.status]}</Badge>
                      <Badge tone="default">{typeLabel[item.type]}</Badge>
                      <span className="text-xs text-white/35">Dibuat {formatDate(item.created_at)}</span>
                    </div>

                    <div>
                      <h3 className="text-base font-semibold text-white/90">
                        {item.original?.brand} {item.original?.model}
                      </h3>
                      <p className="mt-1 text-sm text-white/45">
                        Order {item.packing_items?.packing_sessions?.platform_order_id ?? "—"} • Platform{" "}
                        {(item.packing_items?.packing_sessions?.platform ?? "—").toUpperCase()}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {item.status === "pending" && canVerify ? (
                      <Button size="sm" variant="secondary" onClick={() => onVerify(item.id)} disabled={pending}>
                        <ShieldCheck size={14} strokeWidth={1.8} />
                        Verifikasi Fisik
                      </Button>
                    ) : null}

                    {item.status === "verified" && canProcess ? (
                      item.type === "refund" ? (
                        <Button size="sm" variant="success" onClick={() => onProcess(item.id, "refund")} disabled={pending}>
                          <RefreshCcw size={14} strokeWidth={1.8} />
                          Terima Barang Refund
                        </Button>
                      ) : (
                        <Button size="sm" variant="success" onClick={() => setProcessingId(item.id)} disabled={pending}>
                          <ArrowRight size={14} strokeWidth={1.8} />
                          Pilih Size Pengganti
                        </Button>
                      )
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 px-5 py-4 md:grid-cols-2 xl:grid-cols-4">
                <InfoBlock label="Barang Awal" value={`Size ${item.original?.size_label ?? item.original_size}`} />
                <InfoBlock label="Pengganti" value={item.new ? `Size ${item.new.size_label ?? item.new.size}` : item.type === "refund" ? "Refund" : "Belum dipilih"} />
                <InfoBlock label="Diverifikasi" value={formatDate(item.verified_at)} />
                <InfoBlock label="Diproses" value={formatDate(item.processed_at)} />
              </div>

              <div className="border-t border-white/[0.06] px-5 py-4">
                <p className="text-[11px] uppercase tracking-[0.14em] text-white/30">Alasan Retur</p>
                <p className="mt-2 text-sm leading-6 text-white/75">{item.reason}</p>
              </div>

              {processingId === item.id && item.type === "exchange_size" ? (
                <ExchangeModal
                  returnRow={item}
                  onCancel={() => setProcessingId(null)}
                  onConfirm={(newProductId) => {
                    onProcess(item.id, "exchange_size", newProductId);
                    setProcessingId(null);
                  }}
                  pending={pending}
                />
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-white/30">{label}</p>
      <p className="mt-2 text-sm font-medium text-white/80">{value}</p>
    </div>
  );
}

function ExchangeModal({
  returnRow,
  onCancel,
  onConfirm,
  pending,
}: {
  returnRow: ReturnRow;
  onCancel: () => void;
  onConfirm: (newProductId: string) => void;
  pending: boolean;
}) {
  const [products, setProducts] = useState<{ id: string; size: number; size_label?: string | null; quantity: number }[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch(
          `/api/products-by-model?brand=${encodeURIComponent(returnRow.original?.brand ?? "")}&model=${encodeURIComponent(returnRow.original?.model ?? "")}`,
        );

        if (!alive) return;

        if (res.ok) {
          const data = (await res.json()) as { id: string; size: number; size_label?: string | null; quantity: number }[];
          setProducts(data.filter((product) => product.id !== returnRow.original_product_id));
        }
      } catch {
        if (alive) setProducts([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [returnRow]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Pilih Size Pengganti</h2>
            <p className="mt-1 text-sm text-white/45">
              {returnRow.original?.brand} {returnRow.original?.model} • size awal {returnRow.original_size}
            </p>
          </div>
          <Badge tone="info">Tukar Size</Badge>
        </div>

        <div className="mt-5 space-y-4">
          {loading ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-sm text-white/45">
              Memuat daftar size yang tersedia...
            </div>
          ) : products.length === 0 ? (
            <Alert tone="warning">Tidak ada size pengganti lain yang tersedia untuk model ini.</Alert>
          ) : (
            <div>
              <FieldLabel htmlFor="return-replacement-product" required>Pilih size pengganti</FieldLabel>
              <Select id="return-replacement-product" value={selected} onChange={(e) => setSelected(e.target.value)}>
                <option value="">-- Pilih size --</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id} disabled={product.quantity === 0}>
                    Size {product.size_label ?? product.size} — stok {product.quantity}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel}>
            Batal
          </Button>
          <Button onClick={() => onConfirm(selected)} disabled={!selected || pending || loading}>
            Konfirmasi
          </Button>
        </div>
      </Card>
    </div>
  );
}

function InitiateReturnForm({
  items,
  pending,
  onSubmit,
}: {
  items: ReturnableItem[];
  pending: boolean;
  onSubmit: (itemId: string, type: "exchange_size" | "refund", reason: string) => void;
}) {
  const [itemId, setItemId] = useState("");
  const [type, setType] = useState<"exchange_size" | "refund">("exchange_size");
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function submit() {
    const errors: Record<string, string> = {};
    if (!itemId) errors.item = "Pilih item yang ingin diretur";
    if (!reason.trim()) errors.reason = "Alasan retur wajib diisi";

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    onSubmit(itemId, type, reason.trim());
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <Card>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.05] text-white/75">
            <Undo2 size={18} strokeWidth={1.8} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Buat Retur Baru</h2>
            <p className="text-sm text-white/45">
              Pilih item yang sudah dikirim, lalu catat tipe dan alasan retur customer.
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <FieldLabel htmlFor="return-packing-item" required>Item dari order</FieldLabel>
            <Select id="return-packing-item" value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">-- Pilih item dari order yang sudah dikirim --</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {(item.packing_sessions?.platform_order_id ?? "(tanpa order id)")} — {item.products?.brand} {item.products?.model} size {item.products?.size_label ?? item.products?.size}
                </option>
              ))}
            </Select>
            <FieldError message={fieldErrors.item} />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <FieldLabel htmlFor="return-type" required>Tipe retur</FieldLabel>
              <Select id="return-type" value={type} onChange={(e) => setType(e.target.value as "exchange_size" | "refund")}>
                <option value="exchange_size">Tukar Size</option>
                <option value="refund">Refund</option>
              </Select>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/30">Alur berikutnya</p>
              <p className="mt-2 text-sm text-white/70">
                {type === "exchange_size"
                  ? "Gudang verifikasi barang dulu, lalu pilih size pengganti sebelum stok keluar lagi."
                  : "Gudang verifikasi barang, lalu barang masuk kembali dan HPP dibalik. Pengembalian uang wajib dicatat terpisah di Kas & Bank."}
              </p>
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="return-reason" required>Alasan retur</FieldLabel>
            <Textarea
              id="return-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: size kekecilan, customer minta tukar ke size 42"
            />
            <FieldError message={fieldErrors.reason} />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={submit} disabled={pending}>
            {pending ? "Memproses..." : "Kirim Permintaan Retur"}
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/40">Checklist Operasional</h3>
        <div className="mt-5 space-y-4 text-sm text-white/65">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            1. Pastikan order memang sudah dikirim dan item sesuai dengan keluhan customer.
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            2. Tulis alasan retur sejelas mungkin supaya tim gudang bisa verifikasi fisik lebih cepat.
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            3. Setelah status berubah ke "Siap Diproses", admin gudang bisa menjalankan refund atau tukar size.
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            4. Item yang sudah pernah diretur tidak akan muncul lagi di daftar ini.
          </div>
          <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-4 text-amber-100/75">
            5. Untuk refund, proses di halaman ini hanya menerima barang dan membalik HPP. Catat uang keluar sesuai rekening tujuan di Kas &amp; Bank agar audit jelas.
          </div>
        </div>
      </Card>
    </div>
  );
}
