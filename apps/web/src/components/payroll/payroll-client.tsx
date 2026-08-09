"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  FieldLabel,
  Input,
  NumberInput,
  Select,
  Textarea,
} from "@sneakervault/ui";
import { exportToPDF } from "@/lib/export";
import {
  createPayrollRun,
  settlePayrollLiability,
  updatePayrollRun,
} from "@/lib/actions/payroll";
import { useToast } from "@/components/toast";
import type {
  BankAccountRow,
  EmployeeRow,
  PayrollRunRow,
} from "@/lib/queries";
import { formatDate, formatRupiah } from "@/lib/format";
import {
  Download,
  Pencil,
  Plus,
  ReceiptText,
  Trash2,
  UserPlus,
  WalletCards,
} from "lucide-react";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

type PayrollComponentDraft = {
  name: string;
  kind: "earning" | "deduction";
  amount: number;
};

type PayrollLineDraft = {
  employee_id: string;
  employee_name: string;
  notes: string;
  components: PayrollComponentDraft[];
};

const componentSuggestions = [
  "Gaji Pokok",
  "Upah Harian",
  "Lembur",
  "THR",
  "Bonus",
  "Pendapatan Lain",
  "BPJS",
  "PPh 21",
  "Keterlambatan",
  "Potongan Lain",
];

function lineTotals(line: PayrollLineDraft) {
  const gross = line.components
    .filter((component) => component.kind === "earning")
    .reduce((sum, component) => sum + component.amount, 0);
  const deductions = line.components
    .filter((component) => component.kind === "deduction")
    .reduce((sum, component) => sum + component.amount, 0);
  return { gross, deductions, net: gross - deductions };
}

function lineFromEmployee(employee: EmployeeRow): PayrollLineDraft {
  return {
    employee_id: employee.id,
    employee_name: employee.full_name,
    notes: "",
    components: [
      {
        name: "Gaji Pokok",
        kind: "earning",
        amount: employee.base_salary,
      },
    ],
  };
}

function draftFromStoredLine(
  line: PayrollRunRow["lines"][number],
): PayrollLineDraft {
  const components = line.components.length
    ? line.components.map(({ name, kind, amount }) => ({ name, kind, amount }))
    : [
        { name: "Gaji Pokok", kind: "earning" as const, amount: line.base_salary },
        ...(line.allowances > 0
          ? [{ name: "Tunjangan", kind: "earning" as const, amount: line.allowances }]
          : []),
        ...(line.deductions > 0
          ? [{ name: "Potongan", kind: "deduction" as const, amount: line.deductions }]
          : []),
      ];
  return {
    employee_id: line.employee_id,
    employee_name: line.employee_name,
    notes: line.notes ?? "",
    components,
  };
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
  const [editingRun, setEditingRun] = useState<PayrollRunRow | null>(null);
  const [periodMonth, setPeriodMonth] = useState(currentMonth());
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [bankAccountId, setBankAccountId] = useState("");
  const [employeeIdToAdd, setEmployeeIdToAdd] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<PayrollLineDraft[]>([]);
  const [settlingRun, setSettlingRun] = useState<PayrollRunRow | null>(null);
  const [settlementBankId, setSettlementBankId] = useState("");
  const [settlementDate, setSettlementDate] = useState(
    new Date().toISOString().slice(0, 10),
  );

  const availableEmployees = employees.filter(
    (employee) =>
      employee.is_active &&
      !lines.some((line) => line.employee_id === employee.id),
  );

  const totals = useMemo(
    () =>
      lines.reduce(
        (sum, line) => {
          const current = lineTotals(line);
          return {
            gross: sum.gross + current.gross,
            deductions: sum.deductions + current.deductions,
            net: sum.net + current.net,
          };
        },
        { gross: 0, deductions: 0, net: 0 },
      ),
    [lines],
  );

  function openCreate() {
    setEditingRun(null);
    setPeriodMonth(currentMonth());
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setBankAccountId("");
    setEmployeeIdToAdd("");
    setNotes("");
    setLines([]);
    setFormOpen(true);
  }

  function openEdit(run: PayrollRunRow) {
    setEditingRun(run);
    setPeriodMonth(run.period_month);
    setPaymentDate(run.payment_date);
    setBankAccountId(run.payment_status === "payable" ? "" : (run.bank_account_id ?? ""));
    setEmployeeIdToAdd("");
    setNotes(run.notes ?? "");
    setLines(run.lines.map(draftFromStoredLine));
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingRun(null);
  }

  function addEmployee() {
    const employee = employees.find((item) => item.id === employeeIdToAdd);
    if (!employee) return;
    setLines((current) => [...current, lineFromEmployee(employee)]);
    setEmployeeIdToAdd("");
  }

  function addComponent(
    lineIndex: number,
    kind: PayrollComponentDraft["kind"],
  ) {
    setLines((current) =>
      current.map((line, index) =>
        index === lineIndex
          ? {
              ...line,
              components: [
                ...line.components,
                {
                  name: kind === "earning" ? "Pendapatan Lain" : "Potongan Lain",
                  kind,
                  amount: 0,
                },
              ],
            }
          : line,
      ),
    );
  }

  function updateComponent(
    lineIndex: number,
    componentIndex: number,
    patch: Partial<PayrollComponentDraft>,
  ) {
    setLines((current) =>
      current.map((line, index) =>
        index === lineIndex
          ? {
              ...line,
              components: line.components.map((component, currentIndex) =>
                currentIndex === componentIndex
                  ? { ...component, ...patch }
                  : component,
              ),
            }
          : line,
      ),
    );
  }

  function removeComponent(lineIndex: number, componentIndex: number) {
    setLines((current) =>
      current.map((line, index) =>
        index === lineIndex
          ? {
              ...line,
              components: line.components.filter(
                (_, currentIndex) => currentIndex !== componentIndex,
              ),
            }
          : line,
      ),
    );
  }

  function save() {
    const invalidLine = lines.find((line) => {
      const totalsForLine = lineTotals(line);
      return (
        line.components.length === 0 ||
        line.components.some((component) => !component.name.trim()) ||
        totalsForLine.gross <= 0 ||
        totalsForLine.net < 0
      );
    });
    if (invalidLine) {
      toast.push(
        `Periksa komponen ${invalidLine.employee_name}: pendapatan wajib ada dan potongan tidak boleh melebihi pendapatan`,
        "error",
      );
      return;
    }

    startTransition(async () => {
      const payload = {
        period_month: periodMonth,
        payment_date: paymentDate,
        bank_account_id: bankAccountId || null,
        notes,
        lines: lines.map((line) => {
          const current = lineTotals(line);
          const baseSalary =
            line.components.find(
              (component) =>
                component.kind === "earning" &&
                component.name.trim().toLocaleLowerCase("id-ID") ===
                  "gaji pokok",
            )?.amount ?? 0;
          return {
            employee_id: line.employee_id,
            base_salary: baseSalary,
            allowances: current.gross - baseSalary,
            deductions: current.deductions,
            components: line.components,
            notes: line.notes,
          };
        }),
      };
      const result = editingRun
        ? await updatePayrollRun(editingRun.id, payload)
        : await createPayrollRun(payload);
      if (result.error) {
        toast.push(Object.values(result.error).flat().join(", "), "error");
        return;
      }
      toast.push(
        editingRun ? "Penggajian diperbarui" : "Penggajian diposting",
        "success",
      );
      closeForm();
      router.refresh();
    });
  }

  function payLiability() {
    if (!settlingRun || !settlementBankId) return;
    startTransition(async () => {
      const result = await settlePayrollLiability({
        run_id: settlingRun.id,
        bank_account_id: settlementBankId,
        payment_date: settlementDate,
      });
      if (result.error) {
        toast.push(result.error, "error");
        return;
      }
      toast.push("Hutang Gaji berhasil dibayar", "success");
      setSettlingRun(null);
      setSettlementBankId("");
      router.refresh();
    });
  }

  async function exportPayslip(
    run: PayrollRunRow,
    line: PayrollRunRow["lines"][number],
  ) {
    const components = line.components.length
      ? line.components
      : draftFromStoredLine(line).components;
    await exportToPDF({
      title: `Slip Gaji — ${line.employee_name}`,
      sheetName: "Slip Gaji",
      filename: `slip-gaji-${run.period_month}-${line.employee_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}.pdf`,
      period: run.period_month,
      sections: [
        {
          title: line.employee_name,
          columns: ["Komponen", "Jenis", "Nilai"],
          rows: [
            ...components.map((component) => [
              component.name,
              component.kind === "earning" ? "Pendapatan" : "Potongan",
              component.amount,
            ]),
            ["Take Home Pay", "Dibayarkan", line.net_salary],
          ],
          summary: [
            { label: "Periode", value: run.period_month },
            { label: "Tanggal", value: formatDate(run.payment_date) },
            {
              label: "Status Bayar",
              value: run.payment_status === "paid" ? "Lunas" : "Hutang Gaji",
            },
          ],
        },
      ],
    });
  }

  return (
    <div className="space-y-6">
      <datalist id="payroll-component-suggestions">
        {componentSuggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] text-white/80">
            <ReceiptText size={20} strokeWidth={1.7} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">Penggajian</h1>
            <p className="text-sm text-white/45">
              Pilih karyawan satu per satu, isi komponen, lalu unduh slip individual.
            </p>
          </div>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus size={16} /> Proses Gaji
        </Button>
      </div>

      {formOpen ? (
        <Card className="space-y-5 p-5">
          <div>
            <h2 className="text-base font-semibold text-white">
              {editingRun
                ? `Edit Payroll ${editingRun.period_month}`
                : "Proses Payroll Baru"}
            </h2>
            <p className="mt-1 text-xs text-white/45">
              Karyawan tidak dimuat otomatis. Tambahkan hanya karyawan yang akan diproses.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <FieldLabel>Periode</FieldLabel>
              <Input type="month" value={periodMonth} onChange={(event) => setPeriodMonth(event.target.value)} />
            </div>
            <div>
              <FieldLabel>Tanggal Posting/Bayar</FieldLabel>
              <Input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
            </div>
            <div className="md:col-span-2">
              <FieldLabel>Akun Bayar</FieldLabel>
              <Select value={bankAccountId} onChange={(event) => setBankAccountId(event.target.value)}>
                <option value="">— Catat sebagai Hutang Gaji —</option>
                {bankAccounts.filter((account) => account.is_active).map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-black/10 p-3 md:flex-row">
            <Select value={employeeIdToAdd} onChange={(event) => setEmployeeIdToAdd(event.target.value)}>
              <option value="">Pilih karyawan aktif…</option>
              {availableEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.full_name}</option>
              ))}
            </Select>
            <Button type="button" variant="secondary" disabled={!employeeIdToAdd} onClick={addEmployee}>
              <UserPlus size={15} /> Tambah Karyawan
            </Button>
          </div>

          {lines.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/40">
              Belum ada karyawan. Pilih satu karyawan di atas untuk mulai.
            </div>
          ) : (
            <div className="space-y-3">
              {lines.map((line, lineIndex) => {
                const current = lineTotals(line);
                return (
                  <div key={line.employee_id} className="rounded-lg border border-white/[0.07] bg-[#202020] p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-white">{line.employee_name}</div>
                        <div className="text-xs text-white/40">Net {formatRupiah(current.net)}</div>
                      </div>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setLines((items) => items.filter((_, index) => index !== lineIndex))}>
                        <Trash2 size={14} /> Hapus
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {line.components.map((component, componentIndex) => (
                        <div key={`${line.employee_id}-${componentIndex}`} className="grid gap-2 md:grid-cols-[1fr_150px_220px_44px]">
                          <Input
                            list="payroll-component-suggestions"
                            aria-label="Nama komponen payroll"
                            value={component.name}
                            onChange={(event) => updateComponent(lineIndex, componentIndex, { name: event.target.value })}
                          />
                          <Select
                            aria-label="Jenis komponen payroll"
                            value={component.kind}
                            onChange={(event) => updateComponent(lineIndex, componentIndex, { kind: event.target.value as PayrollComponentDraft["kind"] })}
                          >
                            <option value="earning">Pendapatan</option>
                            <option value="deduction">Potongan</option>
                          </Select>
                          <NumberInput value={component.amount} onValueChange={(amount) => updateComponent(lineIndex, componentIndex, { amount })} />
                          <Button type="button" size="sm" variant="ghost" aria-label="Hapus komponen" onClick={() => removeComponent(lineIndex, componentIndex)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button type="button" size="sm" variant="secondary" onClick={() => addComponent(lineIndex, "earning")}>+ Pendapatan</Button>
                      <Button type="button" size="sm" variant="secondary" onClick={() => addComponent(lineIndex, "deduction")}>+ Potongan</Button>
                      <span className="ml-auto text-xs text-white/45">
                        Gross {formatRupiah(current.gross)} · Potongan {formatRupiah(current.deductions)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div><FieldLabel>Catatan</FieldLabel><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
          <div className="flex flex-col justify-between gap-3 border-t border-white/[0.06] pt-4 md:flex-row md:items-center">
            <div className="text-sm text-white/60">
              {lines.length} karyawan · Net <span className="font-semibold text-white">{formatRupiah(totals.net)}</span>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={closeForm}>Batal</Button>
              <Button type="button" disabled={pending || lines.length === 0 || totals.net < 0} onClick={save}>
                {editingRun ? "Simpan Revisi" : "Posting Penggajian"}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {settlingRun ? (
        <Card className="space-y-4 border-amber-400/20 p-5">
          <div>
            <h2 className="font-semibold text-white">Bayar Hutang Gaji {settlingRun.period_month}</h2>
            <p className="text-sm text-white/45">Nilai pembayaran {formatRupiah(settlingRun.net_amount)}.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="md:col-span-2">
              <FieldLabel>Akun Kas/Bank *</FieldLabel>
              <Select value={settlementBankId} onChange={(event) => setSettlementBankId(event.target.value)}>
                <option value="">Pilih akun pembayaran…</option>
                {bankAccounts.filter((account) => account.is_active).map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel>Tanggal Bayar *</FieldLabel>
              <Input type="date" value={settlementDate} onChange={(event) => setSettlementDate(event.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setSettlingRun(null)}>Batal</Button>
            <Button type="button" disabled={pending || !settlementBankId} onClick={payLiability}>Bayar Sekarang</Button>
          </div>
        </Card>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-white/[0.06] bg-[#262626]">
        <table className="w-full min-w-[780px] text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-white/35">
            <tr><th className="px-4 py-3">Periode</th><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3">Pembayaran</th><th className="px-4 py-3 text-right">Gross</th><th className="px-4 py-3 text-right">Potongan</th><th className="px-4 py-3 text-right">Net</th><th className="px-4 py-3 text-right">Aksi</th></tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {runs.map((run) => (
              <tr key={run.id}>
                <td className="px-4 py-3 font-mono text-white">{run.period_month}</td>
                <td className="px-4 py-3 text-white/60">{formatDate(run.payment_date)}</td>
                <td className="px-4 py-3">
                  <span className={run.payment_status === "paid" ? "text-emerald-300" : "text-amber-300"}>
                    {run.payment_status === "paid" ? (run.bank_account_name ?? "Lunas") : "Hutang Gaji"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-white">{formatRupiah(run.gross_amount)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-amber-300">{formatRupiah(run.deductions)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-emerald-300">{formatRupiah(run.net_amount)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-2">
                    {!run.liability_settled_at ? (
                      <Button size="sm" variant="secondary" onClick={() => openEdit(run)}><Pencil size={14} /> Edit</Button>
                    ) : null}
                    {run.payment_status === "payable" ? (
                      <Button size="sm" onClick={() => { setSettlingRun(run); setSettlementBankId(""); }}><WalletCards size={14} /> Bayar Hutang</Button>
                    ) : null}
                    <details className="relative">
                      <summary className="cursor-pointer list-none rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5">
                        <Download size={14} className="mr-1 inline" /> Slip
                      </summary>
                      <div className="absolute right-0 z-20 mt-2 min-w-56 rounded-lg border border-white/10 bg-[#191919] p-2 shadow-xl">
                        {run.lines.map((line) => (
                          <button key={line.id} type="button" className="block w-full rounded px-3 py-2 text-left text-xs text-white/70 hover:bg-white/5 hover:text-white" onClick={() => exportPayslip(run, line)}>
                            {line.employee_name}
                          </button>
                        ))}
                      </div>
                    </details>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
