"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, FieldLabel, Input, Textarea } from "@sneakervault/ui";
import {
  approveStockOpname,
  cancelStockOpname,
  saveStockOpnameCounts,
  startStockOpname,
  submitStockOpnameForReview,
} from "@/lib/actions/stock-opname";
import { useToast } from "@/components/toast";
import type {
  StockOpnameDetail,
  StockOpnameSessionRow,
} from "@/lib/queries";
import { Check, ClipboardCheck, Play, Save, X } from "lucide-react";
import {
  STOCK_OPNAME_STATUS_LABELS,
  STOCK_OPNAME_STATUS_TONES,
} from "@sneakervault/shared";
import { formatRupiah as formatRp } from "@/lib/format";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function actionError(result: unknown): string | null {
  if (!result || typeof result !== "object" || !("error" in result)) return null;
  const error = (result as { error?: unknown }).error;
  if (!error) return null;
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    return Object.values(error as Record<string, unknown>).flat().join(", ");
  }
  return "Terjadi kesalahan";
}

export function StockOpnameClient({
  sessions,
  detail,
  canApprove,
}: {
  sessions: StockOpnameSessionRow[];
  detail: StockOpnameDetail | null;
  canApprove: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [opnameDate, setOpnameDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [counts, setCounts] = useState<Record<string, { qty: string; reason: string }>>(
    () =>
      Object.fromEntries(
        (detail?.lines ?? []).map((line) => [
          line.id,
          {
            qty: line.physical_qty === null ? String(line.system_qty) : String(line.physical_qty),
            reason: line.reason ?? "",
          },
        ]),
      ),
  );

  const summary = useMemo(() => {
    const lines = detail?.lines ?? [];
    const counted = lines.filter((line) => {
      const value = counts[line.id]?.qty;
      return value !== undefined && value !== "";
    }).length;
    const varianceAmount = lines.reduce((sum, line) => {
      const raw = counts[line.id]?.qty;
      const physical =
        raw === undefined || raw === "" ? line.physical_qty : Number(raw);
      if (physical === null || Number.isNaN(physical)) return sum;
      return sum + (physical - line.system_qty) * line.unit_cost;
    }, 0);
    return { counted, total: lines.length, varianceAmount };
  }, [counts, detail]);

  function startSession() {
    startTransition(async () => {
      const result = await startStockOpname({
        opname_date: opnameDate,
        scope: "all",
        notes,
      });
      const message = actionError(result);
      if (message) {
        toast.push(message || "Gagal mulai opname", "error");
        return;
      }
      toast.push("Sesi stock opname dibuat", "success");
      const data = (result as { data: { id: string } }).data;
      router.push(`/inventory/opname?session=${data.id}`);
      router.refresh();
    });
  }

  function saveCounts() {
    if (!detail) return;
    startTransition(async () => {
      const result = await saveStockOpnameCounts({
        session_id: detail.id,
        lines: detail.lines.map((line) => ({
          line_id: line.id,
          physical_qty: Number(counts[line.id]?.qty ?? line.system_qty),
          reason: counts[line.id]?.reason ?? "",
        })),
      });
      const message = actionError(result);
      if (message) {
        toast.push(message || "Gagal simpan hitungan", "error");
        return;
      }
      toast.push("Hitungan tersimpan", "success");
      router.refresh();
    });
  }

  function submitReview() {
    if (!detail) return;
    startTransition(async () => {
      const result = await submitStockOpnameForReview(detail.id);
      if (result.error) {
        toast.push(result.error, "error");
        return;
      }
      toast.push("Sesi dikirim untuk review", "success");
      router.refresh();
    });
  }

  function approve() {
    if (!detail) return;
    startTransition(async () => {
      const result = await approveStockOpname(detail.id);
      if (result.error) {
        toast.push(result.error, "error");
        return;
      }
      toast.push("Stock opname approved dan stok disesuaikan", "success");
      router.refresh();
    });
  }

  function cancel() {
    if (!detail) return;
    startTransition(async () => {
      const result = await cancelStockOpname(detail.id, "Dibatalkan dari UI");
      if (result.error) {
        toast.push(result.error, "error");
        return;
      }
      toast.push("Sesi dibatalkan", "success");
      router.push("/inventory/opname");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <aside className="space-y-4">
        <Card className="space-y-4 p-5">
          <div>
            <h2 className="text-lg font-semibold text-white">Mulai Sesi</h2>
            <p className="text-xs text-white/40">
              Snapshot stok aktif untuk cycle count.
            </p>
          </div>
          <div>
            <FieldLabel>Tanggal</FieldLabel>
            <Input
              type="date"
              value={opnameDate}
              onChange={(event) => setOpnameDate(event.target.value)}
            />
          </div>
          <div>
            <FieldLabel>Catatan</FieldLabel>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Area gudang, PIC, atau catatan scope"
            />
          </div>
          <Button type="button" onClick={startSession} disabled={pending} className="w-full">
            <Play size={16} />
            Mulai Opname
          </Button>
        </Card>

        <Card className="p-0">
          <div className="border-b border-white/[0.06] p-5">
            <h2 className="text-sm font-semibold text-white/80">Riwayat Sesi</h2>
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            {sessions.length === 0 ? (
              <div className="p-5 text-sm text-white/35">Belum ada sesi.</div>
            ) : (
              sessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/inventory/opname?session=${session.id}`}
                  className="block border-b border-white/[0.04] p-4 transition hover:bg-white/[0.04]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs font-semibold text-white/80">
                        {session.opname_number}
                      </p>
                      <p className="mt-1 text-xs text-white/35">
                        {session.opname_date} · {session.counted_lines}/{session.total_lines} item
                      </p>
                    </div>
                    <Badge tone={STOCK_OPNAME_STATUS_TONES[session.status] ?? "neutral"}>
                      {STOCK_OPNAME_STATUS_LABELS[session.status] ?? session.status}
                    </Badge>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>
      </aside>

      <main className="space-y-4">
        {!detail ? (
          <Card className="p-10 text-center">
            <ClipboardCheck className="mx-auto mb-4 h-10 w-10 text-white/25" />
            <p className="text-sm text-white/40">
              Pilih sesi atau mulai sesi stock opname baru.
            </p>
          </Card>
        ) : (
          <>
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="font-mono text-lg font-semibold text-white">
                      {detail.opname_number}
                    </h2>
                    <Badge tone={STOCK_OPNAME_STATUS_TONES[detail.status] ?? "neutral"}>{STOCK_OPNAME_STATUS_LABELS[detail.status] ?? detail.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-white/40">
                    {detail.opname_date} · {summary.counted}/{summary.total} item dihitung
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["open", "counting"].includes(detail.status) ? (
                    <>
                      <Button type="button" variant="secondary" onClick={saveCounts} disabled={pending}>
                        <Save size={16} />
                        Simpan
                      </Button>
                      <Button type="button" onClick={submitReview} disabled={pending}>
                        <Check size={16} />
                        Kirim Review
                      </Button>
                    </>
                  ) : null}
                  {detail.status === "review" && canApprove ? (
                    <Button type="button" variant="success" onClick={approve} disabled={pending}>
                      <Check size={16} />
                      Approve
                    </Button>
                  ) : null}
                  {!["approved", "cancelled"].includes(detail.status) ? (
                    <Button type="button" variant="danger" onClick={cancel} disabled={pending}>
                      <X size={16} />
                      Batal
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl bg-white/[0.03] p-4">
                  <p className="text-xs text-white/35">Total SKU</p>
                  <p className="mt-1 text-xl font-bold text-white">{summary.total}</p>
                </div>
                <div className="rounded-xl bg-white/[0.03] p-4">
                  <p className="text-xs text-white/35">Selesai Hitung</p>
                  <p className="mt-1 text-xl font-bold text-white">{summary.counted}</p>
                </div>
                <div className="rounded-xl bg-white/[0.03] p-4">
                  <p className="text-xs text-white/35">Nilai Selisih</p>
                  <p className="mt-1 text-xl font-bold text-white">
                    {formatRp(summary.varianceAmount)}
                  </p>
                </div>
              </div>
            </Card>

            <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
              <div className="max-h-[680px] overflow-auto">
                <table className="w-full min-w-[920px] text-left">
                  <thead className="sticky top-0 bg-[#151515] text-[11px] uppercase tracking-wider text-white/30">
                    <tr>
                      <th className="px-4 py-3 font-medium">Produk</th>
                      <th className="px-4 py-3 text-right font-medium">System</th>
                      <th className="px-4 py-3 text-right font-medium">Fisik</th>
                      <th className="px-4 py-3 text-right font-medium">Selisih</th>
                      <th className="px-4 py-3 font-medium">Alasan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {detail.lines.map((line) => {
                      const raw = counts[line.id]?.qty ?? "";
                      const physical = raw === "" ? line.system_qty : Number(raw);
                      const variance = physical - line.system_qty;
                      return (
                        <tr key={line.id}>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-white/80">
                              {line.product_label}
                            </p>
                            <p className="font-mono text-[11px] text-white/35">
                              {line.sku} · {line.barcode}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-white/60">
                            {line.system_qty}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Input
                              type="number"
                              min={0}
                              disabled={!["open", "counting"].includes(detail.status)}
                              value={raw}
                              onChange={(event) =>
                                setCounts((current) => ({
                                  ...current,
                                  [line.id]: {
                                    qty: event.target.value,
                                    reason: current[line.id]?.reason ?? "",
                                  },
                                }))
                              }
                              className="ml-auto w-24 text-right"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={
                                variance < 0
                                  ? "text-red-300"
                                  : variance > 0
                                    ? "text-emerald-300"
                                    : "text-white/35"
                              }
                            >
                              {variance}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Input
                              disabled={!["open", "counting"].includes(detail.status)}
                              value={counts[line.id]?.reason ?? ""}
                              onChange={(event) =>
                                setCounts((current) => ({
                                  ...current,
                                  [line.id]: {
                                    qty: current[line.id]?.qty ?? String(line.system_qty),
                                    reason: event.target.value,
                                  },
                                }))
                              }
                              placeholder={variance !== 0 ? "Wajib jelaskan selisih" : "Opsional"}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
