"use client";

import { Button } from "@sneakervault/ui";
import { exportToExcel, exportToPDF } from "@/lib/export";
import { formatDate, formatRupiah } from "@/lib/format";
import type {
  ArApReportRow,
  GeneralLedgerReportRow,
  JournalReportRow,
  SalesReportRow,
  StockMovementReportRow,
} from "@/lib/queries";
import { Download, FileSpreadsheet } from "lucide-react";

type MandatoryReportsData = {
  generalLedger: GeneralLedgerReportRow[];
  journals: JournalReportRow[];
  sales: SalesReportRow[];
  stockMovements: StockMovementReportRow[];
  arAp: ArApReportRow[];
};

export function MandatoryReportsClient({
  data,
  periodLabel,
}: {
  data: MandatoryReportsData;
  periodLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02]">
      <div className="border-b border-white/[0.04] px-6 py-4">
        <p className="text-sm font-medium text-white/80">Laporan Wajib Client</p>
        <p className="mt-1 text-[11px] text-white/60">
          Buku besar, jurnal, penjualan, kartu stok mutasi, dan utang/piutang.
        </p>
      </div>
      <div className="divide-y divide-white/[0.04]">
        <ReportBlock
          title="Laporan Buku Besar"
          description="Seluruh detail transaksi per akun, dari saldo awal sampai saldo berjalan."
          columns={["Kode", "Akun", "Tanggal", "No Jurnal", "Deskripsi", "Sumber", "Saldo Awal", "Debit", "Kredit", "Saldo Berjalan"]}
          rows={data.generalLedger.map((row) => [
            row.account_code,
            row.account_name,
            formatDate(row.entry_date),
            row.entry_number,
            row.line_description || row.entry_description,
            row.source_type,
            row.opening_balance,
            row.debit,
            row.credit,
            row.running_balance,
          ])}
          preview={data.generalLedger.map((row) => [
            row.account_code,
            formatDate(row.entry_date),
            row.entry_number,
            row.line_description || row.entry_description,
            formatRupiah(row.debit),
            formatRupiah(row.credit),
            formatRupiah(row.running_balance),
          ])}
          periodLabel={periodLabel}
        />
        <ReportBlock
          title="Laporan Jurnal"
          description="Daftar jurnal posted/reversed beserta sumber transaksi."
          columns={["Tanggal", "No Jurnal", "Deskripsi", "Sumber", "Debit", "Kredit", "Status"]}
          rows={data.journals.map((row) => [
            formatDate(row.entry_date),
            row.entry_number,
            row.description,
            row.source_type,
            row.total_debit,
            row.total_credit,
            row.status,
          ])}
          preview={data.journals.map((row) => [
            formatDate(row.entry_date),
            row.entry_number,
            row.description,
            formatRupiah(row.total_debit),
            formatRupiah(row.total_credit),
          ])}
          periodLabel={periodLabel}
        />
        <ReportBlock
          title="Laporan Penjualan"
          description="Invoice penjualan, channel, pembayaran, dan sisa piutang."
          columns={["Tanggal", "Invoice", "Customer", "Channel", "Total", "Dibayar", "Sisa", "Status"]}
          rows={data.sales.map((row) => [
            formatDate(row.invoice_date),
            row.invoice_number,
            row.customer_name,
            row.channel,
            row.total,
            row.paid_amount,
            row.remaining,
            row.status,
          ])}
          preview={data.sales.map((row) => [
            formatDate(row.invoice_date),
            row.invoice_number,
            row.customer_name,
            formatRupiah(row.total),
            row.status,
          ])}
          periodLabel={periodLabel}
        />
        <ReportBlock
          title="Laporan Stock / Kartu Stock"
          description="Kartu stok per produk: saldo awal, setiap mutasi, saldo berjalan, dan saldo akhir periode."
          columns={["Tanggal", "Produk", "SKU", "Tipe", "Saldo Awal", "Masuk", "Keluar", "Adjustment", "Saldo Berjalan", "Saldo Akhir", "HPP", "Referensi"]}
          rows={data.stockMovements.map((row) => [
            formatDate(row.movement_date),
            row.product_label,
            row.sku,
            row.type,
            row.opening_balance,
            row.qty_in,
            row.qty_out,
            row.adjustment,
            row.running_balance,
            row.closing_balance,
            row.unit_cost,
            row.reference_type ?? "",
          ])}
          preview={data.stockMovements.map((row) => [
            formatDate(row.movement_date),
            row.product_label,
            row.sku,
            `${row.opening_balance} → ${row.running_balance}`,
            `Akhir ${row.closing_balance}`,
          ])}
          periodLabel={periodLabel}
        />
        <ReportBlock
          title="Laporan Piutang Customer (AR)"
          description="Piutang belum lunas, dipisahkan dan dikelompokkan berdasarkan customer."
          columns={["Customer", "Dokumen", "Tanggal", "Jatuh Tempo", "Total", "Dibayar", "Sisa"]}
          rows={data.arAp.filter((row) => row.type === "Piutang").map((row) => [
            row.party_name,
            row.document_number,
            formatDate(row.document_date),
            row.due_date ? formatDate(row.due_date) : "-",
            row.total,
            row.paid_amount,
            row.remaining,
          ])}
          preview={data.arAp.filter((row) => row.type === "Piutang").map((row) => [
            row.party_name,
            row.document_number,
            formatRupiah(row.remaining),
            row.due_date ? formatDate(row.due_date) : "-",
          ])}
          periodLabel={periodLabel}
        />
        <ReportBlock
          title="Laporan Utang Supplier (AP)"
          description="Utang belum lunas, dipisahkan dan dikelompokkan berdasarkan supplier."
          columns={["Supplier", "Dokumen", "Tanggal", "Jatuh Tempo", "Total", "Dibayar", "Sisa"]}
          rows={data.arAp.filter((row) => row.type === "Utang").map((row) => [
            row.party_name,
            row.document_number,
            formatDate(row.document_date),
            row.due_date ? formatDate(row.due_date) : "-",
            row.total,
            row.paid_amount,
            row.remaining,
          ])}
          preview={data.arAp.filter((row) => row.type === "Utang").map((row) => [
            row.party_name,
            row.document_number,
            formatRupiah(row.remaining),
            row.due_date ? formatDate(row.due_date) : "-",
          ])}
          periodLabel={periodLabel}
        />
      </div>
    </div>
  );
}

function ReportBlock({
  title,
  description,
  columns,
  rows,
  preview,
  periodLabel,
}: {
  title: string;
  description: string;
  columns: string[];
  rows: (string | number)[][];
  preview: (string | number)[][];
  periodLabel: string;
}) {
  async function doExport(format: "pdf" | "excel") {
    const params = {
      title,
      sheetName: title.slice(0, 31),
      filename:
        format === "pdf"
          ? `${slug(title)}.pdf`
          : `${slug(title)}.xlsx`,
      period: periodLabel,
      columns,
      rows,
      summary: [
        { label: "Jumlah Baris", value: String(rows.length) },
        { label: "Periode", value: periodLabel },
      ],
    };
    if (format === "pdf") await exportToPDF(params);
    else await exportToExcel(params);
  }

  return (
    <section className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white/85">{title}</p>
          <p className="mt-1 text-xs text-white/60">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={rows.length === 0}
            onClick={() => void doExport("pdf")}
          >
            <Download size={14} />
            PDF
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={rows.length === 0}
            onClick={() => void doExport("excel")}
          >
            <FileSpreadsheet size={14} />
            Excel
          </Button>
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-lg border border-white/[0.05]">
        <table className="w-full text-sm">
          <tbody>
            {preview.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-xs text-white/60">
                  Belum ada data.
                </td>
              </tr>
            ) : (
              preview.slice(0, 5).map((row, index) => (
                <tr key={`${title}-${index}`} className="border-b border-white/[0.035] last:border-0">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={`${title}-${index}-${cellIndex}`}
                      className={`px-4 py-2 text-xs ${
                        cellIndex === 0 ? "text-white/75" : "text-white/60"
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
