"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import {
  Alert,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  FieldError,
  FieldLabel,
  Input,
  NumberInput,
} from "@sneakervault/ui";
import {
  addProductVariantToSku,
  updateProduct,
} from "@/lib/actions/products";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";
import { createClient } from "@sneakervault/supabase/client";
import {
  ChevronDown,
  ImageOff,
  Lock,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";

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

type ChannelPriceKey =
  | "price_website"
  | "price_shopee"
  | "price_tiktok"
  | "price_tokopedia";

function collectErrors(error: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  for (const [key, value] of Object.entries(error)) {
    if (Array.isArray(value) && value[0]) errors[key] = String(value[0]);
  }
  return errors;
}

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
  const [mode, setMode] = useState<"edit" | "add-size">("edit");
  const [showEditChannels, setShowEditChannels] = useState(false);
  const [showAddChannels, setShowAddChannels] = useState(false);
  const [addChannelsCustom, setAddChannelsCustom] = useState(false);
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
  const [addForm, setAddForm] = useState({
    size_label: "",
    barcode: "",
    sell_price: 0,
    price_offline: 0,
    price_website: 0,
    price_shopee: 0,
    price_tiktok: 0,
    price_tokopedia: 0,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  function changeMode(nextMode: "edit" | "add-size") {
    setMode(nextMode);
    setFieldErrors({});
    setAddErrors({});
  }

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
    setForm((current) => ({ ...current, image_url: data.publicUrl }));
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
      if (canEditImage) patch.image_url = form.image_url.trim() || null;

      const result = await updateProduct(patch);
      if ("error" in result && result.error) {
        setFieldErrors(collectErrors(result.error));
        toast.push("Gagal menyimpan", "error");
        return;
      }
      toast.push("Produk disimpan", "success");
      onOpenChange(false);
      router.refresh();
    });
  }

  function updateAddChannel(field: ChannelPriceKey, value: number) {
    setAddForm((current) => ({
      ...current,
      price_website: addChannelsCustom
        ? current.price_website
        : current.sell_price,
      price_shopee: addChannelsCustom
        ? current.price_shopee
        : current.sell_price,
      price_tiktok: addChannelsCustom
        ? current.price_tiktok
        : current.sell_price,
      price_tokopedia: addChannelsCustom
        ? current.price_tokopedia
        : current.sell_price,
      [field]: value,
    }));
    setAddChannelsCustom(true);
  }

  function handleAddSize() {
    setAddErrors({});
    startTransition(async () => {
      const channelPrice = (field: ChannelPriceKey) =>
        addChannelsCustom ? addForm[field] : addForm.sell_price;
      const result = await addProductVariantToSku({
        source_product_id: product.id,
        variant: {
          size_label: addForm.size_label,
          barcode: addForm.barcode,
          sell_price: canEditPrice ? addForm.sell_price : 0,
          price_offline: canEditPrice ? addForm.price_offline : 0,
          price_website: canEditPrice ? channelPrice("price_website") : 0,
          price_shopee: canEditPrice ? channelPrice("price_shopee") : 0,
          price_tiktok: canEditPrice ? channelPrice("price_tiktok") : 0,
          price_tokopedia: canEditPrice ? channelPrice("price_tokopedia") : 0,
        },
      });
      if ("error" in result && result.error) {
        setAddErrors(collectErrors(result.error));
        toast.push("Size baru belum tersimpan", "error");
        return;
      }
      toast.push(`Size ${addForm.size_label} berhasil ditambahkan`, "success");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kelola Produk</DialogTitle>
          <DialogDescription>
            {product.brand} {product.model} · SKU {product.sku}
          </DialogDescription>
        </DialogHeader>

        <div
          className="grid grid-cols-2 rounded-xl border border-white/[0.07] bg-white/[0.025] p-1"
          role="tablist"
          aria-label="Pilihan pengelolaan produk"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "edit"}
            onClick={() => changeMode("edit")}
            className="rounded-lg px-3 py-2 text-sm font-medium transition hover:text-white/70"
            style={{
              backgroundColor:
                mode === "edit" ? "rgba(255, 255, 255, 0.11)" : "transparent",
              color:
                mode === "edit" ? "rgb(255, 255, 255)" : "rgba(255, 255, 255, 0.45)",
            }}
          >
            Edit size {product.size_label}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "add-size"}
            onClick={() => changeMode("add-size")}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition hover:text-white/70"
            style={{
              backgroundColor:
                mode === "add-size" ? "rgba(34, 211, 238, 0.14)" : "transparent",
              color:
                mode === "add-size" ? "rgb(165, 243, 252)" : "rgba(255, 255, 255, 0.45)",
            }}
          >
            <Plus size={14} />
            Tambah size
          </button>
        </div>

        {mode === "edit" ? (
          <>
            <div className="space-y-4 pt-1">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="barcode">Barcode Accurate</FieldLabel>
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
                  <p className="mt-1 text-[11px] text-white/35">
                    Terkunci setelah produk dibuat.
                  </p>
                </div>
                {canEditIdentity && (
                  <div>
                    <FieldLabel htmlFor="size_label">Size</FieldLabel>
                    <Input
                      id="size_label"
                      value={form.size_label}
                      onChange={(event) =>
                        setForm({ ...form, size_label: event.target.value })
                      }
                      placeholder="42 atau 42 2/3"
                    />
                    <FieldError message={fieldErrors.size_label} />
                  </div>
                )}
              </div>

              {canEditIdentity && (
                <div className="space-y-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                  <div>
                    <p className="text-xs font-semibold text-white/65">
                      Detail bersama semua size
                    </p>
                    <p className="mt-0.5 text-[11px] text-white/35">
                      Perubahan berikut otomatis mengikuti seluruh variant SKU ini.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <FieldLabel htmlFor="brand">Brand</FieldLabel>
                      <Input
                        id="brand"
                        value={form.brand}
                        onChange={(event) =>
                          setForm({ ...form, brand: event.target.value })
                        }
                      />
                      <FieldError message={fieldErrors.brand} />
                    </div>
                    <div>
                      <FieldLabel htmlFor="model">Model</FieldLabel>
                      <Input
                        id="model"
                        value={form.model}
                        onChange={(event) =>
                          setForm({ ...form, model: event.target.value })
                        }
                      />
                      <FieldError message={fieldErrors.model} />
                    </div>
                    <div>
                      <FieldLabel htmlFor="sku">SKU Colorway</FieldLabel>
                      <Input
                        id="sku"
                        value={form.sku}
                        onChange={(event) =>
                          setForm({ ...form, sku: event.target.value })
                        }
                      />
                      <FieldError message={fieldErrors.sku} />
                    </div>
                    <div>
                      <FieldLabel htmlFor="color">Warna</FieldLabel>
                      <Input
                        id="color"
                        value={form.color}
                        onChange={(event) =>
                          setForm({ ...form, color: event.target.value })
                        }
                        placeholder="Contoh: Cloud White"
                      />
                      <FieldError message={fieldErrors.color} />
                    </div>
                  </div>
                </div>
              )}

              {canEditImage && (
                <div>
                  <FieldLabel>Foto Produk</FieldLabel>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex size-20 overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02]">
                      {form.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={form.image_url}
                          alt="Preview"
                          className="size-full object-cover"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-white/25">
                          <ImageOff size={22} />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
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
                        <Upload size={14} />
                        {uploading
                          ? "Upload..."
                          : form.image_url
                            ? "Ganti Foto"
                            : "Upload Foto"}
                      </Button>
                      {form.image_url && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setForm({ ...form, image_url: "" })}
                        >
                          <Trash2 size={14} />
                          Hapus
                        </Button>
                      )}
                    </div>
                  </div>
                  <FieldError message={fieldErrors.image_url} />
                </div>
              )}

              {canEditPrice ? (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <FieldLabel htmlFor="hpp">HPP / Modal (Rp)</FieldLabel>
                      <NumberInput
                        id="hpp"
                        min={0}
                        value={form.hpp}
                        onValueChange={(value) => setForm({ ...form, hpp: value })}
                      />
                      <p className="mt-1 text-[11px] text-white/35">Semua size</p>
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
                      <p className="mt-1 text-[11px] text-white/35">Size ini</p>
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
                      <p className="mt-1 text-[11px] text-white/35">Size ini</p>
                      <FieldError message={fieldErrors.price_offline} />
                    </div>
                  </div>

                  <button
                    type="button"
                    aria-expanded={showEditChannels}
                    onClick={() => setShowEditChannels((current) => !current)}
                    className="flex w-full items-center justify-between rounded-lg border border-white/[0.07] px-3 py-2 text-left text-xs font-medium text-white/55 transition hover:bg-white/[0.03] hover:text-white/75"
                  >
                    Harga marketplace (opsional)
                    <ChevronDown
                      size={14}
                      className={cn(
                        "transition-transform",
                        showEditChannels && "rotate-180",
                      )}
                    />
                  </button>
                  {showEditChannels && (
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                      <div className="mb-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              price_website: form.sell_price,
                              price_shopee: form.sell_price,
                              price_tiktok: form.sell_price,
                              price_tokopedia: form.sell_price,
                            })
                          }
                          className="text-[11px] font-medium text-cyan-300/75 hover:text-cyan-200"
                        >
                          Samakan semua dengan harga online
                        </button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {(
                          [
                            ["price_website", "Website"],
                            ["price_shopee", "Shopee"],
                            ["price_tiktok", "TikTok"],
                            ["price_tokopedia", "Tokopedia"],
                          ] as Array<[ChannelPriceKey, string]>
                        ).map(([field, label]) => (
                          <div key={field}>
                            <FieldLabel htmlFor={`edit-${field}`}>
                              {label} (Rp)
                            </FieldLabel>
                            <NumberInput
                              id={`edit-${field}`}
                              min={0}
                              value={form[field]}
                              onValueChange={(value) =>
                                setForm({ ...form, [field]: value })
                              }
                            />
                            <FieldError message={fieldErrors[field]} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Alert tone="info">
                  Hanya owner / finance yang bisa mengubah HPP dan harga jual.
                </Alert>
              )}

              {fieldErrors._form && <Alert tone="error">{fieldErrors._form}</Alert>}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Batal
              </Button>
              <Button
                onClick={handleSave}
                disabled={
                  pending ||
                  uploading ||
                  (canEditIdentity &&
                    (!form.brand.trim() ||
                      !form.model.trim() ||
                      !form.sku.trim() ||
                      !form.size_label.trim()))
                }
              >
                {pending ? "Menyimpan..." : "Simpan perubahan"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-4 pt-1">
              <Alert tone="info">
                Brand, model, SKU, warna, foto, dan HPP otomatis mengikuti produk ini. Anda hanya perlu mengisi data size baru.
              </Alert>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="new-size">Size baru</FieldLabel>
                  <Input
                    id="new-size"
                    value={addForm.size_label}
                    onChange={(event) =>
                      setAddForm({ ...addForm, size_label: event.target.value })
                    }
                    placeholder="42 atau 42 2/3"
                    autoFocus
                  />
                  <FieldError message={addErrors.size_label} />
                </div>
                <div>
                  <FieldLabel htmlFor="new-barcode">Barcode Accurate</FieldLabel>
                  <Input
                    id="new-barcode"
                    value={addForm.barcode}
                    onChange={(event) =>
                      setAddForm({ ...addForm, barcode: event.target.value })
                    }
                    placeholder="104163"
                    className="font-mono"
                  />
                  <p className="mt-1 text-[11px] text-white/35">
                    Akan terkunci setelah disimpan.
                  </p>
                  <FieldError message={addErrors.barcode} />
                </div>
              </div>

              {canEditPrice ? (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <FieldLabel htmlFor="new-online">Harga Online (Rp)</FieldLabel>
                      <NumberInput
                        id="new-online"
                        min={0}
                        value={addForm.sell_price}
                        onValueChange={(value) =>
                          setAddForm({ ...addForm, sell_price: value })
                        }
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="new-offline">Harga Offline (Rp)</FieldLabel>
                      <NumberInput
                        id="new-offline"
                        min={0}
                        value={addForm.price_offline}
                        onValueChange={(value) =>
                          setAddForm({ ...addForm, price_offline: value })
                        }
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    aria-expanded={showAddChannels}
                    onClick={() => setShowAddChannels((current) => !current)}
                    className="flex w-full items-center justify-between rounded-lg border border-white/[0.07] px-3 py-2 text-left text-xs font-medium text-white/55 transition hover:bg-white/[0.03] hover:text-white/75"
                  >
                    {addChannelsCustom
                      ? "Harga marketplace khusus"
                      : "Harga marketplace mengikuti harga online"}
                    <ChevronDown
                      size={14}
                      className={cn(
                        "transition-transform",
                        showAddChannels && "rotate-180",
                      )}
                    />
                  </button>
                  {showAddChannels && (
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] text-white/40">
                          Ubah hanya jika harga channel memang berbeda.
                        </p>
                        {addChannelsCustom && (
                          <button
                            type="button"
                            onClick={() => setAddChannelsCustom(false)}
                            className="text-[11px] font-medium text-cyan-300/75 hover:text-cyan-200"
                          >
                            Samakan dengan harga online
                          </button>
                        )}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {(
                          [
                            ["price_website", "Website"],
                            ["price_shopee", "Shopee"],
                            ["price_tiktok", "TikTok"],
                            ["price_tokopedia", "Tokopedia"],
                          ] as Array<[ChannelPriceKey, string]>
                        ).map(([field, label]) => (
                          <div key={field}>
                            <FieldLabel htmlFor={`new-${field}`}>
                              {label} (Rp)
                            </FieldLabel>
                            <NumberInput
                              id={`new-${field}`}
                              min={0}
                              value={
                                addChannelsCustom
                                  ? addForm[field]
                                  : addForm.sell_price
                              }
                              onValueChange={(value) =>
                                updateAddChannel(field, value)
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Alert tone="info">
                  Harga awal disimpan 0 dan dapat dilengkapi Owner/Finance.
                </Alert>
              )}

              {addErrors.variant && <Alert tone="error">{addErrors.variant}</Alert>}
              {addErrors._form && <Alert tone="error">{addErrors._form}</Alert>}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Batal
              </Button>
              <Button
                onClick={handleAddSize}
                disabled={
                  pending ||
                  !addForm.size_label.trim() ||
                  !addForm.barcode.trim()
                }
              >
                {pending ? "Menyimpan..." : "Simpan size baru"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
