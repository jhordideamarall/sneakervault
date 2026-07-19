"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@sneakervault/ui";
import { AlertTriangle, ArrowRight, Trash2 } from "lucide-react";
import type { TransactionDeleteResult } from "@/lib/actions/transaction-deletes";

type TransactionDeleteDialogProps = {
  open: boolean;
  title: string;
  description: string;
  impacts: string[];
  pending: boolean;
  blocker?: TransactionDeleteResult | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onOpenBlocker?: () => void;
};

export function TransactionDeleteDialog({
  open,
  title,
  description,
  impacts,
  pending,
  blocker,
  onOpenChange,
  onConfirm,
  onOpenBlocker,
}: TransactionDeleteDialogProps) {
  const isBlocked = blocker?.deleted === false;

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-w-lg rounded-lg">
        <DialogHeader className="pr-10">
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-md bg-red-500/10 text-red-300">
            {isBlocked ? (
              <AlertTriangle size={18} strokeWidth={1.8} />
            ) : (
              <Trash2 size={18} strokeWidth={1.8} />
            )}
          </div>
          <DialogTitle>{isBlocked ? "Transaksi belum dapat dihapus" : title}</DialogTitle>
          <DialogDescription>
            {isBlocked ? blocker.blocker_message : description}
          </DialogDescription>
        </DialogHeader>

        {isBlocked ? (
          <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.06] p-3 text-sm text-amber-100/85">
            <p className="font-medium">Urutan penghapusan masih tertahan.</p>
            {blocker.blocker_numbers.length > 0 ? (
              <p className="mt-1 text-xs text-amber-100/65">
                Referensi: {blocker.blocker_numbers.join(", ")}
              </p>
            ) : null}
          </div>
        ) : (
          <ul className="space-y-2 text-sm text-white/65">
            {impacts.map((impact) => (
              <li key={impact} className="flex gap-2">
                <span className="mt-2 h-1 w-1 flex-none rounded-full bg-red-300/70" />
                <span>{impact}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.06] pt-4">
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {isBlocked ? "Tutup" : "Batal"}
          </Button>
          {isBlocked ? (
            blocker.blocker_href && onOpenBlocker ? (
              <Button type="button" className="gap-2" onClick={onOpenBlocker}>
                Buka transaksi penghambat
                <ArrowRight size={14} />
              </Button>
            ) : null
          ) : (
            <Button
              type="button"
              disabled={pending}
              onClick={onConfirm}
              className="gap-2 bg-red-600 text-white hover:bg-red-500"
            >
              <Trash2 size={14} />
              {pending ? "Menghapus..." : "Hapus permanen"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
