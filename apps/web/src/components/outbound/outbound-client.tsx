"use client";

import { useState, useTransition, useCallback } from "react";
import {
  createPackingSession,
  scanPackingItem,
  removePackingItem,
  cancelPackingSession,
  finalizePackingSession,
} from "@/lib/actions/outbound";
import { PLATFORMS, COURIERS } from "@sneakervault/shared";
import {
  Button, Card, Input, Select, FieldLabel, FieldError, Alert, Badge,
} from "@sneakervault/ui";
import { useToast } from "@/components/toast";
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
  Search
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

export function OutboundClient() {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [session, setSession] = useState<SessionRow | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [scanBarcode, setScanBarcode] = useState("");
  const [showCamera, setShowCamera] = useState(false);

  const [form, setForm] = useState({
    platform: "shopee",
    platform_order_id: "",
    courier: "jne",
    courier_custom: "",
  });

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
        const { product, item } = result.data as {
          product: { id: string; brand: string; model: string; size: number | null; size_label?: string | null };
          item: { id: string };
        };
        const sizeLabel = product.size_label ?? product.size ?? "-";
        setItems((prev) => [
          ...prev,
          {
            id: item.id,
            product_id: product.id,
            barcode: code.trim(),
            brand: product.brand,
            model: product.model,
            size: product.size,
            size_label: product.size_label,
          },
        ]);
        setScanBarcode("");
        toast.push(`Stok dikurangi: ${product.brand} ${product.model} size ${sizeLabel}`, "success");
      }
    });
    setShowCamera(false);
  }, [session, toast]);

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
        toast.push("Sesi packing dimulai", "success");
      }
    });
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
            <Card className="border-white/[0.06] bg-[#262626] p-6 shadow-xl animate-in fade-in duration-300">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-white/40 flex items-center gap-2 mb-6">
                <ShoppingCart size={16} /> Buka Sesi Baru
              </h3>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <FieldLabel required>Platform</FieldLabel>
                  <Select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
                    {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </Select>
                </div>
                <div className="space-y-2">
                  <FieldLabel required>Kurir</FieldLabel>
                  <Select value={form.courier} onChange={(e) => setForm({ ...form, courier: e.target.value })}>
                    {COURIERS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </Select>
                  <FieldError message={fieldErrors.courier} />
                </div>
                {form.courier === "other" && (
                  <div className="space-y-2 animate-in slide-in-from-top-2">
                    <FieldLabel required>Nama Kurir</FieldLabel>
                    <Input value={form.courier_custom} onChange={(e) => setForm({ ...form, courier_custom: e.target.value })} placeholder="Masukkan nama kurir" />
                  </div>
                )}
                <div className="space-y-2 pt-2">
                  <FieldLabel required={form.platform !== "offline"}>
                    Nomor Order Marketplace
                  </FieldLabel>
                  <Input value={form.platform_order_id} onChange={(e) => setForm({ ...form, platform_order_id: e.target.value })} placeholder="Contoh: 260621N06KGD52" />
                  <FieldError message={fieldErrors.platform_order_id} />
                  <p className="text-[11px] leading-relaxed text-white/35">
                    Wajib untuk Shopee/TikTok/Tokopedia supaya gudang bisa cocokan label packing dengan order marketplace.
                  </p>
                </div>
              </div>

              {fieldErrors._form && <Alert tone="error" className="mt-6">{fieldErrors._form}</Alert>}
              
              <Button onClick={handleCreate} disabled={pending} className="w-full mt-8 bg-white text-black font-bold h-12 shadow-lg shadow-white/5">
                {pending ? "Memproses..." : "Mulai Sesi Packing"}
              </Button>
            </Card>
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
                     <span className="text-xs text-white/40 font-medium">Order Marketplace</span>
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
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-white/40 flex items-center gap-2 mb-6">
                    <QrCode size={16} /> Scan Item Produk
                  </h3>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={16} />
                      <Input
                        value={scanBarcode}
                        onChange={(e) => setScanBarcode(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && doScanItem(scanBarcode)}
                        placeholder="Scan barcode sepatu..."
                        disabled={pending}
                        autoFocus
                        className="pl-10 h-12 rounded-xl bg-white/[0.03] border-white/10"
                      />
                    </div>
                    <Button onClick={() => doScanItem(scanBarcode)} disabled={pending || !scanBarcode} className="h-12 bg-white text-black font-bold px-6 rounded-xl">
                       Scan
                    </Button>
                    <Button variant="secondary" onClick={() => setShowCamera(!showCamera)} className="h-12 w-12 rounded-xl border-white/10">
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
                       <p className="text-sm font-medium mt-2 text-center">Belum ada item.<br/>Gunakan scanner untuk menambah.</p>
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
