"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@sneakervault/ui";
import { useToast } from "@/components/toast";
import { saveReceiptSettings } from "@/lib/actions/receipt-settings";
import type { ReceiptSettings } from "@/lib/receipt";

const FIELD =
  "h-9 w-full rounded-lg border border-neutral-200 px-2.5 text-[13px] text-neutral-900 outline-none focus:border-neutral-400";

export function PosReceiptSettingsDialog({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial: ReceiptSettings;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<ReceiptSettings>(initial);

  if (!open) return null;

  const set = <K extends keyof ReceiptSettings>(key: K, value: ReceiptSettings[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function save() {
    startTransition(async () => {
      const res = await saveReceiptSettings(form);
      if (res.error) {
        toast.push(res.error, "error");
        return;
      }
      toast.push("Pengaturan struk disimpan", "success");
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white text-neutral-900 shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold">Pengaturan Struk</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-neutral-400 hover:bg-neutral-100"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <div>
            <label className="mb-1 block text-[12px] font-medium text-neutral-500">
              Nama Toko
            </label>
            <input
              value={form.store_name}
              onChange={(e) => set("store_name", e.target.value)}
              className={FIELD}
              placeholder="Vault Store"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-neutral-500">
                Alamat
              </label>
              <input
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                className={FIELD}
                placeholder="Jl. ..."
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-neutral-500">
                Telepon
              </label>
              <input
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                className={FIELD}
                placeholder="0812..."
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-neutral-500">
              Header (opsional)
            </label>
            <input
              value={form.header}
              onChange={(e) => set("header", e.target.value)}
              className={FIELD}
              placeholder="Default: nama toko"
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-neutral-500">
              Footer
            </label>
            <textarea
              value={form.footer}
              onChange={(e) => set("footer", e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-neutral-200 px-2.5 py-2 text-[13px] text-neutral-900 outline-none focus:border-neutral-400"
              placeholder="Terima kasih sudah berbelanja!"
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-neutral-500">
              Ukuran Kertas
            </label>
            <div className="flex gap-1.5">
              {(["58mm", "80mm"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => set("paper_size", p)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-colors",
                    form.paper_size === p
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-200 text-neutral-600 hover:border-neutral-300",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-neutral-100 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {pending ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}
