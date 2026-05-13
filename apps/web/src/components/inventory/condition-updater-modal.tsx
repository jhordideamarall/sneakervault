"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  Textarea,
  FieldLabel,
  FieldError,
  Alert,
} from "@sneakervault/ui";
import { PRODUCT_CONDITIONS } from "@sneakervault/shared";
import type { ProductCondition } from "@sneakervault/shared";
import { updateProductCondition } from "@/lib/actions/products";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";
import { cn } from "@sneakervault/ui";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productLabel: string;
  currentCondition: ProductCondition;
};

export function ConditionUpdaterModal({
  open,
  onOpenChange,
  productId,
  productLabel,
  currentCondition,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<ProductCondition>(currentCondition);
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleSave() {
    setFieldErrors({});
    if (selected === currentCondition) {
      onOpenChange(false);
      return;
    }
    if (selected !== "normal" && reason.trim().length === 0) {
      setFieldErrors({ reason: "Alasan wajib diisi untuk status Defect / Dormant" });
      return;
    }

    startTransition(async () => {
      const result = await updateProductCondition({
        product_id: productId,
        new_condition: selected,
        reason: reason.trim() || undefined,
      });
      if ("error" in result && result.error) {
        const errs: Record<string, string> = {};
        for (const [k, v] of Object.entries(result.error)) {
          if (Array.isArray(v) && v[0]) errs[k] = v[0];
        }
        setFieldErrors(errs);
        toast.push("Gagal mengubah status produk", "error");
        return;
      }
      toast.push(`Status ${productLabel} → ${selected}`, "success");
      onOpenChange(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ubah Status Produk</DialogTitle>
          <DialogDescription>{productLabel}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <FieldLabel>Status Fisik</FieldLabel>
            <div className="grid gap-2 sm:grid-cols-3">
              {PRODUCT_CONDITIONS.map((c) => {
                const active = selected === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setSelected(c.value)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm transition-all",
                      active
                        ? "border-white/30 bg-white/10 text-white"
                        : "border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-white/[0.14] hover:bg-white/[0.04]",
                    )}
                  >
                    <div className="font-medium">{c.label}</div>
                    <div className={cn("text-[11px]", active ? "text-white/60" : "text-white/40")}>
                      {c.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {selected !== "normal" && (
            <div>
              <FieldLabel htmlFor="reason" required>
                Alasan
              </FieldLabel>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Contoh: sol mulai lepas, kotor sulit dibersihkan, tidak laku >3 bulan"
                rows={3}
              />
              <FieldError message={fieldErrors.reason} />
            </div>
          )}

          {selected === "normal" && currentCondition !== "normal" && (
            <Alert tone="success">
              Produk akan dikembalikan ke status Normal. Alasan sebelumnya tetap tercatat di history.
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
