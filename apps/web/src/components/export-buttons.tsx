"use client";

import { Button } from "@sneakervault/ui";
import { exportToPDF, exportToExcel, type ExportRow } from "@/lib/export";

export function ExportButtons({
  title,
  sheetName,
  columns,
  rows,
  subtitle,
}: {
  title: string;
  sheetName: string;
  columns: string[];
  rows: ExportRow[];
  subtitle?: string;
}) {
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="secondary"
        onClick={() => exportToPDF({ title, columns, rows, subtitle })}
      >
        📄 Export PDF
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => exportToExcel({ sheetName, columns, rows })}
      >
        📊 Export Excel
      </Button>
    </div>
  );
}
