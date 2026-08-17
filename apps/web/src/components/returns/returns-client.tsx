"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowRight,
  ClipboardList,
  Landmark,
  PackageCheck,
  Plus,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Undo2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { initiateReturn, processReturn, verifyReturn } from "@/lib/actions/returns";
import { createBankAccount } from "@/lib/actions/bank-accounts";
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
import { formatRupiah } from "@/lib/format";
import type { BankAccountRow } from "@/lib/queries";

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
    sell_price: number;
    packing_sessions?: { platform_order_id: string | null; platform: string } | null;
  } | null;
  refund_amount: number | null;
  refund_date: string | null;
  refund_reference_no: string | null;
  refund_bank?: {
    id: string;
    name: string;
    bank_name: string | null;
    type: BankAccountRow["type"];
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
  bankAccounts,
  roles,
}: {
  returns: ReturnRow[];
  returnableItems: ReturnableItem[];
  bankAccounts: BankAccountRow[];
  roles: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"list" | "initiate">("list");

  const canInitiate = roles.includes("owner") || roles.includes("admin_online");
  const canVerify = roles.includes("owner") || roles.includes("admin_gudang");
  const canProcessExchange =
    roles.includes("owner") ||
    roles.includes("admin_gudang") ||
    roles.includes("admin_online");
  const canSettleRefund = roles.includes("owner") || roles.includes("finance");

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
          bankAccounts={bankAccounts}
          canVerify={canVerify}
          canProcessExchange={canProcessExchange}
          canSettleRefund={canSettleRefund}
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
          onProcess={(id, type, details) => {
            startTransition(async () => {
              const result = await processReturn({
                return_id: id,
                new_product_id:
                  type === "exchange_size" ? details?.newProductId : undefined,
                refund_bank_account_id:
                  type === "refund" ? details?.refundBankAccountId : undefined,
                refund_amount:
                  type === "refund" ? details?.refundAmount : undefined,
                refund_date:
                  type === "refund" ? details?.refundDate : undefined,
                refund_reference_no:
                  type === "refund" ? details?.refundReferenceNo : undefined,
              });
              if ("error" in result && result.error) {
                const msg = (result.error as { _form?: string[] })._form?.[0] ?? "Gagal memproses retur";
                toast.push(msg, "error");
                return;
              }
              toast.push(
                type === "refund"
                  ? "Refund selesai. Stok, saldo rekening, mutasi bank, dan jurnal sudah diperbarui."
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
  bankAccounts,
  canVerify,
  canProcessExchange,
  canSettleRefund,
  pending,
  onVerify,
  onProcess,
}: {
  returns: ReturnRow[];
  bankAccounts: BankAccountRow[];
  canVerify: boolean;
  canProcessExchange: boolean;
  canSettleRefund: boolean;
  pending: boolean;
  onVerify: (id: string) => void;
  onProcess: (
    id: string,
    type: ReturnRow["type"],
    details?: {
      newProductId?: string;
      refundBankAccountId?: string;
      refundAmount?: number;
      refundDate?: string;
      refundReferenceNo?: string;
    },
  ) => void;
}) {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [refundProcessingId, setRefundProcessingId] = useState<string | null>(null);
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

                    {item.status === "verified" && item.type === "refund" && canSettleRefund ? (
                        <Button size="sm" variant="success" onClick={() => setRefundProcessingId(item.id)} disabled={pending}>
                          <RefreshCcw size={14} strokeWidth={1.8} />
                          Selesaikan Refund
                        </Button>
                    ) : null}

                    {item.status === "verified" && item.type === "refund" && !canSettleRefund ? (
                      <Badge tone="warning">Menunggu Owner / Finance</Badge>
                    ) : null}

                    {item.status === "verified" && item.type === "exchange_size" && canProcessExchange ? (
                        <Button size="sm" variant="success" onClick={() => setProcessingId(item.id)} disabled={pending}>
                          <ArrowRight size={14} strokeWidth={1.8} />
                          Pilih Size Pengganti
                        </Button>
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

              {item.type === "refund" && item.status === "processed" ? (
                <div className="grid gap-4 border-t border-white/[0.06] px-5 py-4 md:grid-cols-3">
                  <InfoBlock
                    label="Nominal Refund"
                    value={item.refund_amount == null ? "—" : formatRupiah(Number(item.refund_amount))}
                  />
                  <InfoBlock
                    label="Rekening Refund"
                    value={item.refund_bank?.name ?? "—"}
                  />
                  <InfoBlock
                    label="Referensi"
                    value={item.refund_reference_no || "—"}
                  />
                </div>
              ) : null}

              <div className="border-t border-white/[0.06] px-5 py-4">
                <p className="text-[11px] uppercase tracking-[0.14em] text-white/30">Alasan Retur</p>
                <p className="mt-2 text-sm leading-6 text-white/75">{item.reason}</p>
              </div>

              {processingId === item.id && item.type === "exchange_size" ? (
                <ExchangeModal
                  returnRow={item}
                  onCancel={() => setProcessingId(null)}
                  onConfirm={(newProductId) => {
                    onProcess(item.id, "exchange_size", { newProductId });
                    setProcessingId(null);
                  }}
                  pending={pending}
                />
              ) : null}

              {refundProcessingId === item.id && item.type === "refund" ? (
                <RefundModal
                  returnRow={item}
                  bankAccounts={bankAccounts}
                  onCancel={() => setRefundProcessingId(null)}
                  onConfirm={(details) => {
                    onProcess(item.id, "refund", details);
                    setRefundProcessingId(null);
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

function jakartaToday(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function recommendedRefundAccount(
  accounts: BankAccountRow[],
  platform: string | undefined,
): BankAccountRow | undefined {
  const platformKey = (platform ?? "").trim().toLowerCase();
  const marketplaceMatch = platformKey
    ? accounts.find((account) => {
        if (account.type !== "marketplace_balance") return false;
        return `${account.name} ${account.bank_name ?? ""}`
          .toLowerCase()
          .includes(platformKey);
      })
    : undefined;

  return marketplaceMatch ?? accounts.find((account) => account.is_default) ?? accounts[0];
}

function RefundModal({
  returnRow,
  bankAccounts,
  onCancel,
  onConfirm,
  pending,
}: {
  returnRow: ReturnRow;
  bankAccounts: BankAccountRow[];
  onCancel: () => void;
  onConfirm: (details: {
    refundBankAccountId: string;
    refundAmount: number;
    refundDate: string;
    refundReferenceNo?: string;
  }) => void;
  pending: boolean;
}) {
  const toast = useToast();
  const [creating, startCreating] = useTransition();
  const [accounts, setAccounts] = useState(() =>
    bankAccounts.filter((account) => account.is_active),
  );
  const platform = returnRow.packing_items?.packing_sessions?.platform;
  const recommended = useMemo(
    () => recommendedRefundAccount(accounts, platform),
    [accounts, platform],
  );
  const [selectedAccountId, setSelectedAccountId] = useState(
    () => recommendedRefundAccount(bankAccounts.filter((account) => account.is_active), platform)?.id ?? "",
  );
  const [amount, setAmount] = useState(
    String(Number(returnRow.packing_items?.sell_price ?? 0)),
  );
  const [refundDate, setRefundDate] = useState(jakartaToday);
  const [referenceNo, setReferenceNo] = useState("");
  const [showCreate, setShowCreate] = useState(accounts.length === 0);
  const [createError, setCreateError] = useState("");
  const [newAccount, setNewAccount] = useState({
    name: "",
    type: "bank" as BankAccountRow["type"],
    bank_name: "",
    account_number: "",
    account_holder: "",
    opening_balance: "0",
    is_default: accounts.length === 0,
  });

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId);
  const numericAmount = Number(amount);
  const insufficientBalance =
    Boolean(selectedAccount) &&
    Number.isFinite(numericAmount) &&
    numericAmount > Number(selectedAccount?.current_balance ?? 0);
  const canSubmit =
    Boolean(selectedAccountId) &&
    Number.isFinite(numericAmount) &&
    numericAmount > 0 &&
    Boolean(refundDate) &&
    !insufficientBalance;

  function createInlineAccount() {
    setCreateError("");
    if (!newAccount.name.trim()) {
      setCreateError("Nama rekening wajib diisi");
      return;
    }

    startCreating(async () => {
      const result = await createBankAccount({
        name: newAccount.name.trim(),
        type: newAccount.type,
        bank_name: newAccount.bank_name.trim() || undefined,
        account_number: newAccount.account_number.trim() || undefined,
        account_holder: newAccount.account_holder.trim() || undefined,
        opening_balance: Number(newAccount.opening_balance || 0),
        currency: "IDR",
        is_default: newAccount.is_default,
        notes: "Dibuat dari penyelesaian refund retur",
      });

      if ("error" in result && result.error) {
        const error = result.error as Record<string, string[]>;
        setCreateError(error._form?.[0] ?? Object.values(error)[0]?.[0] ?? "Gagal membuat rekening");
        return;
      }
      if (!("data" in result) || !result.data) {
        setCreateError("Rekening baru tidak dapat dimuat");
        return;
      }

      const created: BankAccountRow = {
        ...result.data,
        opening_balance: Number(result.data.opening_balance),
        current_balance: Number(result.data.current_balance),
        coa_account_code: null,
        coa_account_name: null,
      };
      setAccounts((current) => [created, ...current]);
      setSelectedAccountId(created.id);
      setShowCreate(false);
      toast.push("Rekening baru dibuat dan langsung dipilih", "success");
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <Card className="my-8 w-full max-w-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Selesaikan Refund</h2>
            <p className="mt-1 text-sm text-white/45">
              {returnRow.original?.brand} {returnRow.original?.model} • order {returnRow.packing_items?.packing_sessions?.platform_order_id ?? "—"}
            </p>
          </div>
          <Badge tone="success">Refund + Jurnal</Badge>
        </div>

        <Alert tone="info" className="mt-5">
          Sistem menyarankan rekening marketplace yang sesuai platform, lalu rekening default. Anda tetap dapat memilih rekening aktif lain atau menambah rekening baru.
        </Alert>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <FieldLabel htmlFor="refund-bank-account" required>Rekening sumber refund</FieldLabel>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowCreate((value) => !value)}>
                <Plus size={14} />
                Tambah Rekening
              </Button>
            </div>
            <Select
              id="refund-bank-account"
              value={selectedAccountId}
              onChange={(event) => setSelectedAccountId(event.target.value)}
            >
              <option value="">-- Pilih rekening aktif --</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} — saldo {formatRupiah(Number(account.current_balance))}
                  {account.id === recommended?.id ? " — Disarankan" : ""}
                </option>
              ))}
            </Select>
            {recommended ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-300/80">
                <Sparkles size={12} /> Saran sistem: {recommended.name}
              </p>
            ) : null}
            {accounts.length === 0 ? (
              <FieldError message="Belum ada rekening aktif. Tambahkan rekening terlebih dahulu." />
            ) : null}
          </div>

          <div>
            <FieldLabel htmlFor="refund-amount" required>Nominal refund</FieldLabel>
            <Input
              id="refund-amount"
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <p className="mt-2 text-xs text-white/40">
              Otomatis dari harga jual item; dapat disesuaikan jika nilai refund berbeda.
            </p>
            {insufficientBalance ? (
              <FieldError message={`Saldo ${selectedAccount?.name ?? "rekening"} tidak mencukupi.`} />
            ) : null}
          </div>

          <div>
            <FieldLabel htmlFor="refund-date" required>Tanggal refund</FieldLabel>
            <Input
              id="refund-date"
              type="date"
              value={refundDate}
              onChange={(event) => setRefundDate(event.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <FieldLabel htmlFor="refund-reference">Referensi pembayaran</FieldLabel>
            <Input
              id="refund-reference"
              value={referenceNo}
              onChange={(event) => setReferenceNo(event.target.value)}
              placeholder="Contoh: nomor transfer atau refund marketplace"
            />
          </div>
        </div>

        {showCreate ? (
          <div className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
            <div className="mb-4 flex items-center gap-2">
              <Landmark size={16} className="text-white/60" />
              <h3 className="text-sm font-semibold text-white/80">Tambah Rekening Baru</h3>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <FieldLabel htmlFor="new-refund-account-name" required>Nama rekening</FieldLabel>
                <Input
                  id="new-refund-account-name"
                  value={newAccount.name}
                  onChange={(event) => setNewAccount((value) => ({ ...value, name: event.target.value }))}
                  placeholder="Contoh: Saldo Shopee"
                />
              </div>
              <div>
                <FieldLabel htmlFor="new-refund-account-type" required>Tipe</FieldLabel>
                <Select
                  id="new-refund-account-type"
                  value={newAccount.type}
                  onChange={(event) => setNewAccount((value) => ({ ...value, type: event.target.value as BankAccountRow["type"] }))}
                >
                  <option value="bank">Bank</option>
                  <option value="cash">Kas</option>
                  <option value="ewallet">E-Wallet</option>
                  <option value="marketplace_balance">Saldo Marketplace</option>
                </Select>
              </div>
              <div>
                <FieldLabel htmlFor="new-refund-bank-name">Bank / provider</FieldLabel>
                <Input
                  id="new-refund-bank-name"
                  value={newAccount.bank_name}
                  onChange={(event) => setNewAccount((value) => ({ ...value, bank_name: event.target.value }))}
                  placeholder="Contoh: Shopee atau BCA"
                />
              </div>
              <div>
                <FieldLabel htmlFor="new-refund-account-number">Nomor rekening</FieldLabel>
                <Input
                  id="new-refund-account-number"
                  value={newAccount.account_number}
                  onChange={(event) => setNewAccount((value) => ({ ...value, account_number: event.target.value }))}
                />
              </div>
              <div>
                <FieldLabel htmlFor="new-refund-account-holder">Atas nama</FieldLabel>
                <Input
                  id="new-refund-account-holder"
                  value={newAccount.account_holder}
                  onChange={(event) => setNewAccount((value) => ({ ...value, account_holder: event.target.value }))}
                />
              </div>
              <div>
                <FieldLabel htmlFor="new-refund-opening-balance">Saldo awal</FieldLabel>
                <Input
                  id="new-refund-opening-balance"
                  type="number"
                  min="0"
                  value={newAccount.opening_balance}
                  onChange={(event) => setNewAccount((value) => ({ ...value, opening_balance: event.target.value }))}
                />
              </div>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm text-white/65">
              <input
                type="checkbox"
                checked={newAccount.is_default}
                onChange={(event) => setNewAccount((value) => ({ ...value, is_default: event.target.checked }))}
                className="h-4 w-4 rounded border-white/20 bg-white/5"
              />
              Jadikan rekening default
            </label>
            <FieldError message={createError} />
            <div className="mt-4 flex justify-end">
              <Button type="button" size="sm" variant="secondary" onClick={createInlineAccount} disabled={creating}>
                {creating ? "Membuat..." : "Buat & Pilih Rekening"}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel}>Batal</Button>
          <Button
            onClick={() => onConfirm({
              refundBankAccountId: selectedAccountId,
              refundAmount: numericAmount,
              refundDate,
              refundReferenceNo: referenceNo.trim() || undefined,
            })}
            disabled={!canSubmit || pending || creating}
          >
            Proses Refund & Jurnal
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
                  : "Gudang verifikasi barang, lalu Owner/Finance memilih rekening dan menyelesaikan refund beserta stok, mutasi bank, dan jurnal secara otomatis."}
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
            3. Setelah status "Siap Diproses", gudang menangani tukar size; Owner/Finance menyelesaikan refund uang.
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            4. Item yang sudah pernah diretur tidak akan muncul lagi di daftar ini.
          </div>
          <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-4 text-amber-100/75">
            5. Untuk refund, pilih rekening existing atau tambah rekening baru. Sistem menyarankan rekening dan membuat mutasi bank serta jurnal otomatis.
          </div>
        </div>
      </Card>
    </div>
  );
}
