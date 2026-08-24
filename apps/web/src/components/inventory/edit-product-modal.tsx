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
  addProductVariantsToSku,
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

type AddVariantFormState = {
  key: string;
  size_label: string;
  barcode: string;
  sell_price: number;
  price_offline: number;
  price_website: number;
  price_shopee: number;
  price_tiktok: number;
  price_tokopedia: number;
  channel_prices_open: boolean;
  channel_prices_custom: boolean;
};

function emptyAddVariant(): AddVariantFormState {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    size_label: "",
    barcode: "",
    sell_price: 0,
    price_offline: 0,
    price_website: 0,
    price_shopee: 0,
    price_tiktok: 0,
    price_tokopedia: 0,
    channel_prices_open: false,
    channel_prices_custom: false,
  };
}

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
  const [addVariants, setAddVariants] = useState<AddVariantFormState[]>([
    emptyAddVariant(),
  ]);
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

  function updateAddVariant(
    key: string,
    patch: Partial<Omit<AddVariantFormState, "key">>,
  ) {
    setAddVariants((current) =>
      current.map((variant) =>
        variant.key === key ? { ...variant, ...patch } : variant,
      ),
    );
  }

  function updateAddChannel(
    key: string,
    field: ChannelPriceKey,
    value: number,
  ) {
    setAddVariants((current) =>
      current.map((variant) => {
        if (variant.key !== key) return variant;
        return {
          ...variant,
          price_website: variant.channel_prices_custom
            ? variant.price_website
            : variant.sell_price,
          price_shopee: variant.channel_prices_custom
            ? variant.price_shopee
            : variant.sell_price,
          price_tiktok: variant.channel_prices_custom
            ? variant.price_tiktok
            : variant.sell_price,
          price_tokopedia: variant.channel_prices_custom
            ? variant.price_tokopedia
            : variant.sell_price,
          [field]: value,
          channel_prices_custom: true,
        };
      }),
    );
  }

  function handleAddSizes() {
    setAddErrors({});
    startTransition(async () => {
      const result = await addProductVariantsToSku({
        source_product_id: product.id,
        variants: addVariants.map((variant) => ({
          size_label: variant.size_label,
          barcode: variant.barcode,
          sell_price: canEditPrice ? variant.sell_price : 0,
          price_offline: canEditPrice ? variant.price_offline : 0,
          price_website: canEditPrice
            ? variant.channel_prices_custom
              ? variant.price_website
              : variant.sell_price
            : 0,
          price_shopee: canEditPrice
            ? variant.channel_prices_custom
              ? variant.price_shopee
              : variant.sell_price
            : 0,
          price_tiktok: canEditPrice
            ? variant.channel_prices_custom
              ? variant.price_tiktok
              : variant.sell_price
            : 0,
          price_tokopedia: canEditPrice
            ? variant.channel_prices_custom
              ? variant.price_tokopedia
              : variant.sell_price
            : 0,
        })),
      });
      if ("error" in result && result.error) {
        setAddErrors(collectErrors(result.error));
        toast.push("Size baru belum tersimpan", "error");
        return;
      }
      toast.push(`${addVariants.length} size berhasil ditambahkan`, "success");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[calc(100dvh-2rem)] overflow-y-auto transition-[max-width]",
          mode === "add-size" ? "max-w-4xl" : "max-w-2xl",
        )}
      >
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
                Brand, model, SKU, warna, foto, dan HPP otomatis mengikuti produk ini. Isi satu atau beberapa size baru di bawah.
              </Alert>

              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-white/65">Size baru</p>
                  <p className="mt-0.5 text-[11px] text-white/35">
                    Semua baris disimpan sekaligus. Jika ada duplikat, tidak ada yang tersimpan.
                  </p>
                </div>
                <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] text-white/45">
                  {addVariants.length} size
                </span>
              </div>

              <div className="space-y-3">
                {addVariants.map((variant, index) => (
                  <div
                    key={variant.key}
                    className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-white/55">
                        Size #{index + 1}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={addVariants.length === 1}
                        onClick={() =>
                          setAddVariants((current) =>
                            current.filter((item) => item.key !== variant.key),
                          )
                        }
                        aria-label={`Hapus size baru ${index + 1}`}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>

                    <div
                      className={cn(
                        "grid gap-3",
                        canEditPrice
                          ? "sm:grid-cols-2 lg:grid-cols-[minmax(140px,0.75fr)_minmax(200px,1.2fr)_minmax(160px,1fr)_minmax(160px,1fr)]"
                          : "sm:grid-cols-2",
                      )}
                    >
                      <div>
                        <FieldLabel htmlFor={`new-size-${variant.key}`}>
                          Size
                        </FieldLabel>
                        <Input
                          id={`new-size-${variant.key}`}
                          value={variant.size_label}
                          onChange={(event) =>
                            updateAddVariant(variant.key, {
                              size_label: event.target.value,
                            })
                          }
                          placeholder="42 atau 42 2/3"
                          autoFocus={index === 0}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor={`new-barcode-${variant.key}`}>
                          Barcode Accurate
                        </FieldLabel>
                        <Input
                          id={`new-barcode-${variant.key}`}
                          value={variant.barcode}
                          onChange={(event) =>
                            updateAddVariant(variant.key, {
                              barcode: event.target.value,
                            })
                          }
                          placeholder="104163"
                          className="font-mono"
                        />
                      </div>
                      {canEditPrice && (
                        <>
                          <div>
                            <FieldLabel htmlFor={`new-online-${variant.key}`}>
                              Harga Online (Rp)
                            </FieldLabel>
                            <NumberInput
                              id={`new-online-${variant.key}`}
                              min={0}
                              value={variant.sell_price}
                              onValueChange={(value) =>
                                updateAddVariant(variant.key, {
                                  sell_price: value,
                                })
                              }
                            />
                          </div>
                          <div>
                            <FieldLabel htmlFor={`new-offline-${variant.key}`}>
                              Harga Offline (Rp)
                            </FieldLabel>
                            <NumberInput
                              id={`new-offline-${variant.key}`}
                              min={0}
                              value={variant.price_offline}
                              onValueChange={(value) =>
                                updateAddVariant(variant.key, {
                                  price_offline: value,
                                })
                              }
                            />
                          </div>
                        </>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] text-white/30">
                        Barcode dikunci setelah produk disimpan.
                      </p>
                      {canEditPrice && (
                        <button
                          type="button"
                          aria-expanded={variant.channel_prices_open}
                          onClick={() =>
                            updateAddVariant(variant.key, {
                              channel_prices_open: !variant.channel_prices_open,
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-cyan-300/75 transition hover:bg-cyan-400/[0.07] hover:text-cyan-200"
                        >
                          {variant.channel_prices_custom
                            ? "Harga marketplace khusus"
                            : "Atur harga marketplace"}
                          <ChevronDown
                            size={13}
                            className={cn(
                              "transition-transform",
                              variant.channel_prices_open && "rotate-180",
                            )}
                          />
                        </button>
                      )}
                    </div>

                    {canEditPrice && variant.channel_prices_open && (
                      <div className="mt-3 rounded-lg border border-white/[0.06] bg-black/10 p-3">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] text-white/40">
                            Ubah hanya jika harga channel berbeda.
                          </p>
                          {variant.channel_prices_custom && (
                            <button
                              type="button"
                              onClick={() =>
                                updateAddVariant(variant.key, {
                                  channel_prices_custom: false,
                                })
                              }
                              className="text-[11px] font-medium text-cyan-300/75 hover:text-cyan-200"
                            >
                              Samakan dengan harga online
                            </button>
                          )}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          {(
                            [
                              ["price_website", "Website"],
                              ["price_shopee", "Shopee"],
                              ["price_tiktok", "TikTok"],
                              ["price_tokopedia", "Tokopedia"],
                            ] as Array<[ChannelPriceKey, string]>
                          ).map(([field, label]) => (
                            <div key={field}>
                              <FieldLabel htmlFor={`new-${field}-${variant.key}`}>
                                {label} (Rp)
                              </FieldLabel>
                              <NumberInput
                                id={`new-${field}-${variant.key}`}
                                min={0}
                                value={
                                  variant.channel_prices_custom
                                    ? variant[field]
                                    : variant.sell_price
                                }
                                onValueChange={(value) =>
                                  updateAddChannel(variant.key, field, value)
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  disabled={addVariants.length >= 100}
                  onClick={() =>
                    setAddVariants((current) => [...current, emptyAddVariant()])
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.12] px-4 py-3 text-sm font-medium text-white/55 transition hover:border-cyan-400/30 hover:bg-cyan-400/[0.04] hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus size={15} />
                  Tambah size berikutnya
                </button>
              </div>

              {!canEditPrice && (
                <Alert tone="info">
                  Harga awal disimpan 0 dan dapat dilengkapi Owner/Finance.
                </Alert>
              )}

              {addErrors.variants && <Alert tone="error">{addErrors.variants}</Alert>}
              {addErrors._form && <Alert tone="error">{addErrors._form}</Alert>}
            </div>

            <div className="sticky bottom-0 z-10 -mx-2 mt-6 flex justify-end gap-3 border-t border-white/[0.06] bg-[#111111]/95 px-2 pb-1 pt-4 backdrop-blur-xl">
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Batal
              </Button>
              <Button
                onClick={handleAddSizes}
                disabled={
                  pending ||
                  addVariants.some(
                    (variant) =>
                      !variant.size_label.trim() || !variant.barcode.trim(),
                  )
                }
              >
                {pending
                  ? "Menyimpan semua..."
                  : `Simpan ${addVariants.length} size`}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
