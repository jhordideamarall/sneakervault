"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  Alert,
  FieldLabel,
} from "@sneakervault/ui";
import { PO_STATUS_LABELS, PO_STATUS_TONES } from "@sneakervault/shared";
import { useToast } from "@/components/toast";
import { QuickTip } from "@/components/ui/quick-tip";
import { formatRupiah as fmtRupiah, formatDate as fmtDate } from "@/lib/format";
import { receivePurchaseOrder } from "@/lib/actions/purchase-receive";
import type { ReceivablePoRow, PoDetail } from "@/lib/queries";
import {
  PackagePlus,
  Search,
  Calendar,
  X,
  CheckCircle2,
  AlertCircle,
  Truck,
} from "lucide-react";

type ReceiveLineForm = {
  line_id: string;
  product_label: string;
  ordered_qty: number;
  already_received: number;
  remaining: number;
  receive_now: number;
  unit_cost: number;
};


export function PenerimaanClient({
  receivablePos,
  detailById,
  roles,
}: {
  receivablePos: ReceivablePoRow[];
  detailById: Record<string, PoDetail>;
  roles: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [receiving, setReceiving] = useState<PoDetail | null>(null);
  const [form, setForm] = useState<ReceiveLineForm[]>([]);
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const canReceive =
    roles.includes("owner") ||
    roles.includes("admin_gudang") ||
    roles.includes("finance");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return receivablePos;
    return receivablePos.filter(
      (p) =>
        p.po_number.toLowerCase().includes(q) ||
        p.supplier_name.toLowerCase().includes(q),
    );
  }, [receivablePos, search]);

  const stats = useMemo(() => {
    return {
      total: receivablePos.length,
      approved: receivablePos.filter((p) => p.status === "approved").length,
      receiving: receivablePos.filter((p) => p.status === "receiving").length,
      remaining_items: receivablePos.reduce(
        (a, p) => a + p.total_remaining,
        0,
      ),
    };
  }, [receivablePos]);

  function startReceive(po: PoDetail) {
    setReceiving(po);
    setForm(
      po.lines.map((l) => ({
        line_id: l.id,
        product_label: l.product_label,
        ordered_qty: l.ordered_qty,
        already_received: l.received_qty,
        remaining: l.ordered_qty - l.received_qty,
        receive_now: l.ordered_qty - l.received_qty,
        unit_cost: l.unit_cost,
      })),
    );
    setNotes("");
    setFormError(null);
  }

  function close() {
    setReceiving(null);
    setForm([]);
    setNotes("");
    setFormError(null);
  }

  function updateQty(idx: number, val: number) {
    setForm((prev) =>
      prev.map((l, i) =>
        i === idx
          ? {
              ...l,
              receive_now: Math.max(0, Math.min(l.remaining, Math.floor(val))),
            }
          : l,
      ),
    );
  }

  function receiveAll() {
    setForm((prev) => prev.map((l) => ({ ...l, receive_now: l.remaining })));
  }

  function receiveNone() {
    setForm((prev) => prev.map((l) => ({ ...l, receive_now: 0 })));
  }

  const totalReceiveNow = form.reduce((a, l) => a + l.receive_now, 0);
  const totalValueNow = form.reduce(
    (a, l) => a + l.receive_now * l.unit_cost,
    0,
  );

  function submit() {
    if (!receiving) return;
    if (totalReceiveNow === 0) {
      setFormError("Tidak ada item yang diterima. Isi qty minimal 1.");
      return;
    }
    const payload = {
      po_id: receiving.id,
      notes: notes || undefined,
      lines: form
        .filter((l) => l.receive_now > 0)
        .map((l) => ({ line_id: l.line_id, receive_qty: l.receive_now })),
    };
    setFormError(null);
    startTransition(async () => {
      const r = (await receivePurchaseOrder(payload)) as {
        error?: unknown;
        success?: boolean;
        new_status?: string;
        received_lines?: number;
        auto_invoice_id?: string | null;
        auto_payment_id?: string | null;
        auto_payment_amount?: number;
      };
      if (r.error) {
        const e = r.error as { _form?: string[] } | string;
        const msg =
          typeof e === "string" ? e : e._form?.[0] ?? "Gagal proses penerimaan";
        setFormError(msg);
        return;
      }
      let statusLabel = "Penerimaan parsial tersimpan";
      if (r.new_status === "completed") {
        if (r.auto_payment_id && r.auto_payment_amount) {
          const amtFmt = `Rp ${Math.round(r.auto_payment_amount).toLocaleString("id-ID")}`;
          statusLabel = `PO selesai. Faktur + Pembayaran auto-dibuat (${amtFmt}) ✓`;
        } else if (r.auto_invoice_id) {
          statusLabel = "PO selesai. Faktur Pembelian otomatis dibuat ✓";
        } else {
          statusLabel = "PO selesai diterima";
        }
      }
      toast.push(
        `${statusLabel} — ${r.received_lines} item diterima`,
        "success",
      );
      close();
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] text-white/80">
            <PackagePlus size={20} strokeWidth={1.7} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Penerimaan Barang
            </h1>
            <p className="text-sm text-white/50">
              PO yang sudah disetujui dan siap diterima di gudang
            </p>
          </div>
        </div>
      </div>

      <QuickTip
        id="pembelian-penerimaan-intro"
        title="Apa yang terjadi saat Anda klik Terima"
        tone="info"
      >
        Saat Anda terima barang, sistem akan: <strong>(1)</strong> tambah stok di inventory,{" "}
        <strong>(2)</strong> hitung ulang HPP rata-rata per SKU,{" "}
        <strong>(3)</strong> set status PO jadi <em>Receiving</em> (parsial) atau{" "}
        <em>Completed</em> (full).{" "}
        <strong>✨ Saat PO completed, Faktur Pembelian otomatis dibuat</strong> — tidak perlu input ulang manual.
        Tinggal cek dan lanjut ke <strong>Bayar Vendor</strong>.
      </QuickTip>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Antrian PO" value={stats.total.toString()} />
        <StatTile
          label="Siap Diterima"
          value={stats.approved.toString()}
          tone="sky"
        />
        <StatTile
          label="Sebagian Diterima"
          value={stats.receiving.toString()}
          tone="amber"
        />
        <StatTile
          label="Item Tersisa"
          value={stats.remaining_items.toString()}
        />
      </div>

      <div className="rounded-lg border border-white/[0.06] bg-[#262626] p-3">
        <div className="relative">
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
      </div>

      {filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((p) => {
            const progress =
              p.total_ordered > 0
                ? Math.round((p.total_received / p.total_ordered) * 100)
                : 0;
            const detail = detailById[p.id];
            return (
              <div
                key={p.id}
                className="rounded-xl border border-white/[0.06] bg-[#262626] p-5 transition-colors hover:border-white/[0.12]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-sm font-semibold text-white">
                      {p.po_number}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-sm text-white/70">
                      <Truck size={12} strokeWidth={1.8} />
                      {p.supplier_name}
                    </div>
                  </div>
                  <span
                    className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-medium ${PO_STATUS_TONES[p.status]}`}
                  >
                    {PO_STATUS_LABELS[p.status]}
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-4 text-xs text-white/50">
                  <div className="flex items-center gap-1">
                    <Calendar size={11} strokeWidth={1.8} />
                    Order: {fmtDate(p.order_date)}
                  </div>
                  {p.expected_date ? (
                    <div className="flex items-center gap-1">
                      <Calendar size={11} strokeWidth={1.8} />
                      ETA: {fmtDate(p.expected_date)}
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/50">Progress penerimaan</span>
                    <span className="tabular-nums text-white/80">
                      {p.total_received}/{p.total_ordered} item ({progress}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/[0.04]">
                    <div
                      className={`h-full rounded-full transition-all ${
                        progress === 100
                          ? "bg-emerald-400"
                          : progress > 0
                            ? "bg-amber-400"
                            : "bg-sky-400"
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-white/[0.04] pt-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-white/40">
                      Total Nilai
                    </div>
                    <div className="text-sm font-semibold tabular-nums text-white">
                      {fmtRupiah(p.total)}
                    </div>
                  </div>
                  {canReceive && detail ? (
                    <Button
                      onClick={() => startReceive(detail)}
                      className="gap-1.5"
                    >
                      <PackagePlus size={14} strokeWidth={2} />
                      Terima
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {receiving ? (
        <ReceiveModal
          po={receiving}
          form={form}
          notes={notes}
          setNotes={setNotes}
          formError={formError}
          totalReceiveNow={totalReceiveNow}
          totalValueNow={totalValueNow}
          pending={pending}
          onClose={close}
          onUpdateQty={updateQty}
          onReceiveAll={receiveAll}
          onReceiveNone={receiveNone}
          onSubmit={submit}
        />
      ) : null}
    </div>
  );
}

function ReceiveModal({
  po,
  form,
  notes,
  setNotes,
  formError,
  totalReceiveNow,
  totalValueNow,
  pending,
  onClose,
  onUpdateQty,
  onReceiveAll,
  onReceiveNone,
  onSubmit,
}: {
  po: PoDetail;
  form: ReceiveLineForm[];
  notes: string;
  setNotes: (s: string) => void;
  formError: string | null;
  totalReceiveNow: number;
  totalValueNow: number;
  pending: boolean;
  onClose: () => void;
  onUpdateQty: (idx: number, val: number) => void;
  onReceiveAll: () => void;
  onReceiveNone: () => void;
  onSubmit: () => void;
}) {
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
            <div className="flex items-center gap-2">
              <PackagePlus size={16} strokeWidth={1.8} className="text-white/60" />
              <h2 className="text-base font-semibold text-white">
                Terima Barang dari{" "}
                <span className="font-mono">{po.po_number}</span>
              </h2>
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

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {formError ? (
            <Alert tone="error">
              <div className="flex items-start gap-2">
                <AlertCircle size={14} strokeWidth={1.8} className="mt-0.5" />
                <span>{formError}</span>
              </div>
            </Alert>
          ) : null}

          <div className="rounded-lg border border-sky-500/15 bg-sky-500/[0.04] p-3 text-xs text-sky-200/80">
            Verifikasi fisik barang sesuai pesanan. Qty diterima akan menambah
            stok dan menghitung ulang HPP otomatis. Penerimaan sebagian boleh —
            sisa akan tetap di antrian.
          </div>

          <div className="overflow-hidden rounded-lg border border-white/[0.06]">
            <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#1f1f1f] px-3 py-2 text-[11px] uppercase tracking-wider text-white/40">
              <span>Item</span>
              <div className="flex gap-2">
                <button
                  onClick={onReceiveAll}
                  className="rounded px-2 py-0.5 text-[10px] font-medium text-emerald-300 hover:bg-emerald-500/10"
                >
                  Terima Semua
                </button>
                <button
                  onClick={onReceiveNone}
                  className="rounded px-2 py-0.5 text-[10px] font-medium text-white/50 hover:bg-white/[0.06]"
                >
                  Kosongkan
                </button>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.04] text-left text-[11px] uppercase tracking-wider text-white/40">
                  <th className="px-3 py-2 font-medium">Produk</th>
                  <th
                    className="px-3 py-2 text-center font-medium"
                    style={{ width: "80px" }}
                  >
                    Pesan
                  </th>
                  <th
                    className="px-3 py-2 text-center font-medium"
                    style={{ width: "90px" }}
                  >
                    Diterima
                  </th>
                  <th
                    className="px-3 py-2 text-center font-medium"
                    style={{ width: "100px" }}
                  >
                    Sisa
                  </th>
                  <th
                    className="px-3 py-2 text-center font-medium"
                    style={{ width: "120px" }}
                  >
                    Terima Sekarang
                  </th>
                </tr>
              </thead>
              <tbody>
                {form.map((l, idx) => {
                  const isFull = l.remaining === 0;
                  return (
                    <tr
                      key={l.line_id}
                      className={`border-b border-white/[0.04] last:border-0 ${isFull ? "opacity-50" : ""}`}
                    >
                      <td className="px-3 py-2 text-white/80">
                        {l.product_label}
                        <div className="text-[11px] text-white/40">
                          {fmtRupiah(l.unit_cost)}/pcs
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center text-white/70">
                        {l.ordered_qty}
                      </td>
                      <td className="px-3 py-2 text-center text-white/60">
                        {l.already_received}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {isFull ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300">
                            <CheckCircle2 size={11} strokeWidth={2} />
                            Lengkap
                          </span>
                        ) : (
                          <span className="font-medium text-amber-300">
                            {l.remaining}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          max={l.remaining}
                          value={l.receive_now}
                          onChange={(e) =>
                            onUpdateQty(idx, Number(e.target.value))
                          }
                          disabled={isFull}
                          className="h-8 px-2 text-center"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div>
            <FieldLabel htmlFor="notes">Catatan Penerimaan</FieldLabel>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="opsional — cth: 2 pcs ada cacat ringan, sisanya OK"
            />
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-[#1f1f1f] p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Total qty diterima</span>
              <span className="text-base font-semibold tabular-nums text-white">
                {totalReceiveNow} pcs
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-white/50">Total nilai diterima</span>
              <span className="font-medium tabular-nums text-white/80">
                {fmtRupiah(totalValueNow)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-white/[0.06] px-6 py-4">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Batal
          </Button>
          <Button
            onClick={onSubmit}
            disabled={pending || totalReceiveNow === 0}
            className="gap-1.5"
          >
            <CheckCircle2 size={14} strokeWidth={2} />
            {pending ? "Memproses…" : "Konfirmasi Terima"}
          </Button>
        </div>
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
  tone?: "sky" | "amber";
}) {
  const t =
    tone === "sky"
      ? "text-sky-300"
      : tone === "amber"
        ? "text-amber-300"
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

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-white/10 bg-[#262626] px-6 py-16 text-center">
      <PackagePlus
        size={32}
        strokeWidth={1.5}
        className="mx-auto mb-4 text-white/30"
      />
      <h3 className="text-base font-medium text-white">
        Tidak ada PO yang menunggu diterima
      </h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-white/50">
        Penerimaan akan muncul di sini setelah finance menyetujui Purchase Order.
        Buat dan setujui PO baru di menu <strong>Pembelian → Purchase Order</strong>.
      </p>
    </div>
  );
}
