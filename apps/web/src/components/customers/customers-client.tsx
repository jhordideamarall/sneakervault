"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  Select,
  FieldLabel,
  FieldError,
  Alert,
} from "@sneakervault/ui";
import { CUSTOMER_CHANNELS } from "@sneakervault/shared";
import type { CustomerChannel } from "@sneakervault/shared";
import { useToast } from "@/components/toast";
import {
  createCustomer,
  updateCustomer,
  deactivateCustomer,
  reactivateCustomer,
} from "@/lib/actions/customers";
import type { CustomerRow } from "@/lib/queries";
import {
  Plus,
  Search,
  Pencil,
  Archive,
  ArchiveRestore,
  Phone,
  Mail,
  MapPin,
  Users,
  X,
} from "lucide-react";

const emptyForm = {
  name: "",
  contact_person: "",
  phone: "",
  email: "",
  address: "",
  channel: "wa" as CustomerChannel,
  npwp: "",
  notes: "",
};

const channelLabel = (c: CustomerChannel): string =>
  CUSTOMER_CHANNELS.find((x) => x.value === c)?.label ?? c;

const channelTone: Record<CustomerChannel, string> = {
  wa: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  shopee: "bg-orange-500/15 text-orange-300 border-orange-500/20",
  tiktok: "bg-pink-500/15 text-pink-300 border-pink-500/20",
  tokopedia: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  offline: "bg-sky-500/15 text-sky-300 border-sky-500/20",
  website: "bg-violet-500/15 text-violet-300 border-violet-500/20",
  mixed: "bg-white/10 text-white/70 border-white/15",
};

export function CustomersClient({
  customers,
  roles,
}: {
  customers: CustomerRow[];
  roles: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<CustomerRow | "new" | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<CustomerChannel | "all">(
    "all",
  );
  const [showInactive, setShowInactive] = useState(false);

  const canManage =
    roles.includes("owner") ||
    roles.includes("finance") ||
    roles.includes("admin_online");
  const canDeactivate = roles.includes("owner");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (!showInactive && !c.is_active) return false;
      if (channelFilter !== "all" && c.channel !== channelFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.contact_person ?? "").toLowerCase().includes(q)
      );
    });
  }, [customers, search, channelFilter, showInactive]);

  const stats = useMemo(() => {
    const active = customers.filter((c) => c.is_active);
    const byChannel = new Map<CustomerChannel, number>();
    for (const c of active) {
      byChannel.set(c.channel, (byChannel.get(c.channel) ?? 0) + 1);
    }
    return {
      total: customers.length,
      active: active.length,
      inactive: customers.length - active.length,
      topChannel:
        Array.from(byChannel.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
        null,
    };
  }, [customers]);

  function startEdit(c: CustomerRow) {
    setEditing(c);
    setForm({
      name: c.name,
      contact_person: c.contact_person ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      address: c.address ?? "",
      channel: c.channel,
      npwp: c.npwp ?? "",
      notes: c.notes ?? "",
    });
    setFieldErrors({});
    setFormError(null);
  }

  function startNew() {
    setEditing("new");
    setForm(emptyForm);
    setFieldErrors({});
    setFormError(null);
  }

  function closeModal() {
    setEditing(null);
    setFieldErrors({});
    setFormError(null);
  }

  function handleSave() {
    if (!editing) return;
    const payload = {
      name: form.name,
      contact_person: form.contact_person || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      address: form.address || undefined,
      channel: form.channel,
      npwp: form.npwp || undefined,
      notes: form.notes || undefined,
    };
    setFieldErrors({});
    setFormError(null);
    startTransition(async () => {
      const result =
        editing === "new"
          ? await createCustomer(payload)
          : await updateCustomer(editing.id, payload);
      if ("error" in result && result.error) {
        if (typeof result.error === "object" && "_form" in result.error) {
          setFormError(
            (result.error._form as string[])?.[0] ?? "Gagal menyimpan",
          );
        } else {
          const errs: Record<string, string> = {};
          for (const [k, v] of Object.entries(result.error)) {
            errs[k] = Array.isArray(v) ? v[0] ?? "" : String(v);
          }
          setFieldErrors(errs);
        }
        return;
      }
      toast.push(
        editing === "new" ? "Pelanggan berhasil dibuat" : "Pelanggan diperbarui",
      );
      closeModal();
      router.refresh();
    });
  }

  function handleDeactivate(id: string, name: string) {
    if (!confirm(`Nonaktifkan pelanggan "${name}"? Data tetap tersimpan.`))
      return;
    startTransition(async () => {
      const result = await deactivateCustomer(id);
      if ("error" in result && result.error) {
        toast.push(typeof result.error === "string" ? result.error : "Gagal", "error");
        return;
      }
      toast.push("Pelanggan dinonaktifkan");
      router.refresh();
    });
  }

  function handleReactivate(id: string) {
    startTransition(async () => {
      const result = await reactivateCustomer(id);
      if ("error" in result && result.error) {
        toast.push(typeof result.error === "string" ? result.error : "Gagal", "error");
        return;
      }
      toast.push("Pelanggan diaktifkan kembali");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] text-white/80">
              <Users size={20} strokeWidth={1.7} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                Master Pelanggan
              </h1>
              <p className="text-sm text-white/50">
                Database pelanggan untuk invoice & laporan piutang
              </p>
            </div>
          </div>
        </div>
        {canManage ? (
          <Button onClick={startNew} className="gap-2">
            <Plus size={16} strokeWidth={2} />
            Pelanggan Baru
          </Button>
        ) : null}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Total Pelanggan" value={stats.total.toString()} />
        <StatTile
          label="Aktif"
          value={stats.active.toString()}
          tone="emerald"
        />
        <StatTile
          label="Nonaktif"
          value={stats.inactive.toString()}
          tone={stats.inactive > 0 ? "amber" : undefined}
        />
        <StatTile
          label="Channel Utama"
          value={stats.topChannel ? channelLabel(stats.topChannel) : "—"}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/[0.06] bg-[#262626] p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            strokeWidth={1.8}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
          />
          <Input
            placeholder="Cari nama, HP, email, kontak…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={channelFilter}
          onChange={(e) =>
            setChannelFilter(e.target.value as CustomerChannel | "all")
          }
          className="min-w-[140px]"
        >
          <option value="all">Semua channel</option>
          {CUSTOMER_CHANNELS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm text-white/60">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-white/[0.04]"
          />
          Tampilkan nonaktif
        </label>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          hasFilter={
            search.length > 0 || channelFilter !== "all" || showInactive
          }
          onCreate={canManage ? startNew : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-[#262626]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-white/40">
                <th className="px-4 py-3 font-medium">Nama</th>
                <th className="px-4 py-3 font-medium">Kontak</th>
                <th className="px-4 py-3 font-medium">Channel</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{c.name}</div>
                    {c.contact_person ? (
                      <div className="text-xs text-white/40">
                        c/p: {c.contact_person}
                      </div>
                    ) : null}
                    {c.address ? (
                      <div className="mt-0.5 flex items-start gap-1 text-xs text-white/40">
                        <MapPin
                          size={11}
                          strokeWidth={1.7}
                          className="mt-0.5 flex-shrink-0"
                        />
                        <span className="line-clamp-1">{c.address}</span>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-white/70">
                    {c.phone ? (
                      <div className="flex items-center gap-1.5">
                        <Phone size={12} strokeWidth={1.8} />
                        {c.phone}
                      </div>
                    ) : null}
                    {c.email ? (
                      <div className="flex items-center gap-1.5 text-xs text-white/50">
                        <Mail size={11} strokeWidth={1.8} />
                        {c.email}
                      </div>
                    ) : null}
                    {!c.phone && !c.email ? (
                      <span className="text-white/30">—</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-medium ${channelTone[c.channel]}`}
                    >
                      {channelLabel(c.channel)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {c.is_active ? (
                      <span className="text-[11px] text-emerald-300">Aktif</span>
                    ) : (
                      <span className="text-[11px] text-white/40">
                        Nonaktif
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      {canManage ? (
                        <button
                          onClick={() => startEdit(c)}
                          className="rounded p-1.5 text-white/50 hover:bg-white/[0.06] hover:text-white"
                          title="Edit"
                        >
                          <Pencil size={14} strokeWidth={1.8} />
                        </button>
                      ) : null}
                      {canDeactivate ? (
                        c.is_active ? (
                          <button
                            onClick={() => handleDeactivate(c.id, c.name)}
                            disabled={pending}
                            className="rounded p-1.5 text-white/50 hover:bg-white/[0.06] hover:text-amber-300"
                            title="Nonaktifkan"
                          >
                            <Archive size={14} strokeWidth={1.8} />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReactivate(c.id)}
                            disabled={pending}
                            className="rounded p-1.5 text-white/50 hover:bg-white/[0.06] hover:text-emerald-300"
                            title="Aktifkan kembali"
                          >
                            <ArchiveRestore size={14} strokeWidth={1.8} />
                          </button>
                        )
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {editing ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-white/[0.08] bg-[#262626] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
              <h2 className="text-base font-semibold text-white">
                {editing === "new" ? "Pelanggan Baru" : "Edit Pelanggan"}
              </h2>
              <button
                onClick={closeModal}
                className="rounded p-1 text-white/50 hover:bg-white/[0.06] hover:text-white"
              >
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              {formError ? <Alert tone="error">{formError}</Alert> : null}
              <div>
                <FieldLabel htmlFor="name">Nama Pelanggan *</FieldLabel>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="cth: Budi Hartanto / PT Sneakers Maju"
                />
                {fieldErrors.name ? (
                  <FieldError message={fieldErrors.name} />
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="phone">No HP / WA</FieldLabel>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) =>
                      setForm({ ...form, phone: e.target.value })
                    }
                    placeholder="08…"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    placeholder="opsional"
                  />
                  {fieldErrors.email ? (
                    <FieldError message={fieldErrors.email} />
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="channel">Channel Utama</FieldLabel>
                  <Select
                    id="channel"
                    value={form.channel}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        channel: e.target.value as CustomerChannel,
                      })
                    }
                  >
                    {CUSTOMER_CHANNELS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <FieldLabel htmlFor="contact_person">
                    Contact Person
                  </FieldLabel>
                  <Input
                    id="contact_person"
                    value={form.contact_person}
                    onChange={(e) =>
                      setForm({ ...form, contact_person: e.target.value })
                    }
                    placeholder="opsional"
                  />
                </div>
              </div>
              <div>
                <FieldLabel htmlFor="address">Alamat</FieldLabel>
                <Input
                  id="address"
                  value={form.address}
                  onChange={(e) =>
                    setForm({ ...form, address: e.target.value })
                  }
                  placeholder="opsional"
                />
              </div>
              <div>
                <FieldLabel htmlFor="npwp">NPWP (opsional)</FieldLabel>
                <Input
                  id="npwp"
                  value={form.npwp}
                  onChange={(e) => setForm({ ...form, npwp: e.target.value })}
                  placeholder="untuk pelanggan korporat"
                />
              </div>
              <div>
                <FieldLabel htmlFor="notes">Catatan</FieldLabel>
                <Input
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="opsional"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-6 py-4">
              <Button variant="ghost" onClick={closeModal} disabled={pending}>
                Batal
              </Button>
              <Button onClick={handleSave} disabled={pending || !form.name}>
                {pending
                  ? "Menyimpan…"
                  : editing === "new"
                    ? "Buat Pelanggan"
                    : "Simpan Perubahan"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "amber" | "red";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "amber"
        ? "text-amber-300"
        : tone === "red"
          ? "text-red-300"
          : "text-white";
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#262626] p-4">
      <div className="text-[11px] uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function EmptyState({
  hasFilter,
  onCreate,
}: {
  hasFilter: boolean;
  onCreate?: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 bg-[#262626] px-6 py-16 text-center">
      <Users
        size={32}
        strokeWidth={1.5}
        className="mx-auto mb-4 text-white/30"
      />
      <h3 className="text-base font-medium text-white">
        {hasFilter ? "Tidak ada pelanggan cocok" : "Belum ada pelanggan"}
      </h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-white/50">
        {hasFilter
          ? "Coba ubah kata kunci pencarian atau reset filter."
          : "Mulai dengan menambahkan pelanggan pertama. Data pelanggan akan dipakai untuk invoice penjualan dan tracking piutang."}
      </p>
      {!hasFilter && onCreate ? (
        <Button onClick={onCreate} className="mt-5 gap-2">
          <Plus size={16} strokeWidth={2} />
          Pelanggan Pertama
        </Button>
      ) : null}
    </div>
  );
}
