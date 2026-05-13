"use client";

import { useMemo, useState, Fragment, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Select, Button, Alert } from "@sneakervault/ui";
import { useToast } from "@/components/toast";
import {
  createManualJournalEntry,
  updateManualJournalEntry,
  deleteManualJournalEntry,
} from "@/lib/actions/journal-entries";
import { QuickTip } from "@/components/ui/quick-tip";
import type { JournalEntryRow, CoaRow } from "@/lib/queries";
import {
  ScrollText,
  Search,
  Calendar,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Link2,
  Plus,
  Trash2,
  X,
  PenLine,
  Pencil,
} from "lucide-react";

const sourceLabel: Record<string, string> = {
  manual: "Penyesuaian Manual",
  purchase_invoice: "Faktur Pembelian",
  vendor_payment: "Bayar Vendor",
  sales_invoice: "Invoice Penjualan",
  customer_payment: "Terima Customer",
  stock_adjustment: "Penyesuaian Stok",
  opening_balance: "Saldo Awal",
  closing: "Tutup Buku",
  other: "Lainnya",
};

function fmtRupiah(n: number): string {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type JournalLine = {
  account_code: string;
  debit: number;
  credit: number;
  description: string;
};

function emptyLine(): JournalLine {
  return { account_code: "", debit: 0, credit: 0, description: "" };
}

export function JournalClient({
  entries,
  accounts,
  roles,
}: {
  entries: JournalEntryRow[];
  accounts: CoaRow[];
  roles: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "posted" | "reversed">("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Manual entry modal (also used for edit)
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [manualDate, setManualDate] = useState(todayIso());
  const [manualDesc, setManualDesc] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualLines, setManualLines] = useState<JournalLine[]>([emptyLine(), emptyLine()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const canManage = roles.includes("owner") || roles.includes("finance");

  // Only leaf accounts (no children) for cleaner picker
  const leafAccounts = useMemo(() => {
    const hasChildren = new Set(accounts.map((a) => a.parent_id).filter(Boolean));
    return accounts.filter((a) => a.is_active && !hasChildren.has(a.id));
  }, [accounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (sourceFilter !== "all" && e.source_type !== sourceFilter) return false;
      if (!q) return true;
      return (
        e.entry_number.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.lines.some(
          (l) =>
            l.account_code.includes(q) || l.account_name.toLowerCase().includes(q),
        )
      );
    });
  }, [entries, search, statusFilter, sourceFilter]);

  const stats = useMemo(() => {
    const posted = entries.filter((e) => e.status === "posted");
    const totalDebit = posted.reduce((a, e) => a + e.total_debit, 0);
    const totalCredit = posted.reduce((a, e) => a + e.total_credit, 0);
    const sources = new Set(entries.map((e) => e.source_type));
    return {
      total: entries.length,
      posted: posted.length,
      reversed: entries.filter((e) => e.status === "reversed").length,
      balanced: Math.abs(totalDebit - totalCredit) < 0.01,
      totalAmount: totalDebit,
      sources,
    };
  }, [entries]);

  const manualTotals = useMemo(() => {
    const dr = manualLines.reduce((s, l) => s + (l.debit || 0), 0);
    const cr = manualLines.reduce((s, l) => s + (l.credit || 0), 0);
    return { dr, cr, balanced: Math.abs(dr - cr) < 0.01 };
  }, [manualLines]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function updateLine(idx: number, field: keyof JournalLine, value: string | number) {
    setManualLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)),
    );
  }

  function addLine() {
    setManualLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(idx: number) {
    if (manualLines.length <= 2) return;
    setManualLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function resetForm() {
    setManualDate(todayIso());
    setManualDesc("");
    setManualNotes("");
    setManualLines([emptyLine(), emptyLine()]);
    setFormError(null);
    setEditingId(null);
  }

  function openEdit(entry: JournalEntryRow) {
    setEditingId(entry.id);
    setManualDate(entry.entry_date);
    setManualDesc(entry.description);
    setManualNotes(entry.notes ?? "");
    setManualLines(
      entry.lines.map((l) => ({
        account_code: l.account_code,
        debit: l.debit,
        credit: l.credit,
        description: l.description ?? "",
      })),
    );
    setFormError(null);
    setCreating(true);
  }

  function handleSave() {
    if (!manualDesc.trim()) {
      setFormError("Deskripsi jurnal wajib diisi");
      return;
    }
    const hasEmptyAccount = manualLines.some((l) => !l.account_code);
    if (hasEmptyAccount) {
      setFormError("Semua baris harus memilih akun");
      return;
    }
    if (!manualTotals.balanced) {
      setFormError(
        `Jurnal belum balance: Debit ${fmtRupiah(manualTotals.dr)} ≠ Kredit ${fmtRupiah(manualTotals.cr)}`,
      );
      return;
    }
    setFormError(null);

    startTransition(async () => {
      if (editingId) {
        const r = (await updateManualJournalEntry({
          id: editingId,
          entry_date: manualDate,
          description: manualDesc,
          notes: manualNotes || undefined,
          lines: manualLines,
        })) as { error?: { _form?: string[] }; success?: boolean };

        if (r.error) {
          setFormError(r.error._form?.[0] ?? "Gagal update jurnal");
          return;
        }
        toast.push("Jurnal berhasil diupdate", "success");
      } else {
        const r = (await createManualJournalEntry({
          entry_date: manualDate,
          description: manualDesc,
          notes: manualNotes || undefined,
          lines: manualLines,
        })) as { error?: { _form?: string[] }; success?: boolean };

        if (r.error) {
          setFormError(r.error._form?.[0] ?? "Gagal menyimpan jurnal");
          return;
        }
        toast.push("Jurnal penyesuaian berhasil dicatat", "success");
      }
      setCreating(false);
      resetForm();
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const r = (await deleteManualJournalEntry(id)) as {
        error?: string;
        success?: boolean;
      };
      if (r.error) {
        toast.push(r.error, "error");
        setConfirmDelete(null);
        return;
      }
      toast.push("Jurnal manual berhasil dihapus", "success");
      setConfirmDelete(null);
      router.refresh();
    });
  }

  const uniqueSources = Array.from(stats.sources);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] text-white/80">
            <ScrollText size={20} strokeWidth={1.7} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Jurnal Penyesuaian
            </h1>
            <p className="text-sm text-white/50">
              Catatan double-entry — otomatis dari transaksi & manual penyesuaian accounting
            </p>
          </div>
        </div>
        {canManage ? (
          <Button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 whitespace-nowrap"
          >
            <PenLine size={15} strokeWidth={1.8} />
            Buat Jurnal Manual
          </Button>
        ) : null}
      </div>

      {/* Confirm Delete Dialog */}
      {confirmDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-red-500/20 bg-[#1c1c1c] shadow-2xl">
            <div className="border-b border-white/[0.06] px-6 py-4">
              <h2 className="text-base font-semibold text-white">Hapus Jurnal Manual?</h2>
              <p className="mt-1 text-xs text-white/50">
                Jurnal ini akan dihapus permanen. Saldo akun akan tersesuaikan otomatis.
                Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4">
              <Button
                variant="ghost"
                onClick={() => setConfirmDelete(null)}
                disabled={pending}
              >
                Batal
              </Button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={pending}
                className="rounded-md bg-red-500/15 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/25 transition-colors disabled:opacity-50"
              >
                {pending ? "Menghapus…" : "Ya, Hapus"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Manual Entry Modal */}
      {creating ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-xl border border-white/[0.08] bg-[#1c1c1c] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-white">
                  {editingId ? "Edit Jurnal Manual" : "Jurnal Penyesuaian Manual"}
                </h2>
                <p className="text-xs text-white/40 mt-0.5">
                  {editingId
                    ? "Ubah detail jurnal. Saldo akun akan ter-update otomatis."
                    : "Untuk koreksi & penyesuaian yang tidak berkaitan dengan kas, pembelian, atau penjualan"}
                </p>
              </div>
              <button
                onClick={() => { setCreating(false); resetForm(); }}
                className="text-white/40 hover:text-white/70 transition-colors"
              >
                <X size={18} strokeWidth={1.8} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-white/60">Tanggal</label>
                  <Input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-white/60">Deskripsi Jurnal</label>
                  <Input
                    placeholder="Cth: Koreksi beban penyusutan Mei 2026"
                    value={manualDesc}
                    onChange={(e) => setManualDesc(e.target.value)}
                  />
                </div>
              </div>

              {/* Lines */}
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_110px_110px_140px_32px] gap-2 text-[11px] font-medium uppercase tracking-wider text-white/40">
                  <span>Akun</span>
                  <span className="text-right">Debit (Dr)</span>
                  <span className="text-right">Kredit (Cr)</span>
                  <span>Keterangan baris</span>
                  <span></span>
                </div>
                {manualLines.map((line, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[1fr_110px_110px_140px_32px] items-center gap-2"
                  >
                    <Select
                      value={line.account_code}
                      onChange={(e) => updateLine(idx, "account_code", e.target.value)}
                    >
                      <option value="">— Pilih Akun —</option>
                      {leafAccounts.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                    </Select>
                    <input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={line.debit || ""}
                      onChange={(e) => updateLine(idx, "debit", Number(e.target.value))}
                      className="h-9 w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2 text-right text-sm text-white placeholder-white/20 focus:border-white/20 focus:outline-none"
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={line.credit || ""}
                      onChange={(e) => updateLine(idx, "credit", Number(e.target.value))}
                      className="h-9 w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2 text-right text-sm text-white placeholder-white/20 focus:border-white/20 focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Opsional"
                      value={line.description}
                      onChange={(e) => updateLine(idx, "description", e.target.value)}
                      className="h-9 w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2 text-sm text-white placeholder-white/20 focus:border-white/20 focus:outline-none"
                    />
                    <button
                      onClick={() => removeLine(idx)}
                      disabled={manualLines.length <= 2}
                      className="flex items-center justify-center text-white/30 hover:text-red-400 disabled:opacity-20 transition-colors"
                    >
                      <Trash2 size={14} strokeWidth={1.8} />
                    </button>
                  </div>
                ))}

                <button
                  onClick={addLine}
                  className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors py-1"
                >
                  <Plus size={13} strokeWidth={2} />
                  Tambah baris
                </button>
              </div>

              {/* Balance indicator */}
              <div className="flex items-center justify-end gap-6 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-sm">
                <span className="text-white/50">
                  Total Debit: <span className="text-sky-300 font-mono">{fmtRupiah(manualTotals.dr)}</span>
                </span>
                <span className="text-white/50">
                  Total Kredit: <span className="text-violet-300 font-mono">{fmtRupiah(manualTotals.cr)}</span>
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    manualTotals.balanced
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-red-500/15 text-red-300"
                  }`}
                >
                  {manualTotals.balanced ? "Balance ✓" : "Belum Balance"}
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/60">Catatan (opsional)</label>
                <textarea
                  rows={2}
                  placeholder="Alasan penyesuaian, referensi dokumen, dll."
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  className="w-full resize-none rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-white/20 focus:border-white/20 focus:outline-none"
                />
              </div>

              {formError ? (
                <Alert tone="error">{formError}</Alert>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-white/[0.06] px-6 py-4">
              <Button
                variant="ghost"
                onClick={() => { setCreating(false); resetForm(); }}
                disabled={pending}
              >
                Batal
              </Button>
              <Button
                onClick={handleSave}
                disabled={pending || !manualTotals.balanced}
                className="flex items-center gap-2"
              >
                {pending
                  ? "Menyimpan…"
                  : editingId
                    ? "Update Jurnal"
                    : "Catat Jurnal"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Total Entry" value={stats.total.toString()} />
        <StatTile label="Posted" value={stats.posted.toString()} tone="emerald" />
        <StatTile label="Penyesuaian" value={stats.reversed.toString()} tone="amber" />
        <StatTile
          label="Volume Total"
          value={fmtRupiah(stats.totalAmount)}
          subValue={stats.balanced ? "Balance ✓" : "TIDAK BALANCE!"}
          tone={stats.balanced ? "emerald" : "red"}
        />
      </div>

      <QuickTip
        id="buku-besar-journal-intro"
        title="Cara pakai Jurnal Penyesuaian"
        tone="warn"
      >
        Jurnal dari <strong>pembelian, penjualan, dan kas bank</strong> dicatat <em>otomatis</em> oleh sistem
        — tidak perlu diinput manual di sini. Halaman ini untuk <strong>penyesuaian accounting</strong>:
        koreksi, penyusutan, alokasi prepaid, dll. Hanya jurnal manual (icon{" "}
        <PenLine size={10} strokeWidth={1.9} className="inline-block translate-y-[1px]" />) yang bisa di-edit / di-hapus.
      </QuickTip>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/[0.06] bg-[#262626] p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            strokeWidth={1.8}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
          />
          <Input
            placeholder="Cari nomor jurnal, deskripsi, atau akun…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as "all" | "posted" | "reversed")
          }
          className="min-w-[140px]"
        >
          <option value="all">Semua status</option>
          <option value="posted">Posted</option>
          <option value="reversed">Reversed</option>
        </Select>
        <Select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="min-w-[180px]"
        >
          <option value="all">Semua sumber</option>
          {uniqueSources.map((s) => (
            <option key={s} value={s}>
              {sourceLabel[s] ?? s}
            </option>
          ))}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-[#262626] px-6 py-16 text-center">
          <ScrollText
            size={32}
            strokeWidth={1.5}
            className="mx-auto mb-4 text-white/30"
          />
          <h3 className="text-base font-medium text-white">Belum ada jurnal</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-white/50">
            Jurnal otomatis tercatat saat ada faktur pembelian, pembayaran
            vendor, invoice penjualan, atau penerimaan customer.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-[#262626]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-white/40">
                <th style={{ width: "32px" }}></th>
                <th className="px-4 py-3 font-medium">Tanggal</th>
                <th className="px-4 py-3 font-medium">No Jurnal</th>
                <th className="px-4 py-3 font-medium">Deskripsi</th>
                <th className="px-4 py-3 font-medium">Sumber</th>
                <th className="px-4 py-3 text-right font-medium">Debit</th>
                <th className="px-4 py-3 text-right font-medium">Kredit</th>
                <th className="px-4 py-3 text-center font-medium">Status</th>
                {canManage ? <th className="px-3 py-3 text-right font-medium">Aksi</th> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const isOpen = expanded.has(e.id);
                return (
                  <Fragment key={e.id}>
                    <tr
                      className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] cursor-pointer"
                      onClick={() => toggle(e.id)}
                    >
                      <td className="px-2 py-3">
                        <ChevronRight
                          size={14}
                          strokeWidth={2}
                          className={`text-white/40 transition-transform ${isOpen ? "rotate-90" : ""}`}
                        />
                      </td>
                      <td className="px-4 py-3 text-white/70">
                        <div className="flex items-center gap-1">
                          <Calendar size={11} strokeWidth={1.8} />
                          {fmtDate(e.entry_date)}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-white/80">
                        {e.entry_number}
                      </td>
                      <td className="px-4 py-3 text-white/80">
                        {e.description}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="inline-flex items-center gap-1 rounded bg-white/[0.04] px-2 py-0.5 text-white/60">
                          {e.source_type !== "manual" ? (
                            <Link2 size={9} strokeWidth={1.8} />
                          ) : (
                            <PenLine size={9} strokeWidth={1.8} />
                          )}
                          {sourceLabel[e.source_type] ?? e.source_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-white">
                        {fmtRupiah(e.total_debit)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-white">
                        {fmtRupiah(e.total_credit)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {e.status === "posted" ? (
                          <CheckCircle2
                            size={14}
                            strokeWidth={2}
                            className="mx-auto text-emerald-300"
                          />
                        ) : e.status === "reversed" ? (
                          <XCircle
                            size={14}
                            strokeWidth={2}
                            className="mx-auto text-amber-300"
                          />
                        ) : (
                          <span className="text-white/30">Draft</span>
                        )}
                      </td>
                      {canManage ? (
                        <td className="px-3 py-3 text-right">
                          {e.source_type === "manual" && e.status !== "reversed" ? (
                            <div className="flex items-center justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
                              <button
                                onClick={() => openEdit(e)}
                                className="flex h-7 w-7 items-center justify-center rounded text-white/40 hover:bg-white/[0.06] hover:text-sky-300 transition-colors"
                                title="Edit jurnal"
                              >
                                <Pencil size={13} strokeWidth={1.9} />
                              </button>
                              <button
                                onClick={() => setConfirmDelete(e.id)}
                                className="flex h-7 w-7 items-center justify-center rounded text-white/40 hover:bg-white/[0.06] hover:text-red-300 transition-colors"
                                title="Hapus jurnal"
                              >
                                <Trash2 size={13} strokeWidth={1.9} />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-white/20">—</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                    {isOpen ? (
                      <tr className="border-b border-white/[0.04] bg-[#1f1f1f]">
                        <td colSpan={canManage ? 9 : 8} className="px-4 py-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-[10px] uppercase tracking-wider text-white/40">
                                <th className="px-2 py-1 font-medium" style={{ width: "100px" }}>
                                  Kode
                                </th>
                                <th className="px-2 py-1 font-medium">Akun</th>
                                <th
                                  className="px-2 py-1 text-right font-medium"
                                  style={{ width: "140px" }}
                                >
                                  Debit
                                </th>
                                <th
                                  className="px-2 py-1 text-right font-medium"
                                  style={{ width: "140px" }}
                                >
                                  Kredit
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {e.lines.map((l) => (
                                <tr key={l.id}>
                                  <td className="px-2 py-1 font-mono text-white/60">
                                    {l.account_code}
                                  </td>
                                  <td className="px-2 py-1 text-white/80">
                                    {l.account_name}
                                    {l.description ? (
                                      <span className="ml-2 text-white/40">
                                        — {l.description}
                                      </span>
                                    ) : null}
                                  </td>
                                  <td className="px-2 py-1 text-right tabular-nums">
                                    {l.debit > 0 ? (
                                      <span className="text-sky-300">
                                        {fmtRupiah(l.debit)}
                                      </span>
                                    ) : (
                                      <span className="text-white/20">—</span>
                                    )}
                                  </td>
                                  <td className="px-2 py-1 text-right tabular-nums">
                                    {l.credit > 0 ? (
                                      <span className="text-violet-300">
                                        {fmtRupiah(l.credit)}
                                      </span>
                                    ) : (
                                      <span className="text-white/20">—</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {e.notes ? (
                            <p className="mt-2 text-[11px] text-white/50">
                              <strong>Catatan:</strong> {e.notes}
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  subValue,
  tone,
}: {
  label: string;
  value: string;
  subValue?: string;
  tone?: "amber" | "red" | "emerald";
}) {
  const t =
    tone === "amber"
      ? "text-amber-300"
      : tone === "red"
        ? "text-red-300"
        : tone === "emerald"
          ? "text-emerald-300"
          : "text-white";
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#262626] p-4">
      <div className="text-[11px] uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold ${t}`}>{value}</div>
      {subValue ? (
        <div className={`mt-0.5 text-xs ${t}`}>{subValue}</div>
      ) : null}
    </div>
  );
}
