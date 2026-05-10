"use client";

import { useState, useTransition } from "react";
import { assignRoles, setUserActive, createEmployee } from "@/lib/actions/users";
import { Badge, Button, Card } from "@sneakervault/ui";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";
import { ROLES } from "@sneakervault/shared";
import type { Role } from "@sneakervault/shared";

type User = {
  id: string;
  full_name: string;
  email: string;
  roles: string[] | null;
  is_active: boolean;
  created_at: string;
};

export function SettingsClient({ users }: { users: User[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<User | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  function handleToggleActive(u: User) {
    if (!confirm(u.is_active ? "Nonaktifkan user ini?" : "Aktifkan kembali user ini?")) return;
    startTransition(async () => {
      const result = await setUserActive(u.id, !u.is_active);
      if ("error" in result && result.error) {
        toast.push(String(result.error), "error");
        return;
      }
      toast.push(u.is_active ? "User dinonaktifkan" : "User diaktifkan", "info");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1a1a2e]">⚙️ Pengaturan — User Management</h1>
        <Button onClick={() => setShowCreate(true)}>+ Tambah Karyawan</Button>
      </div>

      <div className="rounded-xl border border-[#e5e7eb] bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-[#e5e7eb] bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Nama</th>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Email</th>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Roles</th>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Status</th>
              <th className="px-4 py-3 text-right font-medium text-[#6b7280]">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e7eb]">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{u.full_name}</td>
                <td className="px-4 py-3 text-[#6b7280]">{u.email}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(u.roles ?? []).length === 0 && (
                      <span className="text-xs text-[#9ca3af]">belum ada role</span>
                    )}
                    {(u.roles ?? []).map((r) => (
                      <Badge key={r} tone="info">{r.replace("_", " ")}</Badge>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={u.is_active ? "success" : "neutral"}>
                    {u.is_active ? "Aktif" : "Nonaktif"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(u)}>
                      Kelola Role
                    </Button>
                    <Button
                      size="sm"
                      variant={u.is_active ? "danger" : "success"}
                      onClick={() => handleToggleActive(u)}
                      disabled={pending}
                    >
                      {u.is_active ? "Nonaktifkan" : "Aktifkan"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[#6b7280]">
                  Belum ada user.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && <RolesModal user={editing} onClose={() => setEditing(null)} />}
      {showCreate && <CreateEmployeeModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function RolesModal({ user, onClose }: { user: User; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<Role>>(
    new Set(((user.roles ?? []) as Role[]).filter((r) => ROLES.includes(r)))
  );

  function toggle(role: Role) {
    const next = new Set(selected);
    if (next.has(role)) next.delete(role);
    else next.add(role);
    setSelected(next);
  }

  function save() {
    startTransition(async () => {
      const result = await assignRoles(user.id, Array.from(selected));
      if ("error" in result && result.error) {
        toast.push(String(result.error), "error");
        return;
      }
      toast.push("Role diperbarui", "success");
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md">
        <h2 className="mb-2 text-lg font-semibold">Kelola Role</h2>
        <p className="mb-4 text-sm text-[#6b7280]">{user.full_name} · {user.email}</p>

        <div className="space-y-2">
          {ROLES.map((role) => (
            <label key={role} className="flex items-center gap-3 rounded-lg border border-[#e5e7eb] px-3 py-2 cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={selected.has(role)}
                onChange={() => toggle(role)}
                className="h-4 w-4"
              />
              <span className="text-sm capitalize">{role.replace("_", " ")}</span>
            </label>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button onClick={save} disabled={pending}>
            {pending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function CreateEmployeeModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "shopkeeper" as Role });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createEmployee(form);
      if ("error" in result && result.error) {
        toast.push(String(result.error), "error");
        return;
      }
      toast.push(`${form.full_name} berhasil ditambahkan`, "success");
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md">
        <h2 className="mb-2 text-lg font-semibold">Tambah Karyawan</h2>
        <p className="mb-4 text-sm text-[#6b7280]">Karyawan bisa langsung login setelah ditambahkan.</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="Nama lengkap"
            required
            value={form.full_name}
            onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))}
            className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm focus:border-[#1a1a2e] focus:outline-none"
          />
          <input
            type="email"
            placeholder="Email"
            required
            value={form.email}
            onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
            className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm focus:border-[#1a1a2e] focus:outline-none"
          />
          <input
            type="password"
            placeholder="Password (min 6 karakter)"
            required
            minLength={6}
            value={form.password}
            onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
            className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm focus:border-[#1a1a2e] focus:outline-none"
          />
          <select
            value={form.role}
            onChange={(e) => setForm(f => ({ ...f, role: e.target.value as Role }))}
            className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm focus:border-[#1a1a2e] focus:outline-none"
          >
            {ROLES.filter(r => r !== "owner").map((role) => (
              <option key={role} value={role}>{role.replace("_", " ")}</option>
            ))}
          </select>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={onClose}>Batal</Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan..." : "Tambah"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
