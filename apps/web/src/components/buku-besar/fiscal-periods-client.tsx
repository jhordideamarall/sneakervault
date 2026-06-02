"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, FieldLabel, Input, Textarea } from "@sneakervault/ui";
import { closePeriod, reopenPeriod } from "@/lib/actions/fiscal-periods";
import { useToast } from "@/components/toast";
import type { FiscalPeriodRow } from "@/lib/queries";
import { Lock, RotateCcw, Unlock } from "lucide-react";

const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export function FiscalPeriodsClient({
  periods,
  year,
  canReopen,
}: {
  periods: FiscalPeriodRow[];
  year: number;
  canReopen: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("Tutup buku bulanan");

  function goYear(nextYear: number) {
    router.push(`/buku-besar/periode?year=${nextYear}`);
  }

  function lock(month: number) {
    startTransition(async () => {
      const result = await closePeriod({ year, month, reason });
      if (result.error) {
        const message =
          typeof result.error === "string"
            ? result.error
            : Object.values(result.error).flat().join(", ");
        toast.push(message || "Gagal tutup periode", "error");
        return;
      }
      toast.push("Periode ditutup", "success");
      router.refresh();
    });
  }

  function unlock(month: number) {
    startTransition(async () => {
      const result = await reopenPeriod({ year, month, reason });
      if (result.error) {
        const message =
          typeof result.error === "string"
            ? result.error
            : Object.values(result.error).flat().join(", ");
        toast.push(message || "Gagal buka periode", "error");
        return;
      }
      toast.push("Periode dibuka kembali", "success");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Card className="h-fit space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold text-white">Kontrol Periode</h2>
          <p className="mt-1 text-xs text-white/40">
            Lock menolak transaksi dan jurnal pada bulan tersebut.
          </p>
        </div>
        <div>
          <FieldLabel>Tahun</FieldLabel>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => goYear(year - 1)}>
              {year - 1}
            </Button>
            <Input value={year} readOnly className="text-center" />
            <Button type="button" variant="secondary" onClick={() => goYear(year + 1)}>
              {year + 1}
            </Button>
          </div>
        </div>
        <div>
          <FieldLabel>Alasan</FieldLabel>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {periods.map((period) => (
          <Card key={period.month} className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-white">
                  {MONTHS[period.month - 1]}
                </p>
                <p className="text-xs text-white/35">{period.year}</p>
              </div>
              <Badge tone={period.status === "closed" ? "danger" : "success"}>
                {period.status === "closed" ? "Closed" : "Open"}
              </Badge>
            </div>

            {period.status === "closed" ? (
              <div className="rounded-xl bg-red-500/[0.04] p-3 text-xs text-white/45">
                Ditutup {period.closed_at ? new Date(period.closed_at).toLocaleString("id-ID") : "—"}
                {period.closed_by_name ? ` oleh ${period.closed_by_name}` : ""}
              </div>
            ) : (
              <div className="rounded-xl bg-emerald-500/[0.04] p-3 text-xs text-white/45">
                Periode masih menerima transaksi.
              </div>
            )}

            {period.notes ? (
              <p className="line-clamp-2 text-xs text-white/35">{period.notes}</p>
            ) : null}

            {period.status === "closed" ? (
              <Button
                type="button"
                variant="secondary"
                disabled={pending || !canReopen}
                onClick={() => unlock(period.month)}
                className="w-full"
              >
                {canReopen ? <Unlock size={16} /> : <RotateCcw size={16} />}
                Buka Kembali
              </Button>
            ) : (
              <Button
                type="button"
                variant="danger"
                disabled={pending}
                onClick={() => lock(period.month)}
                className="w-full"
              >
                <Lock size={16} />
                Tutup Periode
              </Button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
