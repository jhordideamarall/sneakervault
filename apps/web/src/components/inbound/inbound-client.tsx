"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { scanInbound, confirmInbound, registerProduct } from "@/lib/actions/inbound";
import { Button, Card, CardHeader, CardTitle, Input, Select, FieldLabel, FieldError, Alert } from "@sneakervault/ui";
import { useToast } from "@/components/toast";
import { useHardwareScanner } from "@sneakervault/barcode";
import { CameraScanner } from "@/components/scanner/camera-scanner";

type Supplier = { id: string; name: string };
type Product = Record<string, unknown> & {
  id: string;
  brand: string;
  model: string;
  sku: string;
  size: number;
  barcode: string;
  quantity: number;
  hpp: number;
};

export function InboundClient({ suppliers }: { suppliers: Supplier[] }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [mode, setMode] = useState<"idle" | "register" | "confirm">("idle");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showCamera, setShowCamera] = useState(false);

  // Batch + qty state
  const [form, setForm] = useState({
    quantity: 1,
    supplier_id: "",
    unit_cost: 0,
    defect_quantity: 0,
    returned_to_supplier: 0,
    ordered_at: new Date().toISOString().slice(0, 10),
    received_at: new Date().toISOString().slice(0, 10),
    authenticity_confirmed: false,
    notes: "",
  });

  // Register-new state
  const [regForm, setRegForm] = useState({
    brand: "",
    model: "",
    sku: "",
    size: "",
    color: "",
    sell_price: 0,
  });

  useEffect(() => {
    if (suppliers.length > 0 && !form.supplier_id) {
      setForm((f) => ({ ...f, supplier_id: suppliers[0]!.id }));
    }
  }, [suppliers, form.supplier_id]);

  const doScan = useCallback((code: string) => {
    if (!code.trim() || mode !== "idle") return;
    setBarcode(code.trim());
    setFieldErrors({});
    startTransition(async () => {
      const result = await scanInbound(code.trim());
      if (result) {
        setProduct(result as Product);
        setMode("confirm");
      } else {
        setProduct(null);
        setMode("register");
        toast.push("Produk belum terdaftar — isi form pendaftaran", "info");
      }
    });
    setShowCamera(false);
  }, [mode, toast]);

  // Hardware scanner (USB) — auto-detect rapid keystrokes
  useHardwareScanner({ onScan: doScan, enabled: mode === "idle" });

  function handleRegister() {
    setFieldErrors({});
    startTransition(async () => {
      const result = await registerProduct({
        ...regForm,
        size: Number(regForm.size),
        barcode: barcode.trim(),
        quantity: 0,
        hpp: 0,
      });
      if ("error" in result && result.error) {
        const errs: Record<string, string> = {};
        for (const [k, v] of Object.entries(result.error)) {
          if (Array.isArray(v) && v[0]) errs[k] = v[0];
        }
        setFieldErrors(errs);
        toast.push("Gagal mendaftarkan produk", "error");
        return;
      }
      if ("data" in result && result.data) {
        setProduct(result.data as Product);
        setMode("confirm");
        toast.push("Produk berhasil didaftarkan", "success");
      }
    });
  }

  function handleConfirm() {
    if (!product) return;
    setFieldErrors({});
    startTransition(async () => {
      const result = await confirmInbound({
        product_id: product.id,
        quantity: form.quantity,
        batch_data: {
          supplier_id: form.supplier_id,
          brand: product.brand,
          model: product.model,
          product_id: product.id,
          quantity: form.quantity,
          defect_quantity: form.defect_quantity,
          returned_to_supplier: form.returned_to_supplier,
          unit_cost: form.unit_cost,
          authenticity_confirmed: form.authenticity_confirmed,
          notes: form.notes || undefined,
          ordered_at: new Date(form.ordered_at).toISOString(),
          received_at: form.received_at ? new Date(form.received_at).toISOString() : undefined,
        },
      });
      if ("error" in result && result.error) {
        const errs: Record<string, string> = {};
        for (const [k, v] of Object.entries(result.error)) {
          if (Array.isArray(v) && v[0]) errs[k] = v[0];
        }
        setFieldErrors(errs);
        toast.push("Gagal mencatat barang masuk", "error");
        return;
      }
      toast.push(`Stok ${product.brand} ${product.model} bertambah ${form.quantity}`, "success");
      reset();
    });
  }

  function reset() {
    setBarcode("");
    setProduct(null);
    setMode("idle");
    setForm((f) => ({ ...f, quantity: 1, unit_cost: 0, defect_quantity: 0, returned_to_supplier: 0, notes: "" }));
    setRegForm({ brand: "", model: "", sku: "", size: "", color: "", sell_price: 0 });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1a1a2e]">📥 Barang Masuk</h1>

      {/* Scanner */}
      <Card>
        <CardHeader>
          <CardTitle>Scan Barcode</CardTitle>
          <div className="flex gap-2">
            {mode !== "idle" && <Button variant="ghost" size="sm" onClick={reset}>Reset</Button>}
          </div>
        </CardHeader>
        <div className="flex gap-2">
          <Input
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doScan(barcode)}
            placeholder="Scan atau ketik barcode..."
            disabled={mode !== "idle" || pending}
            autoFocus
          />
          <Button onClick={() => doScan(barcode)} disabled={pending || mode !== "idle"}>
            {pending && mode === "idle" ? "Mencari..." : "Cari"}
          </Button>
          <Button variant="ghost" onClick={() => setShowCamera(!showCamera)} disabled={mode !== "idle"}>
            📷
          </Button>
        </div>
        {showCamera && mode === "idle" && (
          <CameraScanner onScan={doScan} />
        )}
      </Card>

      {/* Register new product */}
      {mode === "register" && (
        <Card>
          <CardHeader>
            <CardTitle>Daftarkan Produk Baru</CardTitle>
          </CardHeader>
          <Alert tone="info" className="mb-4">
            Barcode <span className="font-mono">{barcode}</span> belum terdaftar. Isi data produk lalu lanjut ke input batch.
          </Alert>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="brand" required>Brand</FieldLabel>
              <Input id="brand" value={regForm.brand} onChange={(e) => setRegForm({ ...regForm, brand: e.target.value })} />
              <FieldError message={fieldErrors.brand} />
            </div>
            <div>
              <FieldLabel htmlFor="model" required>Model</FieldLabel>
              <Input id="model" value={regForm.model} onChange={(e) => setRegForm({ ...regForm, model: e.target.value })} />
              <FieldError message={fieldErrors.model} />
            </div>
            <div>
              <FieldLabel htmlFor="sku" required>SKU</FieldLabel>
              <Input id="sku" value={regForm.sku} onChange={(e) => setRegForm({ ...regForm, sku: e.target.value })} />
              <FieldError message={fieldErrors.sku} />
            </div>
            <div>
              <FieldLabel htmlFor="size" required>Size</FieldLabel>
              <Input id="size" type="number" step="0.5" value={regForm.size} onChange={(e) => setRegForm({ ...regForm, size: e.target.value })} />
              <FieldError message={fieldErrors.size} />
            </div>
            <div>
              <FieldLabel htmlFor="color">Warna</FieldLabel>
              <Input id="color" value={regForm.color} onChange={(e) => setRegForm({ ...regForm, color: e.target.value })} />
            </div>
            <div>
              <FieldLabel htmlFor="sell_price" required>Harga Jual (Rp)</FieldLabel>
              <Input id="sell_price" type="number" value={regForm.sell_price} onChange={(e) => setRegForm({ ...regForm, sell_price: Number(e.target.value) })} />
              <FieldError message={fieldErrors.sell_price} />
            </div>
          </div>
          {fieldErrors._form && <Alert tone="error" className="mt-4">{fieldErrors._form}</Alert>}
          <div className="mt-6 flex gap-3">
            <Button onClick={handleRegister} disabled={pending}>
              {pending ? "Mendaftarkan..." : "Daftarkan & Lanjut ke Batch"}
            </Button>
          </div>
        </Card>
      )}

      {/* Confirm inbound batch */}
      {mode === "confirm" && product && (
        <Card>
          <CardHeader>
            <CardTitle>Input Batch Pembelian</CardTitle>
          </CardHeader>
          <Alert tone="success" className="mb-4">
            <strong>{product.brand} {product.model}</strong> — Size {product.size} · SKU {product.sku} · Stok saat ini: {product.quantity} · HPP: Rp {Number(product.hpp).toLocaleString("id-ID")}
          </Alert>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="supplier" required>Supplier</FieldLabel>
              <Select id="supplier" value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                {suppliers.length === 0 && <option value="">Belum ada supplier</option>}
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
              <FieldError message={fieldErrors.supplier_id} />
            </div>
            <div>
              <FieldLabel htmlFor="quantity" required>Jumlah Masuk</FieldLabel>
              <Input id="quantity" type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
              <FieldError message={fieldErrors.quantity} />
            </div>
            <div>
              <FieldLabel htmlFor="unit_cost" required>Harga Modal / Unit (Rp)</FieldLabel>
              <Input id="unit_cost" type="number" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: Number(e.target.value) })} />
              <FieldError message={fieldErrors.unit_cost} />
            </div>
            <div>
              <FieldLabel htmlFor="defect_quantity">Jumlah Defect</FieldLabel>
              <Input id="defect_quantity" type="number" min={0} value={form.defect_quantity} onChange={(e) => setForm({ ...form, defect_quantity: Number(e.target.value) })} />
            </div>
            <div>
              <FieldLabel htmlFor="returned_to_supplier">Diretur ke Supplier</FieldLabel>
              <Input id="returned_to_supplier" type="number" min={0} max={form.defect_quantity} value={form.returned_to_supplier} onChange={(e) => setForm({ ...form, returned_to_supplier: Number(e.target.value) })} />
            </div>
            <div>
              <FieldLabel htmlFor="ordered_at">Tanggal Order</FieldLabel>
              <Input id="ordered_at" type="date" value={form.ordered_at} onChange={(e) => setForm({ ...form, ordered_at: e.target.value })} />
            </div>
            <div>
              <FieldLabel htmlFor="received_at">Tanggal Diterima</FieldLabel>
              <Input id="received_at" type="date" value={form.received_at} onChange={(e) => setForm({ ...form, received_at: e.target.value })} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                id="auth"
                type="checkbox"
                checked={form.authenticity_confirmed}
                onChange={(e) => setForm({ ...form, authenticity_confirmed: e.target.checked })}
                className="h-4 w-4"
              />
              <label htmlFor="auth" className="text-sm text-[#1a1a2e]">Keaslian sudah dicek</label>
            </div>
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="notes">Catatan</FieldLabel>
              <Input id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="opsional" />
            </div>
          </div>

          {fieldErrors._form && <Alert tone="error" className="mt-4">{fieldErrors._form}</Alert>}

          <div className="mt-6 flex gap-3">
            <Button variant="success" onClick={handleConfirm} disabled={pending || suppliers.length === 0}>
              {pending ? "Memproses..." : `Konfirmasi Masuk (+${form.quantity})`}
            </Button>
            <Button variant="ghost" onClick={reset}>Batal</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
