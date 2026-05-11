"use client";

export type ExportRow = (string | number | null | undefined)[];

export interface ExportParams {
  title: string;
  sheetName?: string;
  columns: string[];
  rows: ExportRow[];
  filename?: string;
  subtitle?: string;
  summary?: { label: string; value: string }[];
  companyName?: string;
  period?: string;
}

const COMPANY = "SneakerVault";

export async function exportToPDF(params: ExportParams) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF("landscape");
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  // Header — Company name + report title
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
  doc.setFontSize(13);
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

  // Summary section
  if (params.summary && params.summary.length > 0) {
    y += 10;
    doc.setFillColor(245, 245, 250);
    doc.roundedRect(14, y - 4, pageWidth - 28, 20, 2, 2, "F");
    
    const colWidth = (pageWidth - 28) / params.summary.length;
    params.summary.forEach((s, i) => {
      const x = 14 + colWidth * i + 8;
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(s.label, x, y + 3);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0);
      doc.text(s.value, x, y + 11);
      doc.setFont("helvetica", "normal");
    });
    y += 22;
  }

  y += 6;

  // Table
  autoTable(doc, {
    startY: y,
    head: [params.columns],
    body: params.rows.map((r) => r.map((c) => {
      if (c == null) return "";
      if (typeof c === "number") return formatCurrency(c);
      return String(c);
    })),
    headStyles: {
      fillColor: [26, 26, 46],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: 3,
    },
    alternateRowStyles: {
      fillColor: [248, 248, 252],
    },
    columnStyles: numericColumnStyles(params.columns),
    didDrawPage: (data) => {
      // Footer on every page
      const pageCount = (doc as any).internal.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(
        `${params.companyName ?? COMPANY} — ${params.title}`,
        14,
        doc.internal.pageSize.getHeight() - 8
      );
      doc.text(
        `Halaman ${data.pageNumber} dari ${pageCount}`,
        pageWidth - 14,
        doc.internal.pageSize.getHeight() - 8,
        { align: "right" }
      );
    },
  });

  const filename = params.filename ?? `${COMPANY}-${params.title.toLowerCase().replace(/\s+/g, "-")}-${isoDate()}.pdf`;
  doc.save(filename);
}

export async function exportToExcel(params: ExportParams) {
  const XLSX = await import("xlsx");

  const wb = XLSX.utils.book_new();

  // Build header rows
  const headerRows: (string | number)[][] = [
    [params.companyName ?? COMPANY],
    [params.title],
    [`Periode: ${params.period ?? new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" })}`],
    [`Tanggal cetak: ${new Date().toLocaleDateString("id-ID")} ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`],
    [], // empty row
  ];

  // Summary row
  if (params.summary && params.summary.length > 0) {
    headerRows.push(params.summary.map(s => s.label));
    headerRows.push(params.summary.map(s => s.value));
    headerRows.push([]);
  }

  // Column headers + data
  const dataRows = [
    params.columns,
    ...params.rows.map((r) => r.map((c) => c ?? "")),
  ];

  const allRows = [...headerRows, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(allRows);

  // Column widths — auto-fit based on content
  const colWidths = params.columns.map((col, i) => {
    const maxLen = Math.max(
      col.length,
      ...params.rows.map(r => String(r[i] ?? "").length)
    );
    return { wch: Math.min(Math.max(maxLen + 2, 10), 30) };
  });
  ws["!cols"] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, (params.sheetName ?? params.title).slice(0, 31));

  const filename = params.filename ?? `${COMPANY}-${params.title.toLowerCase().replace(/\s+/g, "-")}-${isoDate()}.xlsx`;
  XLSX.writeFile(wb, filename);
}

// Helpers
function isoDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatCurrency(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)} jt`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function numericColumnStyles(columns: string[]) {
  const styles: Record<number, { halign: "right" | "left" | "center" }> = {};
  columns.forEach((col, i) => {
    const lower = col.toLowerCase();
    if (lower.includes("revenue") || lower.includes("profit") || lower.includes("modal") || lower.includes("hpp") || lower.includes("harga") || lower.includes("terjual") || lower.includes("stok") || lower.includes("margin") || lower.includes("no") || lower.includes("unit")) {
      styles[i] = { halign: "right" };
    }
  });
  return styles;
}
