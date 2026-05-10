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
        <div>
          <h1 className="text-2xl font-bold text-white/90">User Management</h1>
          <p className="text-sm text-white/40 mt-1">{users.length} user terdaftar</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ Tambah Karyawan</Button>
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.04] text-[11px] uppercase tracking-wider text-white/30">
              <th className="px-6 py-3 text-left font-medium">Nama</th>
              <th className="px-6 py-3 text-left font-medium">Email</th>
              <th className="px-6 py-3 text-left font-medium">Role</th>
              <th className="px-6 py-3 text-left font-medium">Status</th>
              <th className="px-6 py-3 text-right font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                <td className="px-6 py-3 text-[13px] font-medium text-white/80">{u.full_name}</td>
                <td className="px-6 py-3 text-[12px] text-white/40">{u.email}</td>
                <td className="px-6 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(u.roles ?? []).length === 0 && (
                      <span className="text-[11px] text-white/20">—</span>
                    )}
                    {(u.roles ?? []).map((r) => (
                      <span key={r} className="inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase bg-white/[0.06] text-white/60 border border-white/[0.08]">
                        {r.replace("_", " ")}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-3">
                  <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${u.is_active ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
                    {u.is_active ? "Aktif" : "Nonaktif"}
                  </span>
                </td>
                <td className="px-6 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditing(u)} className="text-[11px] font-medium text-blue-400 hover:text-blue-300 transition-colors">
                      Role
                    </button>
                    <button
                      onClick={() => handleToggleActive(u)}
                      disabled={pending}
                      className={`text-[11px] font-medium transition-colors ${u.is_active ? "text-red-400 hover:text-red-300" : "text-emerald-400 hover:text-emerald-300"}`}
                    >
                      {u.is_active ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-white/20 text-sm">
                  Belum ada user terdaftar
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-md !bg-[#262626] !border-white/[0.08]">
        <h2 className="mb-2 text-lg font-semibold text-white/90">Kelola Role</h2>
        <p className="mb-4 text-sm text-white/40">{user.full_name} · {user.email}</p>

        <div className="space-y-2">
          {ROLES.map((role) => (
            <label key={role} className="flex items-center gap-3 rounded-lg border border-white/[0.08] px-3 py-2 cursor-pointer hover:bg-white/[0.04]">
              <input
                type="checkbox"
                checked={selected.has(role)}
                onChange={() => toggle(role)}
                className="h-4 w-4"
              />
              <span className="text-sm capitalize text-white/70">{role.replace("_", " ")}</span>
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-md !bg-[#262626] !border-white/[0.08]">
        <h2 className="mb-2 text-lg font-semibold text-white/90">Tambah Karyawan</h2>
        <p className="mb-4 text-sm text-white/40">Karyawan bisa langsung login setelah ditambahkan.</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="Nama lengkap"
            required
            value={form.full_name}
            onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white/80 placeholder:text-white/30 focus:border-white/20 focus:outline-none"
          />
          <input
            type="email"
            placeholder="Email"
            required
            value={form.email}
            onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white/80 placeholder:text-white/30 focus:border-white/20 focus:outline-none"
          />
          <input
            type="password"
            placeholder="Password (min 6 karakter)"
            required
            minLength={6}
            value={form.password}
            onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white/80 placeholder:text-white/30 focus:border-white/20 focus:outline-none"
          />
          <select
            value={form.role}
            onChange={(e) => setForm(f => ({ ...f, role: e.target.value as Role }))}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white/80 focus:border-white/20 focus:outline-none"
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
