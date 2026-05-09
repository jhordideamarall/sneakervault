"use client";

import { useState, useTransition, useEffect } from "react";
import { initiateReturn, verifyReturn, processReturn } from "@/lib/actions/returns";
import { Badge, Button, Card, Input, Select, FieldLabel, FieldError, Alert } from "@sneakervault/ui";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";

type ReturnRow = Record<string, unknown> & {
  id: string;
  type: "exchange_size" | "refund";
  reason: string;
  status: "pending" | "verified" | "processed" | "cancelled";
  original_size: number;
  new_size: number | null;
  created_at: string;
  verified_at: string | null;
  processed_at: string | null;
  original?: { brand: string; model: string; size: number } | null;
  new?: { brand: string; model: string; size: number } | null;
  packing_items?: {
    id: string;
    packing_sessions?: { platform_order_id: string | null; platform: string } | null;
  } | null;
};

type ReturnableItem = Record<string, unknown> & {
  id: string;
  barcode_scanned: string;
  products?: { id: string; brand: string; model: string; size: number; sku: string } | null;
  packing_sessions?: { platform_order_id: string | null; platform: string } | null;
};

const statusTones: Record<string, "warning" | "info" | "success" | "neutral"> = {
  pending: "warning",
  verified: "info",
  processed: "success",
  cancelled: "neutral",
};

export function ReturnsClient({
  returns,
  returnableItems,
  roles,
}: {
  returns: ReturnRow[];
  returnableItems: ReturnableItem[];
  roles: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"list" | "initiate">("list");

  const canInitiate = roles.includes("owner") || roles.includes("admin_online");
  const canVerify = roles.includes("owner") || roles.includes("admin_gudang");
  const canProcess = canVerify;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1a1a2e]">🔄 Retur</h1>
        <div className="flex gap-2">
          <Button variant={tab === "list" ? "primary" : "secondary"} size="sm" onClick={() => setTab("list")}>
            Daftar Retur
          </Button>
          {canInitiate && (
            <Button variant={tab === "initiate" ? "primary" : "secondary"} size="sm" onClick={() => setTab("initiate")}>
              + Buat Retur
            </Button>
          )}
        </div>
      </div>

      {tab === "list" ? (
        <ReturnsList
          returns={returns}
          canVerify={canVerify}
          canProcess={canProcess}
          pending={pending}
          onVerify={(id) => {
            startTransition(async () => {
              const result = await verifyReturn(id);
              if ("error" in result && typeof result.error === "string") {
                toast.push(result.error, "error");
                return;
              }
              toast.push("Return diverifikasi", "success");
              router.refresh();
            });
          }}
          onProcess={(id, type, newProductId) => {
            startTransition(async () => {
              const result = await processReturn({
                return_id: id,
                new_product_id: type === "exchange_size" ? newProductId : undefined,
              });
              if ("error" in result && result.error) {
                const msg = (result.error as { _form?: string[] })._form?.[0] ?? "Gagal memproses";
                toast.push(msg, "error");
                return;
              }
              toast.push("Return diproses, stok disesuaikan", "success");
              router.refresh();
            });
          }}
        />
      ) : (
        <InitiateReturnForm
          items={returnableItems}
          pending={pending}
          onSubmit={(itemId, type, reason) => {
            startTransition(async () => {
              const result = await initiateReturn({ packing_item_id: itemId, type, reason });
              if ("error" in result && result.error) {
                const msg = (result.error as { _form?: string[] })._form?.[0] ?? "Gagal membuat retur";
                toast.push(msg, "error");
                return;
              }
              toast.push("Retur dibuat, menunggu verifikasi gudang", "success");
              router.refresh();
              setTab("list");
            });
          }}
        />
      )}
    </div>
  );
}

function ReturnsList({
  returns,
  canVerify,
  canProcess,
  pending,
  onVerify,
  onProcess,
}: {
  returns: ReturnRow[];
  canVerify: boolean;
  canProcess: boolean;
  pending: boolean;
  onVerify: (id: string) => void;
  onProcess: (id: string, type: string, newProductId?: string) => void;
}) {
  const [processingId, setProcessingId] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-[#e5e7eb] bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Tanggal</th>
            <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Produk</th>
            <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Tipe</th>
            <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Alasan</th>
            <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Status</th>
            <th className="px-4 py-3 text-right font-medium text-[#6b7280]">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e5e7eb]">
          {returns.map((r) => (
            <tr key={r.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-[#6b7280]">
                {new Date(r.created_at).toLocaleDateString("id-ID")}
              </td>
              <td className="px-4 py-3">
                {r.original?.brand} {r.original?.model} size {r.original_size}
                {r.new && <span className="ml-1 text-[#6b7280]">→ size {r.new.size}</span>}
              </td>
              <td className="px-4 py-3">
                {r.type === "exchange_size" ? "Tukar Size" : "Refund"}
              </td>
              <td className="px-4 py-3 max-w-xs truncate" title={r.reason}>{r.reason}</td>
              <td className="px-4 py-3">
                <Badge tone={statusTones[r.status] ?? "default"}>{r.status}</Badge>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-2">
                  {r.status === "pending" && canVerify && (
                    <Button size="sm" variant="secondary" onClick={() => onVerify(r.id)} disabled={pending}>
                      Verifikasi
                    </Button>
                  )}
                  {r.status === "verified" && canProcess && (
                    r.type === "refund" ? (
                      <Button size="sm" variant="success" onClick={() => onProcess(r.id, "refund")} disabled={pending}>
                        Refund & Stok Masuk
                      </Button>
                    ) : (
                      <Button size="sm" variant="success" onClick={() => setProcessingId(r.id)} disabled={pending}>
                        Pilih Size Pengganti
                      </Button>
                    )
                  )}
                </div>
                {processingId === r.id && r.type === "exchange_size" && (
                  <ExchangeModal
                    returnRow={r}
                    onCancel={() => setProcessingId(null)}
                    onConfirm={(newProductId) => {
                      onProcess(r.id, "exchange_size", newProductId);
                      setProcessingId(null);
                    }}
                    pending={pending}
                  />
                )}
              </td>
            </tr>
          ))}
          {returns.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-[#6b7280]">
                Belum ada retur.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ExchangeModal({
  returnRow,
  onCancel,
  onConfirm,
  pending,
}: {
  returnRow: ReturnRow;
  onCancel: () => void;
  onConfirm: (newProductId: string) => void;
  pending: boolean;
}) {
  const [products, setProducts] = useState<{ id: string; size: number; quantity: number }[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);

  // Fetch products of same model on mount
  useEffect(() => {
    (async () => {
      const res = await fetch(
        `/api/products-by-model?brand=${encodeURIComponent(returnRow.original?.brand ?? "")}&model=${encodeURIComponent(returnRow.original?.model ?? "")}`
      );
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
      }
      setLoading(false);
    })();
  }, [returnRow]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md">
        <h2 className="mb-4 text-lg font-semibold">Pilih Size Pengganti</h2>
        <p className="mb-4 text-sm text-[#6b7280]">
          {returnRow.original?.brand} {returnRow.original?.model}
        </p>

        {loading ? (
          <p className="text-sm text-[#6b7280]">Memuat...</p>
        ) : products.length === 0 ? (
          <Alert tone="warning">Tidak ada size lain untuk model ini.</Alert>
        ) : (
          <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">-- Pilih size --</option>
            {products.map((p) => (
              <option key={p.id} value={p.id} disabled={p.quantity === 0}>
                Size {p.size} — stok {p.quantity}
              </option>
            ))}
          </Select>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel}>Batal</Button>
          <Button onClick={() => onConfirm(selected)} disabled={!selected || pending}>
            Konfirmasi
          </Button>
        </div>
      </Card>
    </div>
  );
}

function InitiateReturnForm({
  items,
  pending,
  onSubmit,
}: {
  items: ReturnableItem[];
  pending: boolean;
  onSubmit: (itemId: string, type: "exchange_size" | "refund", reason: string) => void;
}) {
  const [itemId, setItemId] = useState("");
  const [type, setType] = useState<"exchange_size" | "refund">("exchange_size");
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function submit() {
    const errs: Record<string, string> = {};
    if (!itemId) errs.item = "Pilih item";
    if (!reason.trim()) errs.reason = "Alasan wajib diisi";
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSubmit(itemId, type, reason.trim());
  }

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold">Buat Retur Baru</h2>

      <div className="space-y-4">
        <div>
          <FieldLabel required>Item</FieldLabel>
          <Select value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">-- Pilih item dari order yang sudah dikirim --</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.packing_sessions?.platform_order_id ?? "(no order id)"} — {i.products?.brand} {i.products?.model} size {i.products?.size}
              </option>
            ))}
          </Select>
          <FieldError message={fieldErrors.item} />
        </div>
        <div>
          <FieldLabel required>Tipe Retur</FieldLabel>
          <Select value={type} onChange={(e) => setType(e.target.value as "exchange_size" | "refund")}>
            <option value="exchange_size">Tukar Size</option>
            <option value="refund">Refund</option>
          </Select>
        </div>
        <div>
          <FieldLabel required>Alasan</FieldLabel>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Contoh: size kekecilan" />
          <FieldError message={fieldErrors.reason} />
        </div>
      </div>

      <div className="mt-6">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Memproses..." : "Kirim Permintaan Retur"}
        </Button>
      </div>
    </Card>
  );
}
