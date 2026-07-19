"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  FieldLabel,
  Input,
  Select,
  Textarea,
} from "@sneakervault/ui";
import { COA_TYPE_LABELS, COA_TYPE_TONES } from "@sneakervault/shared";
import type { CoaType } from "@sneakervault/shared";
import type { CoaRow } from "@/lib/queries";
import {
  createChartOfAccount,
  deactivateChartOfAccount,
  deleteChartOfAccount,
  updateChartOfAccount,
} from "@/lib/actions/coa";
import { QuickTip } from "@/components/ui/quick-tip";
import { useToast } from "@/components/toast";
import {
  ChevronRight,
  Search,
  BookOpen,
  Wallet,
  Receipt,
  TrendingUp,
  TrendingDown,
  Building,
  Lock,
  ExternalLink,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

type TreeNode = CoaRow & { children: TreeNode[] };
type CoaFormState = {
  id?: string;
  code: string;
  name: string;
  type: CoaType;
  normal_balance: "debit" | "credit";
  parent_id: string;
  is_active: boolean;
  is_system?: boolean;
  description: string;
};

const typeIcon: Record<CoaType, React.ReactNode> = {
  asset: <Wallet size={14} strokeWidth={1.7} />,
  liability: <Receipt size={14} strokeWidth={1.7} />,
  equity: <Building size={14} strokeWidth={1.7} />,
  revenue: <TrendingUp size={14} strokeWidth={1.7} />,
  cogs: <TrendingDown size={14} strokeWidth={1.7} />,
  expense: <TrendingDown size={14} strokeWidth={1.7} />,
};

const emptyForm: CoaFormState = {
  code: "",
  name: "",
  type: "asset",
  normal_balance: "debit",
  parent_id: "",
  is_active: true,
  is_system: false,
  description: "",
};

function defaultNormalBalance(type: CoaType): "debit" | "credit" {
  return ["asset", "expense", "cogs"].includes(type) ? "debit" : "credit";
}

function firstError(error: unknown) {
  if (!error) return "Terjadi kesalahan";
  if (typeof error === "string") return error;
  if (typeof error !== "object") return "Terjadi kesalahan";
  const err = error as Record<string, unknown>;
  if (Array.isArray(err._form) && err._form[0]) return String(err._form[0]);
  for (const value of Object.values(err)) {
    if (Array.isArray(value) && value[0]) return String(value[0]);
  }
  return "Terjadi kesalahan";
}

function buildTree(rows: CoaRow[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  for (const r of rows) {
    map.set(r.id, { ...r, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (nodes: TreeNode[]): void => {
    nodes.sort((a, b) => a.code.localeCompare(b.code));
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

export function CoaTree({ accounts }: { accounts: CoaRow[] }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<CoaType | "all">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CoaFormState>(emptyForm);

  const tree = useMemo(() => buildTree(accounts), [accounts]);
  const parentOptions = useMemo(
    () =>
      accounts
        .filter((account) => account.is_active && account.id !== form.id)
        .sort((a, b) => a.code.localeCompare(b.code)),
    [accounts, form.id],
  );

  const counts = useMemo(() => {
    const c: Record<CoaType, number> = {
      asset: 0,
      liability: 0,
      equity: 0,
      revenue: 0,
      cogs: 0,
      expense: 0,
    };
    for (const a of accounts) c[a.type]++;
    return c;
  }, [accounts]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(accounts.map((a) => a.id)));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  function openCreate() {
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(account: CoaRow) {
    setForm({
      id: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      normal_balance: account.normal_balance,
      parent_id: account.parent_id ?? "",
      is_active: account.is_active,
      is_system: account.is_system,
      description: account.description ?? "",
    });
    setFormOpen(true);
  }

  function submitForm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const payload = {
      code: form.code,
      name: form.name,
      type: form.type,
      normal_balance: form.normal_balance,
      parent_id: form.parent_id || null,
      is_active: form.is_active,
      description: form.description || null,
    };

    startTransition(async () => {
      const result = form.id
        ? await updateChartOfAccount(form.id, payload)
        : await createChartOfAccount(payload);
      if (result?.error) {
        toast.push(firstError(result.error), "error");
        return;
      }
      toast.push(form.id ? "Akun COA diperbarui" : "Akun COA ditambahkan", "success");
      setFormOpen(false);
      setForm(emptyForm);
    });
  }

  function deactivateAccount(account: CoaRow) {
    startTransition(async () => {
      const result = await deactivateChartOfAccount(account.id);
      if (result?.error) {
        toast.push(firstError(result.error), "error");
        return;
      }
      toast.push("Akun COA dinonaktifkan", "success");
    });
  }

  function deleteAccount(account: CoaRow) {
    if (!confirm(`Hapus akun ${account.code} · ${account.name}?`)) return;
    startTransition(async () => {
      const result = await deleteChartOfAccount(account.id);
      if (result?.error) {
        toast.push(firstError(result.error), "error");
        return;
      }
      toast.push("Akun COA dihapus", "success");
    });
  }

  const q = search.trim().toLowerCase();
  const matches = (n: TreeNode): boolean => {
    if (typeFilter !== "all" && n.type !== typeFilter) return false;
    if (!q) return true;
    return (
      n.code.toLowerCase().includes(q) || n.name.toLowerCase().includes(q)
    );
  };

  // Filter tree: keep node if it or any descendant matches
  const filterTree = (nodes: TreeNode[]): TreeNode[] => {
    const out: TreeNode[] = [];
    for (const n of nodes) {
      const childMatches = filterTree(n.children);
      if (matches(n) || childMatches.length > 0) {
        out.push({ ...n, children: childMatches });
      }
    }
    return out;
  };

  const filtered = filterTree(tree);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] text-white/80">
            <BookOpen size={20} strokeWidth={1.7} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Chart of Accounts
            </h1>
            <p className="text-sm text-white/50">
              Bagan akun keuangan standar SAK EMKM — backbone Buku Besar
            </p>
          </div>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus size={15} />
          Tambah Akun
        </Button>
      </div>

      <QuickTip
        id="buku-besar-coa-intro"
        title="Cara pakai Chart of Accounts"
        tone="info"
      >
        Klik <strong>nama akun</strong> di tabel untuk lihat <strong>Histori Buku Besar</strong> —
        rincian setiap transaksi yang menyentuh akun tersebut, lengkap dengan saldo berjalan
        per posting. Akun bertanda <Lock size={10} strokeWidth={2} className="inline-block translate-y-[1px]" /> adalah
        standar SAK EMKM dan tidak dapat dihapus.
      </QuickTip>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
        {(Object.keys(COA_TYPE_LABELS) as CoaType[]).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(typeFilter === t ? "all" : t)}
            className={`rounded-lg border p-3 text-left transition-colors ${
              typeFilter === t
                ? COA_TYPE_TONES[t]
                : "border-white/[0.06] bg-[#262626] hover:bg-white/[0.02]"
            }`}
          >
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40">
              {typeIcon[t]}
              {COA_TYPE_LABELS[t]}
            </div>
            <div className="mt-1 text-xl font-semibold text-white">
              {counts[t]}
            </div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search
            size={14}
            strokeWidth={1.8}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
          />
          <Input
            placeholder="Cari kode atau nama akun…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <button
          onClick={expandAll}
          className="rounded border border-white/[0.06] bg-[#262626] px-3 py-1.5 text-xs text-white/60 hover:bg-white/[0.04] hover:text-white"
        >
          Buka semua
        </button>
        <button
          onClick={collapseAll}
          className="rounded border border-white/[0.06] bg-[#262626] px-3 py-1.5 text-xs text-white/60 hover:bg-white/[0.04] hover:text-white"
        >
          Tutup semua
        </button>
      </div>

      {/* Tree */}
      <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-[#262626]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-white/40">
              <th className="px-4 py-3 font-medium" style={{ width: "20%" }}>
                Kode
              </th>
              <th className="px-4 py-3 font-medium">Nama Akun</th>
              <th className="px-4 py-3 font-medium" style={{ width: "15%" }}>
                Tipe
              </th>
              <th
                className="px-4 py-3 text-center font-medium"
                style={{ width: "10%" }}
              >
                Saldo Normal
              </th>
              <th className="px-4 py-3 text-right font-medium" style={{ width: "16%" }}>
                Aksi
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-white/40">
                  Tidak ada akun yang cocok dengan filter.
                </td>
              </tr>
            ) : (
              filtered.map((node) =>
                renderNode(
                  node,
                  0,
                  expanded,
                  toggle,
                  q.length > 0,
                  openEdit,
                  deactivateAccount,
                  deleteAccount,
                  pending,
                ),
              )
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-white/40">
        Total {accounts.length} akun · Akun bertanda{" "}
        <Lock
          size={10}
          strokeWidth={2}
          className="inline-block translate-y-[1px]"
        />{" "}
        adalah akun standar SAK EMKM dan tidak dapat dihapus.
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {form.id ? "Edit Akun COA" : "Tambah Akun COA"}
            </DialogTitle>
            <DialogDescription>
              Akun baru langsung bisa dipakai untuk jurnal, kas/bank, dan laporan keuangan.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submitForm} className="grid gap-4">
            {form.is_system ? (
              <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                Akun sistem: kode, tipe, parent, dan saldo normal dikunci agar laporan tetap stabil.
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <FieldLabel htmlFor="coa-code">Kode Akun *</FieldLabel>
                <Input
                  id="coa-code"
                  value={form.code}
                  disabled={Boolean(form.is_system)}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="Contoh: 1.1.04"
                />
              </div>
              <div>
                <FieldLabel htmlFor="coa-name">Nama Akun *</FieldLabel>
                <Input
                  id="coa-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Contoh: BCA Dewinst"
                />
              </div>
              <div>
                <FieldLabel htmlFor="coa-type">Tipe *</FieldLabel>
                <Select
                  id="coa-type"
                  value={form.type}
                  disabled={Boolean(form.is_system)}
                  onChange={(e) => {
                    const type = e.target.value as CoaType;
                    setForm({
                      ...form,
                      type,
                      normal_balance: defaultNormalBalance(type),
                    });
                  }}
                >
                  {(Object.keys(COA_TYPE_LABELS) as CoaType[]).map((type) => (
                    <option key={type} value={type}>
                      {COA_TYPE_LABELS[type]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <FieldLabel htmlFor="coa-normal">Saldo Normal *</FieldLabel>
                <Select
                  id="coa-normal"
                  value={form.normal_balance}
                  disabled={Boolean(form.is_system)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      normal_balance: e.target.value as "debit" | "credit",
                    })
                  }
                >
                  <option value="debit">Debit</option>
                  <option value="credit">Kredit</option>
                </Select>
              </div>
              <div className="md:col-span-2">
                <FieldLabel htmlFor="coa-parent">Parent Akun</FieldLabel>
                <Select
                  id="coa-parent"
                  value={form.parent_id}
                  disabled={Boolean(form.is_system)}
                  onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
                >
                  <option value="">— Tidak ada parent —</option>
                  {parentOptions.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code} · {account.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="md:col-span-2">
                <FieldLabel htmlFor="coa-description">Catatan</FieldLabel>
                <Textarea
                  id="coa-description"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="Opsional"
                  rows={3}
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-white/70">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) =>
                  setForm({ ...form, is_active: e.target.checked })
                }
                className="h-4 w-4 rounded border-white/20 bg-white/[0.04]"
              />
              Akun aktif
            </label>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setFormOpen(false)}
                disabled={pending}
              >
                Batal
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function renderNode(
  node: TreeNode,
  depth: number,
  expanded: Set<string>,
  toggle: (id: string) => void,
  forceExpand: boolean,
  onEdit: (account: CoaRow) => void,
  onDeactivate: (account: CoaRow) => void,
  onDelete: (account: CoaRow) => void,
  pending: boolean,
): React.ReactNode[] {
  const rows: React.ReactNode[] = [];
  const hasChildren = node.children.length > 0;
  const isOpen = forceExpand || expanded.has(node.id);

  rows.push(
    <tr
      key={node.id}
      className="border-b border-white/[0.04] hover:bg-white/[0.02]"
    >
      <td className="px-4 py-2.5 font-mono text-xs text-white/70">
        <div
          className="flex items-center gap-1"
          style={{ paddingLeft: `${depth * 16}px` }}
        >
          {hasChildren ? (
            <button
              onClick={() => toggle(node.id)}
              className="flex h-5 w-5 items-center justify-center rounded text-white/40 hover:bg-white/[0.08] hover:text-white"
            >
              <ChevronRight
                size={12}
                strokeWidth={2.2}
                className={`transition-transform ${isOpen ? "rotate-90" : ""}`}
              />
            </button>
          ) : (
            <span className="inline-block h-5 w-5" />
          )}
          <span>{node.code}</span>
        </div>
      </td>
      <td className="px-4 py-2.5 text-white/90">
        <div className="flex items-center gap-2">
          <Link
            href={`/buku-besar/coa/${node.id}`}
            className={`group inline-flex items-center gap-1.5 ${depth === 0 ? "font-semibold" : ""} hover:text-sky-300 transition-colors`}
          >
            <span>{node.name}</span>
            <ExternalLink
              size={11}
              strokeWidth={1.9}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-sky-300"
            />
          </Link>
          {node.is_system ? (
            <Lock size={10} strokeWidth={2} className="text-white/30" />
          ) : null}
        </div>
        {node.description ? (
          <div className="text-[11px] text-white/40">{node.description}</div>
        ) : null}
      </td>
      <td className="px-4 py-2.5">
        <span
          className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-medium ${COA_TYPE_TONES[node.type]}`}
        >
          {COA_TYPE_LABELS[node.type]}
        </span>
      </td>
      <td className="px-4 py-2.5 text-center">
        <span
          className={`text-[10px] font-medium uppercase tracking-wider ${
            node.normal_balance === "debit"
              ? "text-sky-300"
              : "text-violet-300"
          }`}
        >
          {node.normal_balance === "debit" ? "Dr" : "Cr"}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onEdit(node)}
          >
            <Pencil size={12} />
            Edit
          </Button>
          {!node.is_system && node.is_active ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => onDeactivate(node)}
            >
              Nonaktif
            </Button>
          ) : null}
          {!node.is_system ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => onDelete(node)}
              className="text-red-300 hover:bg-red-500/10"
            >
              <Trash2 size={12} />
              Hapus
            </Button>
          ) : null}
        </div>
      </td>
    </tr>,
  );

  if (isOpen && hasChildren) {
    for (const child of node.children) {
      rows.push(
        ...renderNode(
          child,
          depth + 1,
          expanded,
          toggle,
          forceExpand,
          onEdit,
          onDeactivate,
          onDelete,
          pending,
        ),
      );
    }
  }

  return rows;
}
