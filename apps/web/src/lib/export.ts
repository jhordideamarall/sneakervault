"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export type ExportRow = (string | number | null | undefined)[];

export function exportToPDF(params: {
  title: string;
  columns: string[];
  rows: ExportRow[];
  filename?: string;
  subtitle?: string;
}) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(params.title, 14, 20);
  if (params.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(params.subtitle, 14, 27);
    doc.setTextColor(0);
  }
  doc.setFontSize(9);
  doc.text(`Diekspor: ${new Date().toLocaleString("id-ID")}`, 14, params.subtitle ? 33 : 27);

  autoTable(doc, {
    startY: params.subtitle ? 38 : 32,
    head: [params.columns],
    body: params.rows.map((r) => r.map((c) => (c == null ? "" : String(c)))),
    headStyles: { fillColor: [26, 26, 46] },
    styles: { fontSize: 8, cellPadding: 2 },
  });

  const filename = params.filename ?? `${params.title.toLowerCase().replace(/\s+/g, "-")}-${isoDate()}.pdf`;
  doc.save(filename);
}

export function exportToExcel(params: {
  sheetName: string;
  columns: string[];
  rows: ExportRow[];
  filename?: string;
}) {
  const aoa = [params.columns, ...params.rows.map((r) => r.map((c) => (c == null ? "" : c)))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, params.sheetName.slice(0, 31));
  const filename = params.filename ?? `${params.sheetName.toLowerCase().replace(/\s+/g, "-")}-${isoDate()}.xlsx`;
  XLSX.writeFile(wb, filename);
}

function isoDate() {
  return new Date().toISOString().slice(0, 10);
}
