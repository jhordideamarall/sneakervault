"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  Input,
  NumberInput,
  FieldLabel,
  FieldError,
  Alert,
} from "@sneakervault/ui";
import { updateProduct } from "@/lib/actions/products";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";
import { createClient } from "@sneakervault/supabase/client";
import { ImageOff, Lock, Trash2, Upload } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: {
    id: string;
    brand: string;
    model: string;
    sku: string;
    size: number;
    size_label: string;
    barcode: string;
    color: string | null;
    hpp: number;
    sell_price: number;
    price_offline: number;
    price_website: number | null;
    price_shopee: number | null;
    price_tiktok: number | null;
    price_tokopedia: number | null;
    image_url: string | null;
  };
  canEditPrice: boolean;
  canEditIdentity: boolean;
  canEditImage: boolean;
};

export function EditProductModal({
  open,
  onOpenChange,
  product,
  canEditPrice,
  canEditIdentity,
  canEditImage,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState({
    brand: product.brand,
    model: product.model,
    sku: product.sku,
    size_label: product.size_label,
    barcode: product.barcode,
    hpp: product.hpp,
    sell_price: product.sell_price,
    price_offline: product.price_offline,
    price_website: product.price_website ?? product.sell_price,
    price_shopee: product.price_shopee ?? product.sell_price,
    price_tiktok: product.price_tiktok ?? product.sell_price,
    price_tokopedia: product.price_tokopedia ?? product.sell_price,
    color: product.color ?? "",
    image_url: product.image_url ?? "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  async function handlePhotoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.push("File harus berupa gambar", "error");
      return;
    }
    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage
      .from("product-photos")
      .upload(path, file, { upsert: false, cacheControl: "3600" });
    if (error) {
      toast.push(`Gagal upload foto: ${error.message}`, "error");
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("product-photos").getPublicUrl(path);
    setForm((prev) => ({ ...prev, image_url: data.publicUrl }));
    setUploading(false);
  }

  function handleSave() {
    setFieldErrors({});
    startTransition(async () => {
      const patch: Record<string, unknown> = { id: product.id };
      if (canEditIdentity) {
        patch.brand = form.brand;
        patch.model = form.model;
        patch.sku = form.sku;
        patch.size_label = form.size_label;
        patch.color = form.color;
      }
      if (canEditPrice) {
        patch.hpp = form.hpp;
        patch.sell_price = form.sell_price;
        patch.price_offline = form.price_offline;
        patch.price_website = form.price_website;
        patch.price_shopee = form.price_shopee;
        patch.price_tiktok = form.price_tiktok;
        patch.price_tokopedia = form.price_tokopedia;
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
            Detail bersama akan disinkronkan ke semua size dalam SKU ini. Size dan harga hanya untuk variant terpilih.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <Alert tone="info">
            Barcode berasal dari Accurate dan terkunci setelah produk dibuat.
          </Alert>
          <div>
            <FieldLabel htmlFor="barcode">Barcode</FieldLabel>
            <div className="relative">
              <Input
                id="barcode"
                value={form.barcode}
                readOnly
                aria-readonly="true"
                className="pr-9 font-mono text-white/55"
              />
              <Lock
                size={14}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/30"
              />
            </div>
          </div>
          {canEditIdentity ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
                Detail bersama semua size
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="brand">Brand</FieldLabel>
                <Input
                  id="brand"
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                />
                <FieldError message={fieldErrors.brand} />
              </div>
              <div>
                <FieldLabel htmlFor="model">Model</FieldLabel>
                <Input
                  id="model"
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                />
                <FieldError message={fieldErrors.model} />
              </div>
              <div>
                <FieldLabel htmlFor="sku">SKU Colorway</FieldLabel>
                <Input
                  id="sku"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                />
                <FieldError message={fieldErrors.sku} />
              </div>
              <div>
                <FieldLabel htmlFor="size_label">Size</FieldLabel>
                <Input
                  id="size_label"
                  value={form.size_label}
                  onChange={(e) => setForm({ ...form, size_label: e.target.value })}
                  placeholder="42 atau 42 2/3"
                />
                <FieldError message={fieldErrors.size_label} />
              </div>
              <div>
                <FieldLabel htmlFor="color">Warna</FieldLabel>
                <Input
                  id="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  placeholder="Contoh: Cloud White"
                />
                <FieldError message={fieldErrors.color} />
              </div>
              </div>
              <p className="text-[11px] text-white/40">
                Brand, model, SKU, warna, dan foto mengikuti seluruh variant. Size hanya berubah pada baris ini.
              </p>
            </div>
          ) : null}

          {canEditImage && (
            <div>
              <FieldLabel>Foto Produk</FieldLabel>
              <div className="mt-2 flex items-center gap-3">
                <div className="flex h-24 w-24 overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02]">
                  {form.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={form.image_url}
                      alt="Preview"
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-white/25">
                      <ImageOff size={22} />
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <Upload size={14} className="mr-1.5" />
                    {uploading ? "Upload..." : form.image_url ? "Ganti Foto" : "Upload Foto"}
                  </Button>
                  {form.image_url && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setForm({ ...form, image_url: "" })}
                    >
                      <Trash2 size={14} className="mr-1.5" />
                      Hapus Foto
                    </Button>
                  )}
                </div>
              </div>
              <FieldError message={fieldErrors.image_url} />
            </div>
          )}

          {canEditPrice ? (
            <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <FieldLabel htmlFor="hpp">HPP / Modal (Rp)</FieldLabel>
                <NumberInput
                  id="hpp"
                  min={0}
                  value={form.hpp}
                  onValueChange={(value) =>
                    setForm({ ...form, hpp: value })
                  }
                />
                <p className="mt-1 text-[11px] text-white/40">
                  Disinkronkan ke semua size dalam SKU
                </p>
                <FieldError message={fieldErrors.hpp} />
              </div>
              <div>
                <FieldLabel htmlFor="sell_price">Harga Online (Rp)</FieldLabel>
                <NumberInput
                  id="sell_price"
                  min={0}
                  value={form.sell_price}
                  onValueChange={(value) =>
                    setForm({ ...form, sell_price: value })
                  }
                />
                <p className="mt-1 text-[11px] text-white/40">
                  Khusus size {product.size_label}
                </p>
                <FieldError message={fieldErrors.sell_price} />
              </div>
              <div>
                <FieldLabel htmlFor="price_offline">Harga Offline (Rp)</FieldLabel>
                <NumberInput
                  id="price_offline"
                  min={0}
                  value={form.price_offline}
                  onValueChange={(value) =>
                    setForm({ ...form, price_offline: value })
                  }
                />
                <p className="mt-1 text-[11px] text-white/40">
                  Khusus size {product.size_label}
                </p>
                <FieldError message={fieldErrors.price_offline} />
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-white/55">
                Harga per channel
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="price_website">Website (Rp)</FieldLabel>
                  <NumberInput
                    id="price_website"
                    min={0}
                    value={form.price_website}
                    onValueChange={(value) =>
                      setForm({ ...form, price_website: value })
                    }
                  />
                  <FieldError message={fieldErrors.price_website} />
                </div>
                <div>
                  <FieldLabel htmlFor="price_shopee">Shopee (Rp)</FieldLabel>
                  <NumberInput
                    id="price_shopee"
                    min={0}
                    value={form.price_shopee}
                    onValueChange={(value) =>
                      setForm({ ...form, price_shopee: value })
                    }
                  />
                  <FieldError message={fieldErrors.price_shopee} />
                </div>
                <div>
                  <FieldLabel htmlFor="price_tiktok">TikTok (Rp)</FieldLabel>
                  <NumberInput
                    id="price_tiktok"
                    min={0}
                    value={form.price_tiktok}
                    onValueChange={(value) =>
                      setForm({ ...form, price_tiktok: value })
                    }
                  />
                  <FieldError message={fieldErrors.price_tiktok} />
                </div>
                <div>
                  <FieldLabel htmlFor="price_tokopedia">Tokopedia (Rp)</FieldLabel>
                  <NumberInput
                    id="price_tokopedia"
                    min={0}
                    value={form.price_tokopedia}
                    onValueChange={(value) =>
                      setForm({ ...form, price_tokopedia: value })
                    }
                  />
                  <FieldError message={fieldErrors.price_tokopedia} />
                </div>
              </div>
            </div>
            </div>
          ) : (
            <Alert tone="info">
              Hanya owner / finance yang bisa mengubah HPP dan harga jual.
            </Alert>
          )}

          {fieldErrors._form && <Alert tone="error">{fieldErrors._form}</Alert>}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Batal
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              pending ||
              (canEditIdentity &&
                (!form.brand.trim() ||
                  !form.model.trim() ||
                  !form.sku.trim() ||
                  !form.size_label.trim()))
            }
          >
            {pending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
