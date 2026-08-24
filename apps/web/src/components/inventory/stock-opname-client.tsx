"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, FieldLabel, Input, Textarea, cn } from "@sneakervault/ui";
import { exportToExcel, exportToPDF } from "@/lib/export";
import {
  approveStockOpname,
  cancelStockOpname,
  incrementStockOpnameCount,
  saveStockOpnameCounts,
  startStockOpname,
  submitStockOpnameForReview,
} from "@/lib/actions/stock-opname";
import { useToast } from "@/components/toast";
import { CameraScanner } from "@/components/scanner/camera-scanner";
import type {
  StockOpnameDetail,
  StockOpnameSessionRow,
} from "@/lib/queries";
import {
  Check,
  Camera,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  Play,
  Save,
  ScanLine,
  X,
} from "lucide-react";
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
  const [scanCode, setScanCode] = useState("");
  const [scanPending, setScanPending] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const scanPendingRef = useRef(false);
  const [counts, setCounts] = useState<Record<string, { qty: string; reason: string }>>(
    () =>
      Object.fromEntries(
        (detail?.lines ?? []).map((line) => [
          line.id,
          {
            qty: line.physical_qty === null ? "" : String(line.physical_qty),
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
    const lines = detail.lines
      .filter((line) => {
        const value = counts[line.id]?.qty;
        return value !== undefined && value !== "";
      })
      .map((line) => ({
        line_id: line.id,
        physical_qty: Number(counts[line.id]?.qty ?? 0),
        reason: counts[line.id]?.reason ?? "",
      }));
    if (lines.length === 0) {
      toast.push("Belum ada hitungan fisik untuk disimpan", "error");
      return;
    }
    startTransition(async () => {
      const result = await saveStockOpnameCounts({
        session_id: detail.id,
        lines,
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
    if (summary.counted !== summary.total) {
      toast.push("Semua item harus dihitung sebelum dikirim review", "error");
      return;
    }
    const missingReason = detail.lines.find((line) => {
      const physical = Number(counts[line.id]?.qty ?? line.physical_qty ?? 0);
      return (
        physical !== line.system_qty &&
        !(counts[line.id]?.reason ?? line.reason ?? "").trim()
      );
    });
    if (missingReason) {
      toast.push(
        `Alasan selisih wajib diisi untuk ${missingReason.product_label}`,
        "error",
      );
      return;
    }
    startTransition(async () => {
      const saveResult = await saveStockOpnameCounts({
        session_id: detail.id,
        lines: detail.lines.map((line) => ({
          line_id: line.id,
          physical_qty: Number(counts[line.id]?.qty ?? 0),
          reason: counts[line.id]?.reason ?? "",
        })),
      });
      const saveMessage = actionError(saveResult);
      if (saveMessage) {
        toast.push(saveMessage || "Gagal simpan hitungan", "error");
        return;
      }
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
      toast.push("Hasil stock opname dikunci tanpa adjustment stok", "success");
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

  async function persistScan(codeValue: string) {
    if (!detail) return;
    const barcode = codeValue.trim();
    if (!barcode || scanPendingRef.current) return;

    scanPendingRef.current = true;
    setScanPending(true);
    try {
      const result = await incrementStockOpnameCount({
        session_id: detail.id,
        barcode,
      });
      const message = actionError(result);
      if (message) {
        toast.push(message, "error");
        return;
      }

      const data = (result as {
        data: {
          line_id: string;
          physical_qty: number;
          product_label: string;
        };
      }).data;
      setCounts((current) => ({
        ...current,
        [data.line_id]: {
          qty: String(data.physical_qty),
          reason: current[data.line_id]?.reason ?? "",
        },
      }));
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(60);
      }
      toast.push(`${data.product_label} tersimpan +1`, "success");
      // One camera activation represents exactly one count. Closing the
      // preview prevents a barcode held in frame from being counted twice.
      setCameraOpen(false);
    } catch (error) {
      toast.push(
        error instanceof Error ? error.message : "Gagal menyimpan hasil scan",
        "error",
      );
    } finally {
      setScanCode("");
      scanPendingRef.current = false;
      setScanPending(false);
    }
  }

  function handleScanSubmit() {
    void persistScan(scanCode);
  }

  function currentPhysicalQty(lineId: string, fallback: number | null) {
    const raw = counts[lineId]?.qty;
    if (raw === undefined || raw === "") return fallback;
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? fallback : parsed;
  }

  async function exportOpname(format: "pdf" | "excel") {
    if (!detail) return;
    const rows = detail.lines.map((line) => {
      const physical = currentPhysicalQty(line.id, line.physical_qty);
      const variance = physical === null ? "" : physical - line.system_qty;
      const amount =
        physical === null ? "" : (physical - line.system_qty) * line.unit_cost;
      return [
        line.product_label,
        line.sku,
        line.barcode,
        line.system_qty,
        physical ?? "",
        variance,
        amount,
        counts[line.id]?.reason ?? line.reason ?? "",
      ];
    });
    const params = {
      title: `Stock Opname ${detail.opname_number}`,
      sheetName: "Stock Opname",
      period: detail.opname_date,
      filename:
        format === "pdf"
          ? `stock-opname-${detail.opname_number}.pdf`
          : `stock-opname-${detail.opname_number}.xlsx`,
      sections: [
        {
          title: "Hasil Hitung Fisik vs Sistem",
          columns: [
            "Produk",
            "SKU",
            "Barcode",
            "Qty Sistem",
            "Qty Fisik",
            "Selisih",
            "Nilai Selisih",
            "Alasan",
          ],
          rows,
          summary: [
            { label: "Total SKU", value: String(summary.total) },
            { label: "Selesai Hitung", value: String(summary.counted) },
            { label: "Nilai Selisih", value: formatRp(summary.varianceAmount) },
            { label: "Mode", value: "Compare-only, tidak adjust stok" },
          ],
        },
      ],
    };
    if (format === "pdf") await exportToPDF(params);
    else await exportToExcel(params);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <aside className="space-y-4">
        <Card className="space-y-4 p-5">
          <div>
            <h2 className="text-lg font-semibold text-white">Mulai Sesi</h2>
            <p className="text-xs text-white/40">
              Snapshot stok aktif untuk pembanding. Approval tidak mengubah stok.
            </p>
          </div>
          <div>
            <FieldLabel htmlFor="opname-date">Tanggal</FieldLabel>
            <Input
              id="opname-date"
              type="date"
              value={opnameDate}
              onChange={(event) => setOpnameDate(event.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="opname-notes">Catatan</FieldLabel>
            <Textarea
              id="opname-notes"
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
                    <span className="ml-2 text-emerald-300/80">Compare-only</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" onClick={() => exportOpname("pdf")} disabled={pending}>
                    <Download size={16} />
                    PDF
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => exportOpname("excel")} disabled={pending}>
                    <FileSpreadsheet size={16} />
                    Excel
                  </Button>
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
                      Kunci Hasil
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
              {["open", "counting"].includes(detail.status) ? (
                <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                  <FieldLabel htmlFor="opname-scan">Barcode Fisik</FieldLabel>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="opname-scan"
                      value={scanCode}
                      onChange={(event) => setScanCode(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleScanSubmit();
                        }
                      }}
                      placeholder="Scan atau ketik barcode, lalu Enter"
                      autoFocus
                    />
                    <Button type="button" onClick={handleScanSubmit} disabled={pending || scanPending}>
                      <ScanLine size={16} />
                      {scanPending ? "Menyimpan…" : "Hitung +1"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setCameraOpen((open) => !open)}
                      disabled={pending}
                    >
                      <Camera size={16} />
                      {cameraOpen ? "Tutup Kamera" : "Kamera HP"}
                    </Button>
                  </div>
                  {cameraOpen && (
                    <CameraScanner
                      onScan={(code) => {
                        setScanCode(code);
                        void persistScan(code);
                      }}
                    />
                  )}
                  <p className="mt-2 text-xs text-white/40">
                    Setiap scan langsung tersimpan ke Supabase sebagai +1. Input manual tetap tersedia untuk koreksi.
                  </p>
                </div>
              ) : null}
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

            <div className="space-y-3 md:hidden">
              {detail.lines.map((line) => {
                const raw = counts[line.id]?.qty ?? "";
                const physical = raw === "" ? line.physical_qty : Number(raw);
                const variance = physical === null ? null : physical - line.system_qty;
                return (
                  <Card key={line.id} className="space-y-4 p-4">
                    <div>
                      <p className="text-sm font-medium text-white/85">{line.product_label}</p>
                      <p className="mt-1 break-all font-mono text-[11px] text-white/35">
                        {line.sku} · {line.barcode}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-white/[0.03] p-2">
                        <p className="text-[10px] uppercase tracking-wider text-white/30">Sistem</p>
                        <p className="mt-1 font-semibold text-white/70">{line.system_qty}</p>
                      </div>
                      <div className="rounded-lg bg-white/[0.03] p-2">
                        <p className="text-[10px] uppercase tracking-wider text-white/30">Fisik</p>
                        <p className="mt-1 font-semibold text-white/70">{physical ?? "—"}</p>
                      </div>
                      <div className="rounded-lg bg-white/[0.03] p-2">
                        <p className="text-[10px] uppercase tracking-wider text-white/30">Selisih</p>
                        <p className={cn(
                          "mt-1 font-semibold",
                          variance === null
                            ? "text-white/30"
                            : variance < 0
                              ? "text-red-300"
                              : variance > 0
                                ? "text-emerald-300"
                                : "text-white/50",
                        )}>
                          {variance ?? "—"}
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-3">
                      <div>
                        <FieldLabel htmlFor={`mobile-qty-${line.id}`}>Jumlah fisik</FieldLabel>
                        <Input
                          id={`mobile-qty-${line.id}`}
                          type="number"
                          min={0}
                          disabled={![
                            "open",
                            "counting",
                          ].includes(detail.status)}
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
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor={`mobile-reason-${line.id}`}>Alasan selisih</FieldLabel>
                        <Input
                          id={`mobile-reason-${line.id}`}
                          disabled={![
                            "open",
                            "counting",
                          ].includes(detail.status)}
                          value={counts[line.id]?.reason ?? ""}
                          onChange={(event) =>
                            setCounts((current) => ({
                              ...current,
                              [line.id]: {
                                qty: current[line.id]?.qty ?? "",
                                reason: event.target.value,
                              },
                            }))
                          }
                          placeholder={variance !== null && variance !== 0 ? "Wajib jelaskan selisih" : "Opsional"}
                        />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            <div className="hidden overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] md:block">
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
                      const physical = raw === "" ? line.physical_qty : Number(raw);
                      const variance = physical === null ? null : physical - line.system_qty;
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
                              aria-label={`Jumlah fisik ${line.product_label}`}
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
                              placeholder="0"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={
                                variance === null
                                  ? "text-white/25"
                                  : variance < 0
                                  ? "text-red-300"
                                  : variance > 0
                                    ? "text-emerald-300"
                                    : "text-white/35"
                              }
                            >
                              {variance === null ? "Belum" : variance}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Input
                              aria-label={`Alasan selisih ${line.product_label}`}
                              disabled={!["open", "counting"].includes(detail.status)}
                              value={counts[line.id]?.reason ?? ""}
                              onChange={(event) =>
                                setCounts((current) => ({
                                  ...current,
                                  [line.id]: {
                                    qty: current[line.id]?.qty ?? "",
                                    reason: event.target.value,
                                  },
                                }))
                              }
                              placeholder={variance !== null && variance !== 0 ? "Wajib jelaskan selisih" : "Opsional"}
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
