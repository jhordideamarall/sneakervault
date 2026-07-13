"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, FieldLabel, Input, NumberInput } from "@sneakervault/ui";
import { createEmployee, deactivateEmployee } from "@/lib/actions/employees";
import { useToast } from "@/components/toast";
import type { EmployeeRow } from "@/lib/queries";
import { formatRupiah } from "@/lib/format";
import { Plus, Users } from "lucide-react";

const emptyForm = {
  employee_code: "",
  full_name: "",
  job_title: "",
  department: "",
  base_salary: 0,
  bank_account_name: "",
  bank_account_number: "",
  tax_id: "",
  hire_date: "",
  is_active: true,
};

export function EmployeesClient({ employees }: { employees: EmployeeRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  function save() {
    startTransition(async () => {
      const result = await createEmployee(form);
      if (result.error) {
        toast.push(Object.values(result.error).flat().join(", "), "error");
        return;
      }
      toast.push("Karyawan ditambahkan", "success");
      setForm(emptyForm);
      setFormOpen(false);
      router.refresh();
    });
  }

  function archive(id: string) {
    startTransition(async () => {
      const result = await deactivateEmployee(id);
      if (result.error) {
        toast.push(result.error, "error");
        return;
      }
      toast.push("Karyawan dinonaktifkan", "success");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] text-white/80">
            <Users size={20} strokeWidth={1.7} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">Data Karyawan</h1>
            <p className="text-sm text-white/45">
              Master employee untuk payroll dan slip gaji.
            </p>
          </div>
        </div>
        <Button type="button" onClick={() => setFormOpen((open) => !open)}>
          <Plus size={16} />
          Karyawan Baru
        </Button>
      </div>

      {formOpen ? (
        <Card className="grid gap-3 p-5 md:grid-cols-4">
          <div>
            <FieldLabel>Kode</FieldLabel>
            <Input value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} />
          </div>
          <div>
            <FieldLabel>Nama *</FieldLabel>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <FieldLabel>Jabatan</FieldLabel>
            <Input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
          </div>
          <div>
            <FieldLabel>Departemen</FieldLabel>
            <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          </div>
          <div>
            <FieldLabel>Gaji Pokok</FieldLabel>
            <NumberInput value={form.base_salary} onValueChange={(value) => setForm({ ...form, base_salary: value })} />
          </div>
          <div>
            <FieldLabel>Bank</FieldLabel>
            <Input value={form.bank_account_name} onChange={(e) => setForm({ ...form, bank_account_name: e.target.value })} />
          </div>
          <div>
            <FieldLabel>No Rekening</FieldLabel>
            <Input value={form.bank_account_number} onChange={(e) => setForm({ ...form, bank_account_number: e.target.value })} />
          </div>
          <div>
            <FieldLabel>Tanggal Masuk</FieldLabel>
            <Input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} />
          </div>
          <div className="md:col-span-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>Batal</Button>
            <Button type="button" disabled={pending || !form.full_name.trim()} onClick={save}>
              Simpan
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-[#262626]">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-white/35">
            <tr>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Jabatan</th>
              <th className="px-4 py-3">Departemen</th>
              <th className="px-4 py-3 text-right">Gaji Pokok</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {employees.map((employee) => (
              <tr key={employee.id}>
                <td className="px-4 py-3 text-white">
                  {employee.full_name}
                  {employee.employee_code ? (
                    <div className="font-mono text-[11px] text-white/35">{employee.employee_code}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-white/60">{employee.job_title ?? "—"}</td>
                <td className="px-4 py-3 text-white/60">{employee.department ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-white">{formatRupiah(employee.base_salary)}</td>
                <td className="px-4 py-3 text-right">
                  {employee.is_active ? (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => archive(employee.id)}>
                      Nonaktif
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
