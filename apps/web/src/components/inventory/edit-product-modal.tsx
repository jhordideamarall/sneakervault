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
import { ImageOff, Trash2, Upload } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: {
    id: string;
    brand: string;
    model: string;
    size: number;
    size_label: string;
    color: string | null;
    hpp: number;
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState({
    hpp: product.hpp,
    sell_price: product.sell_price,
    price_offline: product.price_offline,
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
      const patch: Record<string, unknown> = { id: product.id, color: form.color };
      if (canEditPrice) {
        patch.hpp = form.hpp;
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
            {product.brand} {product.model} — Size {product.size_label}
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
                  Modal per SKU
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
                  Shopee, TikTok, marketplace
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
                  WA, transfer langsung, website toko
                </p>
                <FieldError message={fieldErrors.price_offline} />
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
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
