"use client";

import { formatRupiah as formatRp } from "@/lib/format";

export type ExportRow = (string | number | null | undefined)[];

export interface ReportSection {
  title: string;
  columns: string[];
  rows: ExportRow[];
  summary?: { label: string; value: string }[];
}

export interface ExportParams {
  title: string;
  sheetName?: string;
  sections?: ReportSection[];
  // Legacy single-table support
  columns?: string[];
  rows?: ExportRow[];
  summary?: { label: string; value: string }[];
  subtitle?: string;
  filename?: string;
  companyName?: string;
  period?: string;
}

const COMPANY = "Dewinst.id";

function formatCell(c: string | number | null | undefined): string {
  if (c == null) return "";
  if (typeof c === "number") return c >= 1000 ? formatRp(c) : String(c);
  return String(c);
}

export async function exportToPDF(params: ExportParams) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF("portrait");
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(params.companyName ?? COMPANY, 14, y);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text("CONFIDENTIAL", pageWidth - 14, y, { align: "right" });

  y += 10;
  doc.setDrawColor(200);
  doc.line(14, y, pageWidth - 14, y);

  y += 8;
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text(params.title, 14, y);

  y += 6;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  const period = params.period ?? new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  doc.text(`Periode: ${period}`, 14, y);
  doc.text(`Tanggal cetak: ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })} ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`, pageWidth - 14, y, { align: "right" });
  y += 8;

  // Render sections
  const sections = params.sections ?? [{ title: "", columns: params.columns ?? [], rows: params.rows ?? [], summary: params.summary }];

  for (let si = 0; si < sections.length; si++) {
    const section = sections[si]!;

    // Section title
    if (section.title) {
      if (y > doc.internal.pageSize.getHeight() - 60) {
        doc.addPage();
        y = 20;
      }
      y += 6;
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(26, 26, 46);
      doc.text(`${si + 1}. ${section.title}`, 14, y);
      y += 4;
    }

    // Section summary
    if (section.summary && section.summary.length > 0) {
      y += 4;
      doc.setFillColor(245, 245, 250);
      doc.roundedRect(14, y - 4, pageWidth - 28, 18, 2, 2, "F");
      const colWidth = (pageWidth - 28) / section.summary.length;
      section.summary.forEach((s, i) => {
        const x = 14 + colWidth * i + 8;
        doc.setFontSize(7);
        doc.setTextColor(100);
        doc.setFont("helvetica", "normal");
        doc.text(s.label, x, y + 2);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0);
        doc.text(s.value, x, y + 9);
      });
      y += 20;
    }

    // Section table
    if (section.columns.length > 0 && section.rows.length > 0) {
      autoTable(doc, {
        startY: y + 2,
        head: [section.columns],
        body: section.rows.map(r => r.map(formatCell)),
        headStyles: { fillColor: [26, 26, 46], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold", cellPadding: 3 },
        bodyStyles: { fontSize: 7.5, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [248, 248, 252] },
        columnStyles: numericColumnStyles(section.columns),
        didDrawPage: (data) => {
          doc.setFontSize(7);
          doc.setTextColor(150);
          doc.text(`${params.companyName ?? COMPANY} — ${params.title}`, 14, doc.internal.pageSize.getHeight() - 8);
          doc.text(`Halaman ${data.pageNumber}`, pageWidth - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
        },
      });
      y = ((doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 8;
    }
  }

  const filename = params.filename ?? `${COMPANY}-${params.title.toLowerCase().replace(/\s+/g, "-")}-${isoDate()}.pdf`;
  doc.save(filename);
}

export async function exportToExcel(params: ExportParams) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const sections = params.sections ?? [{ title: params.sheetName ?? params.title, columns: params.columns ?? [], rows: params.rows ?? [], summary: params.summary }];

  // All in one sheet
  const allRows: (string | number)[][] = [
    [params.companyName ?? COMPANY],
    [params.title],
    [`Periode: ${params.period ?? new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" })}`],
    [`Tanggal cetak: ${new Date().toLocaleDateString("id-ID")} ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`],
    [],
  ];

  for (const section of sections) {
    if (section.title) allRows.push([section.title]);

    if (section.summary && section.summary.length > 0) {
      allRows.push(section.summary.map(s => s.label));
      allRows.push(section.summary.map(s => s.value));
      allRows.push([]);
    }

    if (section.columns.length > 0) {
      allRows.push(section.columns);
      for (const row of section.rows) {
        allRows.push(row.map(c => c ?? "") as (string | number)[]);
      }
      allRows.push([]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(allRows);
  const maxCols = Math.max(...allRows.map(r => r.length));
  ws["!cols"] = Array.from({ length: maxCols }, () => ({ wch: 18 }));

  XLSX.utils.book_append_sheet(wb, ws, (params.sheetName ?? params.title).slice(0, 31));
  const filename = params.filename ?? `${COMPANY}-${params.title.toLowerCase().replace(/\s+/g, "-")}-${isoDate()}.xlsx`;
  XLSX.writeFile(wb, filename);
}

function isoDate() {
  return new Date().toISOString().slice(0, 10);
}

function numericColumnStyles(columns: string[]) {
  const styles: Record<number, { halign: "right" | "left" | "center" }> = {};
  columns.forEach((col, i) => {
    const lower = col.toLowerCase();
    if (lower.includes("revenue") || lower.includes("profit") || lower.includes("modal") || lower.includes("hpp") || lower.includes("harga") || lower.includes("unit") || lower.includes("margin") || lower.includes("stok") || lower.includes("qty") || lower.includes("no") || lower.includes("rate") || lower.includes("total") || lower.includes("nilai")) {
      styles[i] = { halign: "right" };
    }
  });
  return styles;
}
