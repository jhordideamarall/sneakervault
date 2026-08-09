"use client";

import { useState, useTransition, useCallback } from "react";
import {
  addPackingItemManual,
  createPackingSession,
  scanPackingItem,
  searchProductsForPacking,
  removePackingItem,
  cancelPackingSession,
  finalizePackingSession,
} from "@/lib/actions/outbound";
import { PLATFORMS, COURIERS } from "@sneakervault/shared";
import {
  Button, Card, Input, Select, FieldLabel, FieldError, Alert, Badge,
} from "@sneakervault/ui";
import { useToast } from "@/components/toast";
import { formatRupiah } from "@/lib/format";
import { useHardwareScanner } from "@sneakervault/barcode";
import { CameraScanner } from "@/components/scanner/camera-scanner";
import { 
  PackageMinus, 
  ShoppingCart, 
  QrCode, 
  Camera, 
  XCircle, 
  CheckCircle2, 
  Trash2,
  Search,
  RotateCcw,
} from "lucide-react";

type SessionRow = {
  id: string;
  status: string;
  platform: string;
  courier: string;
  platform_order_id: string | null;
};

type Item = {
  id: string;
  product_id: string;
  barcode: string;
  brand: string;
  model: string;
  size: number | null;
  size_label?: string | null;
};

type PackingProduct = {
  id: string;
  brand: string;
  model: string;
  sku: string;
  barcode: string;
  size: number | null;
  size_label?: string | null;
  color: string | null;
  quantity: number;
  sell_price: number;
  price_offline?: number | null;
  image_url?: string | null;
};

type UnfinishedPackingSession = SessionRow & {
  created_at: string;
  packing_items: Array<{
    id: string;
    product_id: string;
    barcode_scanned: string;
    products: {
      id: string;
      brand: string;
      model: string;
      size: number | null;
      size_label?: string | null;
      barcode?: string | null;
    } | null;
  }>;
};

export function OutboundClient({
  unfinishedSessions = [],
}: {
  unfinishedSessions?: UnfinishedPackingSession[];
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [session, setSession] = useState<SessionRow | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [scanBarcode, setScanBarcode] = useState("");
  const [showCamera, setShowCamera] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [manualResults, setManualResults] = useState<PackingProduct[]>([]);
  const [recoverableSessions, setRecoverableSessions] =
    useState<UnfinishedPackingSession[]>(unfinishedSessions);

  const [form, setForm] = useState({
    platform: "shopee",
    platform_order_id: "",
    courier: "jne",
    courier_custom: "",
  });

  const appendPackingResult = useCallback((payload: {
    product: {
      id: string;
      brand: string;
      model: string;
      size: number | null;
      size_label?: string | null;
      barcode?: string | null;
      quantity?: number | null;
    };
    item: { id: string };
  }, fallbackBarcode: string, label: "ditambahkan" | "discanned") => {
    const { product, item } = payload;
    const sizeLabel = product.size_label ?? product.size ?? "-";
    const barcodeValue = product.barcode ?? fallbackBarcode;
    setItems((prev) => [
      ...prev,
      {
        id: item.id,
        product_id: product.id,
        barcode: barcodeValue,
        brand: product.brand,
        model: product.model,
        size: product.size,
        size_label: product.size_label,
      },
    ]);
    setManualResults((prev) =>
      prev
        .map((p) =>
          p.id === product.id
            ? { ...p, quantity: Math.max(0, Number(product.quantity ?? p.quantity - 1)) }
            : p,
        )
        .filter((p) => p.quantity > 0),
    );
    toast.push(`Item ${label}: ${product.brand} ${product.model} size ${sizeLabel}`, "success");
  }, [toast]);

  const doScanItem = useCallback((code: string) => {
    if (!session || !code.trim()) return;
    setScanBarcode(code.trim());
    startTransition(async () => {
      const result = await scanPackingItem(session.id, code.trim());
      if ("error" in result && typeof result.error === "string") {
        toast.push(result.error, "error");
        return;
      }
      if ("data" in result && result.data) {
        const payload = result.data as {
          product: { id: string; brand: string; model: string; size: number | null; size_label?: string | null; barcode?: string | null; quantity?: number | null };
          item: { id: string };
        };
        appendPackingResult(payload, code.trim(), "discanned");
        setScanBarcode("");
      }
    });
    setShowCamera(false);
  }, [appendPackingResult, session, toast]);

  function handleManualSearch() {
    startTransition(async () => {
      const result = await searchProductsForPacking(manualQuery);
      if ("error" in result && typeof result.error === "string") {
        toast.push(result.error, "error");
        return;
      }
      const data = "data" in result ? (result.data as PackingProduct[]) : [];
      setManualResults(data);
      if (data.length === 0) toast.push("Produk tidak ditemukan atau stok habis", "info");
    });
  }

  function handleManualAdd(product: PackingProduct) {
    if (!session) return;
    startTransition(async () => {
      const result = await addPackingItemManual(session.id, product.id);
      if ("error" in result && typeof result.error === "string") {
        toast.push(result.error, "error");
        return;
      }
      if ("data" in result && result.data) {
        const payload = result.data as {
          product: { id: string; brand: string; model: string; size: number | null; size_label?: string | null; barcode?: string | null; quantity?: number | null };
          item: { id: string };
        };
        appendPackingResult(payload, product.barcode, "ditambahkan");
      }
    });
  }

  // Hardware scanner (USB)
  useHardwareScanner({ onScan: doScanItem, enabled: !!session });

  function handleCreate() {
    setFieldErrors({});
    startTransition(async () => {
      const result = await createPackingSession({
        platform: form.platform,
        platform_order_id: form.platform_order_id || undefined,
        courier: form.courier,
        courier_custom: form.courier === "other" ? form.courier_custom : undefined,
      });
      if ("error" in result && result.error) {
        const errs: Record<string, string> = {};
        for (const [k, v] of Object.entries(result.error)) {
          if (Array.isArray(v) && v[0]) errs[k] = v[0];
        }
        setFieldErrors(errs);
        toast.push("Gagal membuat sesi", "error");
        return;
      }
      if ("data" in result && result.data) {
        const s = result.data as Record<string, unknown>;
        setSession({
          id: s.id as string,
          status: s.status as string,
          platform: s.platform as string,
          courier: s.courier as string,
          platform_order_id: (s.platform_order_id as string) ?? null,
        });
        setManualQuery("");
        setManualResults([]);
        toast.push("Sesi packing dimulai", "success");
      }
    });
  }

  function handleResume(activeSession: UnfinishedPackingSession) {
    setSession({
      id: activeSession.id,
      status: activeSession.status,
      platform: activeSession.platform,
      courier: activeSession.courier,
      platform_order_id: activeSession.platform_order_id,
    });
    setItems(
      activeSession.packing_items.flatMap((packingItem) => {
        const product = packingItem.products;
        if (!product) return [];
        return [
          {
            id: packingItem.id,
            product_id: packingItem.product_id,
            barcode: product.barcode ?? packingItem.barcode_scanned,
            brand: product.brand,
            model: product.model,
            size: product.size,
            size_label: product.size_label,
          },
        ];
      }),
    );
    setManualQuery("");
    setManualResults([]);
    toast.push("Sesi packing dilanjutkan", "info");
  }

  function handleRemoveItem(itemId: string) {
    startTransition(async () => {
      const result = await removePackingItem(itemId);
      if ("error" in result && typeof result.error === "string") {
        toast.push(result.error, "error");
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      toast.push("Item dihapus, stok dikembalikan", "info");
    });
  }

  function handleCancel() {
    if (!session) return;
    if (!confirm("Batalkan seluruh sesi? Semua stok akan dikembalikan.")) return;
    startTransition(async () => {
      const result = await cancelPackingSession(session.id);
      if ("error" in result && typeof result.error === "string") {
        toast.push(result.error, "error");
        return;
      }
      toast.push("Sesi dibatalkan, stok dikembalikan", "info");
      setRecoverableSessions((current) =>
        current.filter((activeSession) => activeSession.id !== session.id),
      );
      resetSession();
    });
  }

  function handleFinalize() {
    if (!session) return;
    startTransition(async () => {
      const result = await finalizePackingSession(session.id);
      if ("error" in result && typeof result.error === "string") {
        toast.push(result.error, "error");
        return;
      }
      toast.push("Scan item selesai. Stok sudah keluar; lanjut ubah status ke Dikirim dari daftar order.", "success");
      // Keep session but update local status? For now reset for simplicity
      resetSession();
    });
  }

  function resetSession() {
    setSession(null);
    setItems([]);
    setScanBarcode("");
    setManualQuery("");
    setManualResults([]);
    setForm({ platform: "shopee", platform_order_id: "", courier: "jne", courier_custom: "" });
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
          <PackageMinus className="text-white/40" size={28} />
          Packing (Outbound)
        </h1>
        <p className="text-white/50">
          Proses pesanan keluar berdasarkan nomor order marketplace dan kurangi stok secara real-time.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Form / Info */}
        <div className="lg:col-span-1 space-y-6">
          {!session ? (
            <div className="space-y-6">
              {recoverableSessions.length > 0 ? (
                <Card className="border-amber-400/20 bg-amber-400/[0.03] p-5 shadow-xl">
                  <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-amber-200/80">
                    <RotateCcw size={16} /> Sesi Belum Selesai
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-white/45">
                    Lanjutkan sesi yang terputus agar stok tidak menggantung, atau batalkan dari dalam sesi untuk mengembalikan seluruh item.
                  </p>
                  <div className="mt-4 space-y-2">
                    {recoverableSessions.map((activeSession) => (
                      <button
                        key={activeSession.id}
                        type="button"
                        onClick={() => handleResume(activeSession)}
                        className="w-full rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 text-left transition-colors hover:bg-white/[0.05]"
                      >
                        <span className="block font-mono text-xs font-semibold text-white/90">
                          {activeSession.platform_order_id ?? "Tanpa nomor order"}
                        </span>
                        <span className="mt-1 block text-[11px] text-white/40">
                          {activeSession.platform.toUpperCase()} • {activeSession.packing_items.length} item sudah masuk • klik untuk lanjut
                        </span>
                      </button>
                    ))}
                  </div>
                </Card>
              ) : null}

              <Card className="border-white/[0.06] bg-[#262626] p-6 shadow-xl animate-in fade-in duration-300">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-white/40 flex items-center gap-2 mb-6">
                <ShoppingCart size={16} /> Buka Sesi Baru
              </h3>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <FieldLabel htmlFor="packing-platform" required>Platform</FieldLabel>
                  <Select id="packing-platform" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
                    {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </Select>
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="packing-courier" required>Kurir</FieldLabel>
                  <Select id="packing-courier" value={form.courier} onChange={(e) => setForm({ ...form, courier: e.target.value })}>
                    {COURIERS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </Select>
                  <FieldError message={fieldErrors.courier} />
                </div>
                {form.courier === "other" && (
                  <div className="space-y-2 animate-in slide-in-from-top-2">
                    <FieldLabel htmlFor="packing-custom-courier" required>Nama Kurir</FieldLabel>
                    <Input id="packing-custom-courier" value={form.courier_custom} onChange={(e) => setForm({ ...form, courier_custom: e.target.value })} placeholder="Masukkan nama kurir" />
                  </div>
                )}
                <div className="space-y-2 pt-2">
                  <FieldLabel htmlFor="packing-order-id" required={form.platform !== "offline"}>
                    Nomor Order / Referensi
                  </FieldLabel>
                  <Input id="packing-order-id" value={form.platform_order_id} onChange={(e) => setForm({ ...form, platform_order_id: e.target.value })} placeholder="Contoh: SHP-260621 atau WA-000123" />
                  <FieldError message={fieldErrors.platform_order_id} />
                  <p className="text-[11px] leading-relaxed text-white/35">
                    Wajib untuk pesanan online supaya gudang bisa mencocokkan sesi packing dengan order atau preorder yang benar.
                  </p>
                </div>
              </div>

              {fieldErrors._form && <Alert tone="error" className="mt-6">{fieldErrors._form}</Alert>}
              
              <Button onClick={handleCreate} disabled={pending} className="w-full mt-8 bg-white text-black font-bold h-12 shadow-lg shadow-white/5">
                {pending ? "Memproses..." : "Mulai Sesi Packing"}
              </Button>
              </Card>
            </div>
          ) : (
            <Card className="border-emerald-500/20 bg-emerald-500/[0.02] p-6 shadow-xl animate-in zoom-in-95 duration-300">
               <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-400/60 flex items-center gap-2">
                    <CheckCircle2 size={16} /> Sesi Aktif
                  </h3>
                  <Badge tone="warning" className="animate-pulse">PACKING</Badge>
               </div>
               
               <div className="space-y-4">
                  <div className="flex justify-between border-b border-white/[0.04] pb-3">
                     <span className="text-xs text-white/40 font-medium">Platform</span>
                     <span className="text-sm font-bold text-white capitalize">{session.platform}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/[0.04] pb-3">
                     <span className="text-xs text-white/40 font-medium">Kurir</span>
                     <span className="text-sm font-bold text-white uppercase">{session.courier}</span>
                  </div>
                  <div className="flex justify-between">
                     <span className="text-xs text-white/40 font-medium">Order / Referensi</span>
                     <span className="text-sm font-mono font-bold text-white">{session.platform_order_id ?? "N/A"}</span>
                  </div>
               </div>

               <Alert tone="info" className="mt-5 text-xs leading-relaxed">
                 Setiap scan langsung mengurangi stok. Jika item dihapus atau sesi dibatalkan saat masih PACKING, stok otomatis dikembalikan.
               </Alert>

               <div className="mt-8 pt-6 border-t border-white/[0.04] space-y-3">
                  <Button variant="secondary" onClick={handleFinalize} disabled={pending || items.length === 0} className="w-full h-11 border-white/5">
                    Selesai Scan Item
                  </Button>
                  <Button variant="ghost" onClick={handleCancel} disabled={pending} className="w-full h-11 text-red-400 hover:bg-red-500/10">
                    <XCircle size={14} className="mr-2" /> Batalkan Sesi
                  </Button>
               </div>
            </Card>
          )}
        </div>

        {/* Right: Scan Area & List */}
        <div className="lg:col-span-2 space-y-6">
          {!session ? (
            <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-dashed border-white/10 bg-white/[0.01] opacity-20">
               <QrCode size={80} strokeWidth={1} />
               <p className="mt-4 text-xl font-medium tracking-tight">Mulai sesi untuk memindai barang.</p>
            </div>
          ) : (
            <>
               <Card className="border-white/[0.06] bg-[#262626] p-6 shadow-xl">
                  <div className="mb-5 flex flex-col gap-1">
                    <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-white/55">
                      <Search size={16} /> Tambah Item Manual
                    </h3>
                    <p className="text-xs leading-relaxed text-white/35">
                      Prioritas gudang: cari produk dari SKU, barcode, brand, model, warna, atau size. Scan tetap tersedia di bawah.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={16} />
                      <Input
                        aria-label="Cari Produk untuk Packing"
                        value={manualQuery}
                        onChange={(e) => setManualQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleManualSearch()}
                        placeholder="Cari SKU, barcode, brand, model, warna, size..."
                        disabled={pending}
                        autoFocus
                        className="pl-10 h-12 rounded-xl bg-white/[0.03] border-white/10"
                      />
                    </div>
                    <Button onClick={handleManualSearch} disabled={pending} className="h-12 bg-white text-black font-bold px-6 rounded-xl">
                       Cari Produk
                    </Button>
                  </div>

                  <div className="mt-5 space-y-2">
                    {manualResults.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.015] px-4 py-5 text-center text-xs text-white/35">
                        Ketik kata kunci lalu cari. Produk yang muncul hanya stok tersedia.
                      </div>
                    ) : (
                      manualResults.map((product) => {
                        const sizeLabel = product.size_label ?? product.size ?? "-";
                        const price = Number(product.price_offline ?? 0) > 0 ? Number(product.price_offline) : Number(product.sell_price);
                        return (
                          <div key={product.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-white/[0.025] p-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-sm font-bold text-white/90">
                                  {product.brand} {product.model}
                                </span>
                                <Badge tone="info" className="h-5 border-none px-2 py-0 text-[10px]">
                                  Size {sizeLabel}
                                </Badge>
                                <Badge tone={product.quantity <= 2 ? "warning" : "success"} className="h-5 border-none px-2 py-0 text-[10px]">
                                  {product.quantity} stok
                                </Badge>
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/35">
                                <span>SKU {product.sku}</span>
                                <span>Barcode {product.barcode}</span>
                                <span>{formatRupiah(price)}</span>
                                {product.color ? <span>{product.color}</span> : null}
                              </div>
                            </div>
                            <Button
                              onClick={() => handleManualAdd(product)}
                              disabled={pending || product.quantity <= 0}
                              className="h-9 shrink-0 rounded-lg bg-emerald-400 px-4 text-xs font-bold text-black hover:bg-emerald-300"
                            >
                              Tambah
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>
               </Card>

               <Card className="border-white/[0.05] bg-[#222] p-5 shadow-xl">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-white/35 flex items-center gap-2 mb-4">
                    <QrCode size={16} /> Scan Barcode Opsional
                  </h3>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <QrCode className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={16} />
                      <Input
                        aria-label="Scan Barcode Opsional"
                        value={scanBarcode}
                        onChange={(e) => setScanBarcode(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && doScanItem(scanBarcode)}
                        placeholder="Scan atau ketik barcode sepatu..."
                        disabled={pending}
                        className="pl-10 h-11 rounded-xl bg-white/[0.03] border-white/10"
                      />
                    </div>
                    <Button onClick={() => doScanItem(scanBarcode)} disabled={pending || !scanBarcode} className="h-11 bg-white text-black font-bold px-5 rounded-xl">
                       Scan
                    </Button>
                    <Button aria-label="Buka Scanner Kamera" variant="secondary" onClick={() => setShowCamera(!showCamera)} className="h-11 w-11 rounded-xl border-white/10">
                       <Camera size={20} />
                    </Button>
                  </div>
                  {showCamera && (
                    <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
                       <CameraScanner onScan={doScanItem} />
                    </div>
                  )}
               </Card>

               <Card className="border-white/[0.06] bg-[#262626] p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-white/40">
                       Item dalam Sesi ({items.length})
                    </h3>
                  </div>

                  {items.length === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center opacity-10">
                       <PackageMinus size={48} />
                       <p className="text-sm font-medium mt-2 text-center">Belum ada item.<br/>Cari produk manual atau scan barcode.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-4 rounded-xl border border-white/[0.03] bg-white/[0.01] hover:bg-white/[0.03] transition-all">
                          <div className="flex flex-col gap-1">
                             <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-white/90">{item.brand} {item.model}</span>
                                <Badge tone="info" className="text-[10px] h-4 py-0 px-1.5 border-none">Size {item.size_label ?? item.size ?? "-"}</Badge>
                             </div>
                             <div className="flex items-center gap-2 text-[10px] text-white/30 font-mono">
                                <QrCode size={10} />
                                {item.barcode}
                             </div>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => handleRemoveItem(item.id)} disabled={pending} className="h-8 w-8 p-0 rounded-full text-white/20 hover:text-red-400 hover:bg-red-500/10">
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
               </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
