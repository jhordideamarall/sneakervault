"use client";

import { useState, useTransition } from "react";
import { createSupplier, updateSupplier, deactivateSupplier } from "@/lib/actions/suppliers";
import { Button, Card, Input, FieldLabel, FieldError, Alert } from "@sneakervault/ui";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";

type Supplier = {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
};

const emptyForm = {
  name: "",
  contact_person: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
};

export function SuppliersClient({
  suppliers,
  roles,
}: {
  suppliers: Supplier[];
  roles: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const canManage = roles.includes("owner") || roles.includes("admin_gudang");
  const canDeactivate = roles.includes("owner");

  function startEdit(s: Supplier) {
    setEditing(s);
    setForm({
      name: s.name,
      contact_person: s.contact_person ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      address: s.address ?? "",
      notes: s.notes ?? "",
    });
    setFieldErrors({});
  }

  function startNew() {
    setEditing("new");
    setForm(emptyForm);
    setFieldErrors({});
  }

  function handleSave() {
    if (!editing) return;
    const payload = {
      name: form.name,
      contact_person: form.contact_person || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      address: form.address || undefined,
      notes: form.notes || undefined,
    };
    setFieldErrors({});
    startTransition(async () => {
      const result = editing === "new"
        ? await createSupplier(payload)
        : await updateSupplier(editing.id, payload);
      if ("error" in result && result.error) {
        const errs: Record<string, string> = {};
        for (const [k, v] of Object.entries(result.error)) {
          if (Array.isArray(v) && v[0]) errs[k] = v[0];
        }
        setFieldErrors(errs);
        toast.push("Gagal menyimpan supplier", "error");
        return;
      }
      toast.push(editing === "new" ? "Supplier dibuat" : "Supplier diperbarui", "success");
      setEditing(null);
      router.refresh();
    });
  }

  function handleDeactivate(id: string) {
    if (!confirm("Nonaktifkan supplier ini?")) return;
    startTransition(async () => {
      const result = await deactivateSupplier(id);
      if ("error" in result && result.error) {
        toast.push(String(result.error), "error");
        return;
      }
      toast.push("Supplier dinonaktifkan", "info");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1a1a2e]">🏭 Supplier</h1>
        {canManage && <Button onClick={startNew}>+ Tambah Supplier</Button>}
      </div>

      <div className="rounded-xl border border-[#e5e7eb] bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-[#e5e7eb] bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Nama</th>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Kontak</th>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Telepon</th>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Email</th>
              <th className="px-4 py-3 text-right font-medium text-[#6b7280]">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e7eb]">
            {suppliers.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3">{s.contact_person ?? "—"}</td>
                <td className="px-4 py-3">{s.phone ?? "—"}</td>
                <td className="px-4 py-3">{s.email ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    {canManage && (
                      <Button size="sm" variant="ghost" onClick={() => startEdit(s)}>Edit</Button>
                    )}
                    {canDeactivate && (
                      <Button size="sm" variant="danger" onClick={() => handleDeactivate(s.id)} disabled={pending}>
                        Nonaktifkan
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[#6b7280]">
                  Belum ada supplier.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg">
            <h2 className="mb-4 text-lg font-semibold">
              {editing === "new" ? "Tambah Supplier" : "Edit Supplier"}
            </h2>

            <div className="space-y-4">
              <div>
                <FieldLabel required>Nama</FieldLabel>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <FieldError message={fieldErrors.name} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel>Kontak Person</FieldLabel>
                  <Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
                </div>
                <div>
                  <FieldLabel>Telepon</FieldLabel>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div>
                <FieldLabel>Email</FieldLabel>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <FieldError message={fieldErrors.email} />
              </div>
              <div>
                <FieldLabel>Alamat</FieldLabel>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div>
                <FieldLabel>Catatan</FieldLabel>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>

            {fieldErrors._form && <Alert tone="error" className="mt-4">{fieldErrors._form}</Alert>}

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setEditing(null)}>Batal</Button>
              <Button onClick={handleSave} disabled={pending}>
                {pending ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
