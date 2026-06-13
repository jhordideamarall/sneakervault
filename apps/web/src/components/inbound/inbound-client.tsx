"use client";

import { useState, useTransition, useCallback } from "react";
import { scanInbound, confirmInbound, registerProduct } from "@/lib/actions/inbound";
import { Button, Card, Input, NumberInput, Select, FieldLabel, FieldError, Alert } from "@sneakervault/ui";
import { useToast } from "@/components/toast";
import { useHardwareScanner } from "@sneakervault/barcode";
import { CameraScanner } from "@/components/scanner/camera-scanner";
import { 
  PackagePlus, 
  Search, 
  QrCode, 
  Camera, 
  RotateCcw, 
  Plus, 
  CheckCircle2, 
  DollarSign,
  Info
} from "lucide-react";

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
  const [form, setForm] = useState(() => ({
    quantity: 1,
    supplier_id: suppliers[0]?.id ?? "",
    unit_cost: 0,
    defect_quantity: 0,
    returned_to_supplier: 0,
    ordered_at: new Date().toISOString().slice(0, 10),
    received_at: new Date().toISOString().slice(0, 10),
    authenticity_confirmed: false,
    notes: "",
  }));

  // Register-new state
  const [regForm, setRegForm] = useState({
    brand: "",
    model: "",
    sku: "",
    size: "",
    color: "",
    sell_price: 0,
  });

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

  // Hardware scanner (USB)
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
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
          <PackagePlus className="text-white/40" size={28} />
          Barang Masuk
        </h1>
        <p className="text-white/50">
          Scan barcode untuk menambah stok atau mendaftarkan produk baru.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Scanner & Status */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-white/[0.06] bg-[#262626] p-6 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
               <h3 className="text-sm font-semibold uppercase tracking-wider text-white/40 flex items-center gap-2">
                 <QrCode size={16} /> Scan Barcode
               </h3>
               {mode !== "idle" && (
                 <Button variant="ghost" size="sm" onClick={reset} className="h-7 text-[10px] text-red-400 hover:bg-red-500/10">
                   <RotateCcw size={10} className="mr-1" /> Reset
                 </Button>
               )}
            </div>
            
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={18} />
                <input
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && doScan(barcode)}
                  placeholder="Scan atau ketik barcode..."
                  disabled={mode !== "idle" || pending}
                  autoFocus
                  className="w-full rounded-xl bg-white/[0.03] border border-white/[0.1] py-3 pl-10 pr-4 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-white/10 transition-all"
                />
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={() => doScan(barcode)} 
                  disabled={pending || mode !== "idle" || !barcode}
                  className="flex-1 rounded-xl bg-white text-black hover:bg-white/90 font-bold h-12"
                >
                  {pending && mode === "idle" ? "Mencari..." : "Proses Scan"}
                </Button>
                <Button 
                  variant="secondary" 
                  onClick={() => setShowCamera(!showCamera)} 
                  disabled={mode !== "idle"}
                  className="w-12 h-12 rounded-xl border-white/10"
                >
                  <Camera size={20} />
                </Button>
              </div>
            </div>

            {showCamera && mode === "idle" && (
              <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black/40 shadow-inner">
                 <CameraScanner onScan={doScan} />
              </div>
            )}

            <div className="mt-8 rounded-xl bg-sky-500/5 border border-sky-500/10 p-4">
               <div className="flex gap-3">
                  <Info className="text-sky-400 shrink-0 mt-0.5" size={16} />
                  <p className="text-xs text-sky-200/60 leading-relaxed">
                     Pastikan barcode yang di-scan sesuai dengan label fisik. Gunakan scanner hardware untuk performa lebih cepat.
                  </p>
               </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Dynamic Form */}
        <div className="lg:col-span-2 space-y-6">
          {mode === "idle" && (
            <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-white/10 bg-white/[0.01] opacity-20">
               <PackagePlus size={80} strokeWidth={1} />
               <p className="mt-4 text-xl font-medium">Siap untuk memproses barang masuk.</p>
            </div>
          )}

          {/* Register new product */}
          {mode === "register" && (
            <Card className="border-white/[0.06] bg-[#262626] p-6 shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="mb-6 flex items-center gap-3">
                 <div className="rounded-full bg-amber-500/10 p-2 text-amber-500">
                    <Plus size={20} />
                 </div>
                 <div>
                    <h3 className="text-lg font-bold text-white">Daftarkan Produk Baru</h3>
                    <p className="text-xs text-white/40">Barcode <span className="text-amber-400 font-mono">{barcode}</span> belum ada di database.</p>
                 </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <FieldLabel required>Brand</FieldLabel>
                  <Input 
                    value={regForm.brand} 
                    onChange={(e) => setRegForm({ ...regForm, brand: e.target.value })} 
                    placeholder="Contoh: Nike, Adidas"
                  />
                  <FieldError message={fieldErrors.brand} />
                </div>
                <div className="space-y-2">
                  <FieldLabel required>Model</FieldLabel>
                  <Input 
                    value={regForm.model} 
                    onChange={(e) => setRegForm({ ...regForm, model: e.target.value })} 
                    placeholder="Contoh: Jordan 1 Low"
                  />
                  <FieldError message={fieldErrors.model} />
                </div>
                <div className="space-y-2">
                  <FieldLabel required>SKU</FieldLabel>
                  <Input 
                    value={regForm.sku} 
                    onChange={(e) => setRegForm({ ...regForm, sku: e.target.value })} 
                    placeholder="Contoh: AJ1-BRED-001"
                  />
                  <FieldError message={fieldErrors.sku} />
                </div>
                <div className="space-y-2">
                  <FieldLabel required>Size</FieldLabel>
                  <Input 
                    type="number" 
                    step="0.5" 
                    value={regForm.size} 
                    onChange={(e) => setRegForm({ ...regForm, size: e.target.value })} 
                    placeholder="Contoh: 42"
                  />
                  <FieldError message={fieldErrors.size} />
                </div>
                <div className="space-y-2">
                  <FieldLabel>Warna</FieldLabel>
                  <Input 
                    value={regForm.color} 
                    onChange={(e) => setRegForm({ ...regForm, color: e.target.value })} 
                    placeholder="Contoh: Red/Black"
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel required>Harga Jual (Rp)</FieldLabel>
                  <NumberInput
                    align="left"
                    value={regForm.sell_price}
                    onValueChange={(n) => setRegForm({ ...regForm, sell_price: n })}
                    placeholder="0"
                  />
                  <FieldError message={fieldErrors.sell_price} />
                </div>
              </div>

              {fieldErrors._form && <Alert tone="error" className="mt-6">{fieldErrors._form}</Alert>}

              <div className="mt-8 flex gap-3">
                <Button onClick={handleRegister} disabled={pending} className="flex-1 h-11 bg-white text-black font-bold">
                  {pending ? "Mendaftarkan..." : "Daftarkan & Lanjut Input Batch"}
                </Button>
                <Button variant="ghost" onClick={reset} className="h-11">Batal</Button>
              </div>
            </Card>
          )}

          {/* Confirm inbound batch */}
          {mode === "confirm" && product && (
            <Card className="border-white/[0.06] bg-[#262626] p-6 shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="mb-6 flex flex-col gap-4">
                 <div className="flex items-center gap-3">
                    <div className="rounded-full bg-emerald-500/10 p-2 text-emerald-500">
                       <CheckCircle2 size={20} />
                    </div>
                    <div>
                       <h3 className="text-lg font-bold text-white">Input Batch Pembelian</h3>
                       <p className="text-xs text-white/40 font-mono">Barcode terdeteksi: {barcode}</p>
                    </div>
                 </div>

                 <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-4 flex flex-wrap gap-y-4 gap-x-8">
                    <div className="space-y-1">
                       <p className="text-[10px] uppercase font-bold text-white/30 tracking-wider">Produk</p>
                       <p className="text-sm font-bold text-white">{product.brand} {product.model}</p>
                    </div>
                    <div className="space-y-1">
                       <p className="text-[10px] uppercase font-bold text-white/30 tracking-wider">Size / SKU</p>
                       <p className="text-sm font-medium text-white/70">{product.size} / {product.sku}</p>
                    </div>
                    <div className="space-y-1">
                       <p className="text-[10px] uppercase font-bold text-white/30 tracking-wider">Stok Saat Ini</p>
                       <p className="text-sm font-bold text-amber-400">{product.quantity} pasang</p>
                    </div>
                    <div className="space-y-1 ml-auto text-right">
                       <p className="text-[10px] uppercase font-bold text-white/30 tracking-wider">HPP Sekarang</p>
                       <p className="text-sm font-bold text-emerald-400">Rp {Number(product.hpp).toLocaleString("id-ID")}</p>
                    </div>
                 </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <FieldLabel required>Supplier</FieldLabel>
                  <Select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                    {suppliers.length === 0 && <option value="">Belum ada supplier</option>}
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </Select>
                  <FieldError message={fieldErrors.supplier_id} />
                </div>
                <div className="space-y-2">
                  <FieldLabel required>Jumlah Unit Masuk</FieldLabel>
                  <div className="relative">
                    <PackagePlus className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={16} />
                    <Input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} className="pl-10" />
                  </div>
                  <FieldError message={fieldErrors.quantity} />
                </div>
                <div className="space-y-2">
                  <FieldLabel required>Harga Modal Per Unit (HPP)</FieldLabel>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={16} />
                    <NumberInput align="left" value={form.unit_cost} onValueChange={(n) => setForm({ ...form, unit_cost: n })} className="pl-10" />
                  </div>
                  <FieldError message={fieldErrors.unit_cost} />
                </div>
                <div className="space-y-2">
                  <FieldLabel>Jumlah Defect</FieldLabel>
                  <Input type="number" min={0} value={form.defect_quantity} onChange={(e) => setForm({ ...form, defect_quantity: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <FieldLabel>Tanggal Order</FieldLabel>
                  <Input type="date" value={form.ordered_at} onChange={(e) => setForm({ ...form, ordered_at: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <FieldLabel>Tanggal Diterima</FieldLabel>
                  <Input type="date" value={form.received_at} onChange={(e) => setForm({ ...form, received_at: e.target.value })} />
                </div>
                <div className="flex items-center gap-3 pt-4 sm:col-span-2">
                  <input
                    id="auth"
                    type="checkbox"
                    checked={form.authenticity_confirmed}
                    onChange={(e) => setForm({ ...form, authenticity_confirmed: e.target.checked })}
                    className="h-5 w-5 rounded-md border-white/10 bg-white/5 accent-emerald-500 transition-all"
                  />
                  <label htmlFor="auth" className="text-sm font-medium text-white/70 cursor-pointer select-none">Saya menjamin keaslian barang ini (Authentic Check Passed)</label>
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <FieldLabel>Catatan Internal</FieldLabel>
                  <textarea 
                    value={form.notes} 
                    onChange={(e) => setForm({ ...form, notes: e.target.value })} 
                    placeholder="Contoh: Kondisi box sedikit penyok" 
                    className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] py-2.5 px-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 min-h-[80px]"
                  />
                </div>
              </div>

              {fieldErrors._form && <Alert tone="error" className="mt-6">{fieldErrors._form}</Alert>}

              <div className="mt-8 flex gap-3">
                <Button variant="success" onClick={handleConfirm} disabled={pending || suppliers.length === 0} className="flex-1 h-12 text-sm font-bold shadow-lg shadow-emerald-500/10">
                  {pending ? "Memproses..." : `Konfirmasi Masuk (+${form.quantity} unit)`}
                </Button>
                <Button variant="ghost" onClick={reset} className="h-12 px-8">Batal</Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
