"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, FieldLabel, Input, NumberInput, Select, Textarea } from "@sneakervault/ui";
import { createFixedAsset, disposeFixedAsset } from "@/lib/actions/fixed-assets";
import { exportToExcel, exportToPDF } from "@/lib/export";
import { useToast } from "@/components/toast";
import type { BankAccountRow, CoaAccountOption, FixedAssetRow } from "@/lib/queries";
import { formatDate, formatRupiah } from "@/lib/format";
import { Archive, Building2, Download, Plus } from "lucide-react";

const emptyForm = {
  asset_code: "",
  name: "",
  asset_account_id: "",
  acquisition_date: new Date().toISOString().slice(0, 10),
  acquisition_cost: 0,
  salvage_value: 0,
  useful_life_months: 48,
  method: "straight_line" as "straight_line" | "double_declining",
  bank_account_id: "",
  location: "",
  department: "",
  notes: "",
  status: "active" as const,
};

export function FixedAssetsClient({
  assets,
  bankAccounts,
  assetAccounts,
}: {
  assets: FixedAssetRow[];
  bankAccounts: BankAccountRow[];
  assetAccounts: CoaAccountOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  function save() {
    startTransition(async () => {
      const result = await createFixedAsset({
        ...form,
        asset_account_id: form.asset_account_id || null,
        bank_account_id: form.bank_account_id || null,
      });
      if (result.error) {
        toast.push(Object.values(result.error).flat().join(", "), "error");
        return;
      }
        toast.push("Aset tetap ditambahkan", "success");
        setForm(emptyForm);
      setFormOpen(false);
      router.refresh();
    });
  }

  function dispose(asset: FixedAssetRow) {
    const reason = prompt(`Alasan dispose aset "${asset.name}"?`, "Aset dilepas/dihapus");
    if (reason === null) return;
    const disposalDate = new Date().toISOString().slice(0, 10);
    if (
      !confirm(
        `Dispose ${asset.name} per ${formatDate(disposalDate)}? Sistem akan posting jurnal pelepasan aset berdasarkan nilai buku.`,
      )
    )
      return;
    startTransition(async () => {
      const result = await disposeFixedAsset(asset.id, {
        disposal_date: disposalDate,
        reason,
      });
      if (result.error) {
        toast.push(
          typeof result.error === "string"
            ? result.error
            : Object.values(result.error).flat().join(", "),
          "error",
        );
        return;
      }
      toast.push("Aset disposed dan jurnal pelepasan dibuat", "success");
      router.refresh();
    });
  }

  async function exportAssets(format: "pdf" | "excel") {
    const rows = assets.map((asset) => [
      asset.asset_code ?? "-",
      asset.name,
      asset.asset_account_code
        ? `${asset.asset_account_code} · ${asset.asset_account_name}`
        : "1.2.01 · Aset Tetap Umum",
      formatDate(asset.acquisition_date),
      asset.acquisition_cost,
      asset.accumulated_depreciation,
      asset.book_value,
      asset.method === "straight_line" ? "Garis lurus" : "Menurun ganda",
      asset.location ?? "-",
      asset.department ?? "-",
      asset.status === "active" ? "Aktif" : "Disposed",
    ]);
    const params = {
      title: "Register Aset Tetap",
      sheetName: "Aset Tetap",
      filename: format === "pdf" ? "register-aset-tetap.pdf" : "register-aset-tetap.xlsx",
      columns: [
        "Kode",
        "Nama",
        "Akun Debit",
        "Tanggal",
        "Nilai Perolehan",
        "Akumulasi Depresiasi",
        "Nilai Buku",
        "Metode",
        "Lokasi",
        "Departemen",
        "Status",
      ],
      rows,
      summary: [
        { label: "Total Aset", value: String(assets.length) },
        { label: "Nilai Perolehan", value: formatRupiah(totals.cost) },
        { label: "Akumulasi Depresiasi", value: formatRupiah(totals.depreciation) },
        { label: "Nilai Buku", value: formatRupiah(totals.book) },
      ],
    };
    if (format === "pdf") await exportToPDF(params);
    else await exportToExcel(params);
  }

  const totals = assets.reduce(
    (acc, asset) => ({
      cost: acc.cost + asset.acquisition_cost,
      depreciation: acc.depreciation + asset.accumulated_depreciation,
      book: acc.book + asset.book_value,
    }),
    { cost: 0, depreciation: 0, book: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] text-white/80">
            <Building2 size={20} strokeWidth={1.7} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">Aset Tetap</h1>
            <p className="text-sm text-white/45">
              Pembelian aset tetap, register aset, nilai buku, dan depresiasi bulanan.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" disabled={assets.length === 0} onClick={() => exportAssets("pdf")}>
            <Download size={14} />
            PDF
          </Button>
          <Button type="button" variant="secondary" disabled={assets.length === 0} onClick={() => exportAssets("excel")}>
            <Download size={14} />
            Excel
          </Button>
          <Button type="button" onClick={() => setFormOpen((open) => !open)}>
            <Plus size={16} />
            Pembelian Aset
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4"><p className="text-xs text-white/35">Nilai Perolehan</p><p className="mt-1 text-xl font-semibold text-white">{formatRupiah(totals.cost)}</p></Card>
        <Card className="p-4"><p className="text-xs text-white/35">Akumulasi Depresiasi</p><p className="mt-1 text-xl font-semibold text-amber-300">{formatRupiah(totals.depreciation)}</p></Card>
        <Card className="p-4"><p className="text-xs text-white/35">Nilai Buku</p><p className="mt-1 text-xl font-semibold text-emerald-300">{formatRupiah(totals.book)}</p></Card>
      </div>

      {formOpen ? (
        <Card className="grid gap-3 p-5 md:grid-cols-4">
          <div><FieldLabel>Kode Aset</FieldLabel><Input value={form.asset_code} onChange={(e) => setForm({ ...form, asset_code: e.target.value })} /></div>
          <div><FieldLabel>Nama *</FieldLabel><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div>
            <FieldLabel>Akun Aset Debit</FieldLabel>
            <Select value={form.asset_account_id} onChange={(e) => setForm({ ...form, asset_account_id: e.target.value })}>
              <option value="">1.2.01 · Aset Tetap Umum</option>
              {assetAccounts
                .filter((account) => account.code !== "1.2.01")
                .filter((account) => account.code.startsWith("1.2") || /aset|kendaraan|peralatan|inventaris/i.test(account.name))
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} · {account.name}
                  </option>
                ))}
            </Select>
          </div>
          <div><FieldLabel>Tanggal Perolehan</FieldLabel><Input type="date" value={form.acquisition_date} onChange={(e) => setForm({ ...form, acquisition_date: e.target.value })} /></div>
          <div><FieldLabel>Metode</FieldLabel><Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as typeof form.method })}><option value="straight_line">Straight-line</option><option value="double_declining">Double-declining</option></Select></div>
          <div><FieldLabel>Nilai Perolehan</FieldLabel><NumberInput value={form.acquisition_cost} onValueChange={(value) => setForm({ ...form, acquisition_cost: value })} /></div>
          <div><FieldLabel>Nilai Residu</FieldLabel><NumberInput value={form.salvage_value} onValueChange={(value) => setForm({ ...form, salvage_value: value })} /></div>
          <div><FieldLabel>Umur (bulan)</FieldLabel><Input type="number" min={1} value={form.useful_life_months} onChange={(e) => setForm({ ...form, useful_life_months: Number(e.target.value) || 1 })} /></div>
          <div>
            <FieldLabel>Sumber Dana</FieldLabel>
            <Select value={form.bank_account_id} onChange={(e) => setForm({ ...form, bank_account_id: e.target.value })}>
              <option value="">Hutang Usaha (belum dibayar)</option>
              {bankAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {formatRupiah(account.current_balance)}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-[11px] text-white/40">
              Jika pilih bank/kas: Dr akun aset, Cr akun bank/kas. Jika kosong: Cr Hutang Usaha.
            </p>
          </div>
          <div><FieldLabel>Lokasi</FieldLabel><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          <div><FieldLabel>Departemen</FieldLabel><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
          <div className="md:col-span-4"><FieldLabel>Catatan</FieldLabel><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="md:col-span-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>Batal</Button>
            <Button type="button" disabled={pending || !form.name.trim() || form.acquisition_cost <= 0} onClick={save}>Simpan Pembelian Aset</Button>
          </div>
        </Card>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-[#262626]">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-white/35">
            <tr><th className="px-4 py-3">Aset</th><th className="px-4 py-3">Akun Debit</th><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3 text-right">Perolehan</th><th className="px-4 py-3 text-right">Akum. Depresiasi</th><th className="px-4 py-3 text-right">Nilai Buku</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Aksi</th></tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {assets.map((asset) => (
              <tr key={asset.id}>
                <td className="px-4 py-3 text-white">{asset.name}<div className="text-[11px] text-white/35">{asset.asset_code ?? "—"} · {asset.location ?? "Lokasi belum diisi"}</div></td>
                <td className="px-4 py-3 text-white/60">
                  {asset.asset_account_code ? `${asset.asset_account_code} · ${asset.asset_account_name}` : "1.2.01 · Aset Tetap Umum"}
                </td>
                <td className="px-4 py-3 text-white/60">{formatDate(asset.acquisition_date)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-white">{formatRupiah(asset.acquisition_cost)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-amber-300">{formatRupiah(asset.accumulated_depreciation)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-emerald-300">{formatRupiah(asset.book_value)}</td>
                <td className="px-4 py-3 text-white/60">{asset.status === "active" ? "Aktif" : "Disposed"}</td>
                <td className="px-4 py-3 text-right">
                  {asset.status === "active" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => dispose(asset)}
                    >
                      <Archive size={14} />
                      Dispose
                    </Button>
                  ) : (
                    <span className="text-xs text-white/30">Selesai</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
