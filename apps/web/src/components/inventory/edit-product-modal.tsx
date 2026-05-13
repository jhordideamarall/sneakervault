"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  Input,
  FieldLabel,
  FieldError,
  Alert,
} from "@sneakervault/ui";
import { updateProduct } from "@/lib/actions/products";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: {
    id: string;
    brand: string;
    model: string;
    size: number;
    color: string | null;
    sell_price: number;
    price_offline: number;
    image_url: string | null;
  };
  canEditPrice: boolean;
  canEditImage: boolean;
};

export function EditProductModal({
  open,
  onOpenChange,
  product,
  canEditPrice,
  canEditImage,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    sell_price: product.sell_price,
    price_offline: product.price_offline,
    color: product.color ?? "",
    image_url: product.image_url ?? "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleSave() {
    setFieldErrors({});
    startTransition(async () => {
      const patch: Record<string, unknown> = { id: product.id, color: form.color };
      if (canEditPrice) {
        patch.sell_price = form.sell_price;
        patch.price_offline = form.price_offline;
      }
      if (canEditImage) {
        patch.image_url = form.image_url.trim() || null;
      }

      const result = await updateProduct(patch);
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
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Produk</DialogTitle>
          <DialogDescription>
            {product.brand} {product.model} — Size {product.size}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <FieldLabel htmlFor="color">Warna</FieldLabel>
            <Input
              id="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              placeholder="Contoh: Cloud White"
            />
          </div>

          {canEditImage && (
            <div>
              <FieldLabel htmlFor="image_url">URL Foto Produk</FieldLabel>
              <Input
                id="image_url"
                type="url"
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                placeholder="https://... (copy dari Google atau galeri)"
              />
              <p className="mt-1 text-xs text-white/40">
                Bisa paste link gambar dari Google atau dari foto internal. Kosongkan untuk menghapus.
              </p>
              {form.image_url && (
                <div className="mt-3 h-24 w-24 overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={form.image_url}
                    alt="Preview"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              )}
              <FieldError message={fieldErrors.image_url} />
            </div>
          )}

          {canEditPrice ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="sell_price">Harga Online (Rp)</FieldLabel>
                <Input
                  id="sell_price"
                  type="number"
                  min={0}
                  value={form.sell_price}
                  onChange={(e) =>
                    setForm({ ...form, sell_price: Number(e.target.value) })
                  }
                />
                <p className="mt-1 text-[11px] text-white/40">
                  Shopee, TikTok, marketplace
                </p>
                <FieldError message={fieldErrors.sell_price} />
              </div>
              <div>
                <FieldLabel htmlFor="price_offline">Harga Offline (Rp)</FieldLabel>
                <Input
                  id="price_offline"
                  type="number"
                  min={0}
                  value={form.price_offline}
                  onChange={(e) =>
                    setForm({ ...form, price_offline: Number(e.target.value) })
                  }
                />
                <p className="mt-1 text-[11px] text-white/40">
                  WA, transfer langsung, website toko
                </p>
                <FieldError message={fieldErrors.price_offline} />
              </div>
            </div>
          ) : (
            <Alert tone="info">
              Hanya owner / finance yang bisa mengubah harga jual.
            </Alert>
          )}

          {fieldErrors._form && <Alert tone="error">{fieldErrors._form}</Alert>}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Batal
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
