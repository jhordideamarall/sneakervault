"use client";

import { useState, useTransition, useCallback } from "react";
import {
  createPackingSession,
  scanPackingItem,
  removePackingItem,
  cancelPackingSession,
  finalizePackingSession,
} from "@/lib/actions/outbound";
import { updateSessionStatus } from "@/lib/actions/status";
import { PLATFORMS, COURIERS } from "@sneakervault/shared";
import {
  Button, Card, CardHeader, CardTitle, Input, Select, FieldLabel, FieldError, Alert, Badge,
} from "@sneakervault/ui";
import { useToast } from "@/components/toast";
import { useHardwareScanner } from "@sneakervault/barcode";
import { CameraScanner } from "@/components/scanner/camera-scanner";

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
  size: number;
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
          product: { id: string; brand: string; model: string; size: number };
          item: { id: string };
        };
        setItems((prev) => [
          ...prev,
          {
            id: item.id,
            product_id: product.id,
            barcode: code.trim(),
            brand: product.brand,
            model: product.model,
            size: product.size,
          },
        ]);
        setScanBarcode("");
        toast.push(`+ ${product.brand} ${product.model} size ${product.size}`, "success");
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
      toast.push("Packing selesai, siap kirim", "success");
    });
  }

  function handleShip() {
    if (!session) return;
    startTransition(async () => {
      const result = await updateSessionStatus({ session_id: session.id, status: "shipped" });
      if ("error" in result && result.error) {
        const msg = (result.error as { _form?: string[] })._form?.[0] ?? "Gagal update status";
        toast.push(msg, "error");
        return;
      }
      toast.push("Status: Dikirim", "success");
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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1a1a2e]">📤 Packing Session</h1>

      {!session ? (
        <Card>
          <CardHeader>
            <CardTitle>Buat Sesi Packing Baru</CardTitle>
          </CardHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="platform" required>Platform</FieldLabel>
              <Select id="platform" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
                {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="courier" required>Kurir</FieldLabel>
              <Select id="courier" value={form.courier} onChange={(e) => setForm({ ...form, courier: e.target.value })}>
                {COURIERS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
              <FieldError message={fieldErrors.courier} />
            </div>
            {form.courier === "other" && (
              <div className="sm:col-span-2">
                <FieldLabel htmlFor="courier_custom" required>Nama Kurir</FieldLabel>
                <Input id="courier_custom" value={form.courier_custom} onChange={(e) => setForm({ ...form, courier_custom: e.target.value })} />
              </div>
            )}
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="order_id">Order ID / Nomor Order</FieldLabel>
              <Input id="order_id" value={form.platform_order_id} onChange={(e) => setForm({ ...form, platform_order_id: e.target.value })} placeholder="opsional jika offline" />
            </div>
          </div>
          {fieldErrors._form && <Alert tone="error" className="mt-4">{fieldErrors._form}</Alert>}
          <div className="mt-6">
            <Button onClick={handleCreate} disabled={pending}>
              {pending ? "Memproses..." : "Mulai Packing"}
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {/* Session info */}
          <Card>
            <CardHeader>
              <CardTitle>Sesi Aktif</CardTitle>
              <Badge tone="warning">PACKING</Badge>
            </CardHeader>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><span className="text-[#6b7280]">Platform:</span> <span className="font-medium capitalize">{session.platform}</span></div>
              <div><span className="text-[#6b7280]">Kurir:</span> <span className="font-medium uppercase">{session.courier}</span></div>
              <div><span className="text-[#6b7280]">Order ID:</span> <span className="font-mono">{session.platform_order_id ?? "—"}</span></div>
            </div>
          </Card>

          {/* Scan area */}
          <Card>
            <CardHeader>
              <CardTitle>Scan Item</CardTitle>
            </CardHeader>
            <div className="flex gap-2">
              <Input
                value={scanBarcode}
                onChange={(e) => setScanBarcode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doScanItem(scanBarcode)}
                placeholder="Scan barcode item..."
                disabled={pending}
                autoFocus
              />
              <Button onClick={() => doScanItem(scanBarcode)} disabled={pending}>Tambah</Button>
              <Button variant="ghost" onClick={() => setShowCamera(!showCamera)}>📷</Button>
            </div>
            {showCamera && (
              <CameraScanner onScan={doScanItem} />
            )}
          </Card>

          {/* Items list */}
          <Card>
            <CardHeader>
              <CardTitle>Item ({items.length})</CardTitle>
            </CardHeader>
            {items.length === 0 ? (
              <p className="text-sm text-[#6b7280]">Belum ada item. Scan barcode untuk menambah.</p>
            ) : (
              <ul className="divide-y divide-[#e5e7eb]">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <span className="font-medium">{item.brand} {item.model}</span>
                      <span className="ml-2 text-[#6b7280]">size {item.size}</span>
                      <span className="ml-2 font-mono text-xs text-[#6b7280]">{item.barcode}</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveItem(item.id)} disabled={pending}>
                      Hapus
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="danger" onClick={handleCancel} disabled={pending}>
              Batalkan Sesi
            </Button>
            <Button variant="secondary" onClick={handleFinalize} disabled={pending || items.length === 0}>
              Selesai Packing
            </Button>
            <Button variant="success" onClick={handleShip} disabled={pending || items.length === 0}>
              Tandai Dikirim
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
