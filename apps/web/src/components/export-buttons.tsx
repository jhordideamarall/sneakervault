"use client";

import { Button } from "@sneakervault/ui";
import { exportToPDF, exportToExcel, type ExportRow } from "@/lib/export";
import { FileSpreadsheet, FileText } from "lucide-react";

export function ExportButtons({
  title,
  sheetName,
  columns,
  rows,
  subtitle,
  pdfLabel = "Export PDF",
  excelLabel = "Export Excel",
}: {
  title: string;
  sheetName: string;
  columns: string[];
  rows: ExportRow[];
  subtitle?: string;
  pdfLabel?: string;
  excelLabel?: string;
}) {
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          exportToPDF({ title, columns, rows, subtitle, period: subtitle })
        }
      >
        <FileText size={14} className="mr-1.5" />
        {pdfLabel}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          exportToExcel({
            title: sheetName,
            sheetName,
            columns,
            rows,
            period: subtitle,
          })
        }
      >
        <FileSpreadsheet size={14} className="mr-1.5" />
        {excelLabel}
      </Button>
    </div>
  );
}
