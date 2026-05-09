"use client";

import { useState, useTransition } from "react";
import { Button, Input, Card, FieldLabel, FieldError, Alert } from "@sneakervault/ui";
import { updateProduct, createProduct } from "@/lib/actions/products";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";
import { ExportButtons } from "@/components/export-buttons";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { BulkImportButton } from "@/components/inventory/bulk-import-button";

type Product = Record<string, unknown> & {
  id: string;
  brand: string;
  model: string;
  sku: string;
  size: number;
  color: string | null;
  barcode: string;
  quantity: number;
  hpp: number;
  sell_price: number;
};

export function InventoryClient({
  products,
  total,
  roles,
}: {
  products: Product[];
  total: number;
  roles: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ brand: "", model: "", sku: "", size: "", color: "", barcode: "", sell_price: 0 });

  // Live refresh when any product changes (e.g. stock decrement from another tab)
  useLiveRefresh(["products"]);

  const canEdit = roles.includes("owner") || roles.includes("admin_gudang");
  const canEditPrice = roles.includes("owner");

  const filtered = search
    ? products.filter((p) => {
        const q = search.toLowerCase();
        return (
          p.brand.toLowerCase().includes(q) ||
          p.model.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q)
        );
      })
    : products;

  function handleSave(form: { sell_price: number; color: string }) {
    if (!editing) return;
    setFieldErrors({});
    startTransition(async () => {
      const result = await updateProduct({
        id: editing.id,
        sell_price: canEditPrice ? form.sell_price : undefined,
        color: form.color,
      });
      if ("error" in result && result.error) {
        const errs: Record<string, string> = {};
        for (const [k, v] of Object.entries(result.error)) {
          if (Array.isArray(v) && v[0]) errs[k] = v[0];
        }
        setFieldErrors(errs);
        toast.push("Gagal menyimpan", "error");
        return;
      }
      toast.push("Produk disimpan", "success");
      setEditing(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1a1a2e]">📦 Inventori</h1>
        <div className="flex items-center gap-3">
          <ExportButtons
            title="Inventori SneakerVault"
            sheetName="Inventori"
            columns={["Brand", "Model", "Size", "SKU", "Barcode", "Stok", "HPP", "Harga Jual"]}
            rows={filtered.map((p) => [p.brand, p.model, p.size, p.sku, p.barcode, p.quantity, p.hpp, p.sell_price])}
          />
          {canEdit && <BulkImportButton />}
          {canEdit && <Button size="sm" onClick={() => setShowAdd(true)}>+ Tambah Produk</Button>}
          <span className="text-sm text-[#6b7280]">{total} produk</span>
        </div>
      </div>

      <Input
        placeholder="Cari brand, model, SKU, atau barcode..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {showAdd && (
        <Card>
          <div className="grid gap-4 sm:grid-cols-3">
            <div><FieldLabel htmlFor="add-brand">Brand</FieldLabel><Input id="add-brand" value={addForm.brand} onChange={(e) => setAddForm({ ...addForm, brand: e.target.value })} placeholder="Adidas" /></div>
            <div><FieldLabel htmlFor="add-model">Model</FieldLabel><Input id="add-model" value={addForm.model} onChange={(e) => setAddForm({ ...addForm, model: e.target.value })} placeholder="Samba White" /></div>
            <div><FieldLabel htmlFor="add-sku">SKU</FieldLabel><Input id="add-sku" value={addForm.sku} onChange={(e) => setAddForm({ ...addForm, sku: e.target.value })} placeholder="ADS-SAMBA-WHT-42" /></div>
            <div><FieldLabel htmlFor="add-size">Size</FieldLabel><Input id="add-size" type="number" step="0.5" value={addForm.size} onChange={(e) => setAddForm({ ...addForm, size: e.target.value })} placeholder="42" /></div>
            <div><FieldLabel htmlFor="add-color">Warna</FieldLabel><Input id="add-color" value={addForm.color} onChange={(e) => setAddForm({ ...addForm, color: e.target.value })} placeholder="White" /></div>
            <div><FieldLabel htmlFor="add-barcode">Barcode</FieldLabel><Input id="add-barcode" value={addForm.barcode} onChange={(e) => setAddForm({ ...addForm, barcode: e.target.value })} placeholder="104163" /></div>
            {canEditPrice && <div><FieldLabel htmlFor="add-price">Harga Jual (Rp)</FieldLabel><Input id="add-price" type="number" value={addForm.sell_price} onChange={(e) => setAddForm({ ...addForm, sell_price: Number(e.target.value) })} /></div>}
          </div>
          {fieldErrors._form && <Alert tone="error" className="mt-3">{fieldErrors._form}</Alert>}
          <div className="mt-4 flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => {
              setFieldErrors({});
              startTransition(async () => {
                const result = await createProduct({ ...addForm, size: Number(addForm.size), quantity: 0, hpp: 0 });
                if ("error" in result && result.error) {
                  const errs: Record<string, string> = {};
                  for (const [k, v] of Object.entries(result.error)) { if (Array.isArray(v) && v[0]) errs[k] = v[0]; }
                  setFieldErrors(errs);
                  toast.push("Gagal menambah produk", "error");
                  return;
                }
                toast.push("Produk berhasil ditambahkan", "success");
                setShowAdd(false);
                setAddForm({ brand: "", model: "", sku: "", size: "", color: "", barcode: "", sell_price: 0 });
                router.refresh();
              });
            }}>{pending ? "Menyimpan..." : "Simpan"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Batal</Button>
          </div>
        </Card>
      )}

      <div className="rounded-xl border border-[#e5e7eb] bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-[#e5e7eb] bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Produk</th>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">SKU</th>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Size</th>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Barcode</th>
              <th className="px-4 py-3 text-right font-medium text-[#6b7280]">Stok</th>
              <th className="px-4 py-3 text-right font-medium text-[#6b7280]">HPP</th>
              <th className="px-4 py-3 text-right font-medium text-[#6b7280]">Jual</th>
              {canEdit && <th className="px-4 py-3 text-right font-medium text-[#6b7280]"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e7eb]">
            {filtered.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{p.brand} {p.model}</td>
                <td className="px-4 py-3 font-mono text-xs text-[#6b7280]">{p.sku}</td>
                <td className="px-4 py-3">{p.size}</td>
                <td className="px-4 py-3 font-mono text-xs text-[#6b7280]">{p.barcode}</td>
                <td className="px-4 py-3 text-right font-semibold">{p.quantity}</td>
                <td className="px-4 py-3 text-right text-[#6b7280]">Rp {Number(p.hpp).toLocaleString("id-ID")}</td>
                <td className="px-4 py-3 text-right">Rp {Number(p.sell_price).toLocaleString("id-ID")}</td>
                {canEdit && (
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit</Button>
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 8 : 7} className="px-4 py-8 text-center text-[#6b7280]">
                  Tidak ada produk.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditModal
          product={editing}
          canEditPrice={canEditPrice}
          fieldErrors={fieldErrors}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function EditModal({
  product,
  canEditPrice,
  fieldErrors,
  pending,
  onCancel,
  onSave,
}: {
  product: Product;
  canEditPrice: boolean;
  fieldErrors: Record<string, string>;
  pending: boolean;
  onCancel: () => void;
  onSave: (form: { sell_price: number; color: string }) => void;
}) {
  const [form, setForm] = useState({
    sell_price: product.sell_price,
    color: product.color ?? "",
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md">
        <h2 className="mb-4 text-lg font-semibold">Edit Produk</h2>
        <p className="mb-4 text-sm text-[#6b7280]">
          {product.brand} {product.model} — size {product.size}
        </p>

        <div className="space-y-4">
          <div>
            <FieldLabel>Warna</FieldLabel>
            <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          </div>
          <div>
            <FieldLabel>Harga Jual (Rp)</FieldLabel>
            <Input
              type="number"
              value={form.sell_price}
              onChange={(e) => setForm({ ...form, sell_price: Number(e.target.value) })}
              disabled={!canEditPrice}
            />
            {!canEditPrice && (
              <p className="mt-1 text-xs text-[#6b7280]">Hanya owner yang bisa ubah harga.</p>
            )}
            <FieldError message={fieldErrors.sell_price} />
          </div>
        </div>

        {fieldErrors._form && <Alert tone="error" className="mt-4">{fieldErrors._form}</Alert>}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel}>Batal</Button>
          <Button onClick={() => onSave(form)} disabled={pending}>
            {pending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
