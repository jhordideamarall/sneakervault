"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, FieldLabel, Input, NumberInput, Select, Textarea } from "@sneakervault/ui";
import { exportToPDF } from "@/lib/export";
import { createPayrollRun } from "@/lib/actions/payroll";
import { useToast } from "@/components/toast";
import type { BankAccountRow, EmployeeRow, PayrollRunRow } from "@/lib/queries";
import { formatDate, formatRupiah } from "@/lib/format";
import { Download, Plus, ReceiptText } from "lucide-react";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function PayrollClient({
  employees,
  bankAccounts,
  runs,
}: {
  employees: EmployeeRow[];
  bankAccounts: BankAccountRow[];
  runs: PayrollRunRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [periodMonth, setPeriodMonth] = useState(currentMonth());
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [bankAccountId, setBankAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState(() =>
    employees
      .filter((employee) => employee.is_active)
      .map((employee) => ({
        employee_id: employee.id,
        employee_name: employee.full_name,
        base_salary: employee.base_salary,
        allowances: 0,
        deductions: 0,
        notes: "",
      })),
  );

  const totals = useMemo(() => {
    const gross = lines.reduce((sum, line) => sum + line.base_salary + line.allowances, 0);
    const deductions = lines.reduce((sum, line) => sum + line.deductions, 0);
    return { gross, deductions, net: gross - deductions };
  }, [lines]);

  function updateLine(index: number, patch: Partial<(typeof lines)[number]>) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  function save() {
    startTransition(async () => {
      const result = await createPayrollRun({
        period_month: periodMonth,
        payment_date: paymentDate,
        bank_account_id: bankAccountId || null,
        notes,
        lines,
      });
      if (result.error) {
        toast.push(Object.values(result.error).flat().join(", "), "error");
        return;
      }
      toast.push("Penggajian diposting", "success");
      setFormOpen(false);
      router.refresh();
    });
  }

  async function exportPayslip(run: PayrollRunRow) {
    await exportToPDF({
      title: `Slip Gaji ${run.period_month}`,
      sheetName: "Slip Gaji",
      filename: `slip-gaji-${run.period_month}.pdf`,
      period: run.period_month,
      sections: run.lines.map((line) => ({
        title: line.employee_name,
        columns: ["Komponen", "Nilai"],
        rows: [
          ["Gaji Pokok", line.base_salary],
          ["Tunjangan", line.allowances],
          ["Potongan", line.deductions],
          ["Take Home Pay", line.net_salary],
        ],
        summary: [
          { label: "Periode", value: run.period_month },
          { label: "Tanggal Bayar", value: formatDate(run.payment_date) },
        ],
      })),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] text-white/80">
            <ReceiptText size={20} strokeWidth={1.7} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">Penggajian</h1>
            <p className="text-sm text-white/45">
              Jalankan gaji, posting jurnal, dan download slip gaji.
            </p>
          </div>
        </div>
        <Button type="button" onClick={() => setFormOpen((open) => !open)}>
          <Plus size={16} />
          Proses Gaji
        </Button>
      </div>

      {formOpen ? (
        <Card className="space-y-4 p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <div><FieldLabel>Periode</FieldLabel><Input type="month" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} /></div>
            <div><FieldLabel>Tanggal Bayar</FieldLabel><Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></div>
            <div className="md:col-span-2"><FieldLabel>Akun Bayar</FieldLabel><Select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}><option value="">— Posting sebagai Hutang Gaji —</option>{bankAccounts.filter((account) => account.is_active).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</Select></div>
          </div>
          <div className="overflow-hidden rounded-lg border border-white/[0.06]">
            <table className="w-full text-sm">
              <thead className="bg-[#1f1f1f] text-left text-[11px] uppercase tracking-wider text-white/35"><tr><th className="px-3 py-2">Karyawan</th><th className="px-3 py-2 text-right">Gaji</th><th className="px-3 py-2 text-right">Tunjangan</th><th className="px-3 py-2 text-right">Potongan</th><th className="px-3 py-2 text-right">Net</th></tr></thead>
              <tbody className="divide-y divide-white/[0.04]">
                {lines.map((line, index) => (
                  <tr key={line.employee_id}>
                    <td className="px-3 py-2 text-white">{line.employee_name}</td>
                    <td className="px-3 py-2"><NumberInput value={line.base_salary} onValueChange={(value) => updateLine(index, { base_salary: value })} /></td>
                    <td className="px-3 py-2"><NumberInput value={line.allowances} onValueChange={(value) => updateLine(index, { allowances: value })} /></td>
                    <td className="px-3 py-2"><NumberInput value={line.deductions} onValueChange={(value) => updateLine(index, { deductions: value })} /></td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-300">{formatRupiah(line.base_salary + line.allowances - line.deductions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div><FieldLabel>Catatan</FieldLabel><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="flex items-center justify-between">
            <div className="text-sm text-white/60">Gaji net: <span className="font-semibold text-white">{formatRupiah(totals.net)}</span></div>
            <div className="flex gap-2"><Button variant="secondary" onClick={() => setFormOpen(false)}>Batal</Button><Button disabled={pending || lines.length === 0 || totals.net < 0} onClick={save}>Posting Penggajian</Button></div>
          </div>
        </Card>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-[#262626]">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-white/35"><tr><th className="px-4 py-3">Periode</th><th className="px-4 py-3">Tanggal Bayar</th><th className="px-4 py-3 text-right">Gross</th><th className="px-4 py-3 text-right">Potongan</th><th className="px-4 py-3 text-right">Net</th><th className="px-4 py-3 text-right">Slip Gaji</th></tr></thead>
          <tbody className="divide-y divide-white/[0.04]">
            {runs.map((run) => (
              <tr key={run.id}>
                <td className="px-4 py-3 font-mono text-white">{run.period_month}</td>
                <td className="px-4 py-3 text-white/60">{formatDate(run.payment_date)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-white">{formatRupiah(run.gross_amount)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-amber-300">{formatRupiah(run.deductions)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-emerald-300">{formatRupiah(run.net_amount)}</td>
                <td className="px-4 py-3 text-right"><Button size="sm" variant="secondary" onClick={() => exportPayslip(run)}><Download size={14} /> PDF</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
