"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn, NumberInput } from "@sneakervault/ui";
import { formatRupiah as rp } from "@/lib/format";
import type { BankAccountRow } from "@/lib/queries";

const PAYMENTS = [
  { value: "cash", label: "Tunai" },
  { value: "bank_transfer", label: "Transfer" },
  { value: "other", label: "QRIS" },
] as const;

const QUICK = [50000, 100000, 200000];

function accountsForPayment(
  accounts: BankAccountRow[],
  method: string,
) {
  if (method === "cash") return accounts.filter((account) => account.type === "cash");
  if (method === "bank_transfer") return accounts.filter((account) => account.type === "bank");
  return accounts.filter((account) => account.type === "bank" || account.type === "ewallet");
}

function preferredAccountId(accounts: BankAccountRow[], method: string) {
  const eligible = accountsForPayment(accounts, method);
  return eligible.find((account) => account.is_default)?.id ?? eligible[0]?.id ?? "";
}

export type PosPaymentResult = {
  payment_method: string;
  bank_account_id: string;
  cash_received: number;
};

export function PosPaymentModal({
  open,
  onClose,
  total,
  bankAccounts,
  processing,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  total: number;
  bankAccounts: BankAccountRow[];
  processing: boolean;
  onConfirm: (result: PosPaymentResult) => void;
}) {
  const accounts = bankAccounts.filter((a) => a.is_active !== false);
  const defaultAccountId = preferredAccountId(accounts, "cash");
  const [method, setMethod] = useState<string>("cash");
  const [account, setAccount] = useState(defaultAccountId);
  const [cash, setCash] = useState(0);
  const eligibleAccounts = accountsForPayment(accounts, method);

  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setMethod("cash");
        setCash(0);
        setAccount(defaultAccountId);
      });
    }
  }, [open, defaultAccountId]);

  if (!open) return null;

  const change = method === "cash" ? Math.max(0, cash - total) : 0;
  const canPay =
    !!account && total > 0 && !processing && (method !== "cash" || cash >= total);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-payment-title"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border border-white/[0.08] bg-[#262626] text-white shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200"
      >
        <div className="flex items-center justify-between px-6 pt-5">
          <span id="pos-payment-title" className="text-[10px] font-black uppercase tracking-widest text-white/60">
            Pembayaran
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup form pembayaran"
            className="grid size-8 place-items-center rounded-lg text-white/60 hover:bg-white/[0.08] hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div className="rounded-2xl border border-white/[0.08] bg-black/25 p-5 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/60">
              Total Tagihan
            </p>
            <p className="mt-1 text-3xl font-black tabular-nums tracking-tighter text-white">
              {rp(total)}
            </p>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-white/60">
              Metode Bayar
            </p>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENTS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => {
                    setMethod(p.value);
                    setAccount(preferredAccountId(accounts, p.value));
                  }}
                  className={cn(
                    "h-12 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all",
                    method === p.value
                      ? "bg-white text-black shadow-lg shadow-black/20"
                      : "bg-white/[0.05] text-white/60 hover:bg-white/[0.08] hover:text-white",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-white/60">
              {method === "cash" ? "Akun Kas" : "Akun Bank / e-Wallet"}
            </p>
            <select
              aria-label={method === "cash" ? "Akun kas untuk pembayaran" : "Akun bank untuk pembayaran"}
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="h-12 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm font-bold text-white outline-none"
            >
              {eligibleAccounts.length === 0 ? (
                <option value="">Belum ada akun yang sesuai</option>
              ) : null}
              {eligibleAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {method === "cash" ? (
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-white/60">
                Uang Diterima
              </p>
              <NumberInput
                min={0}
                value={cash || ""}
                onValueChange={(value) => setCash(Math.max(0, value))}
                placeholder="0"
                className="h-12 w-full rounded-xl !border !border-white/[0.08] !bg-white/[0.05] px-4 text-lg font-black tabular-nums !text-white outline-none focus:!ring-0"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setCash(total)}
                  className="rounded-lg bg-white/[0.06] px-2.5 py-1 text-[11px] font-black uppercase text-white/60 hover:bg-white/[0.1] hover:text-white"
                >
                  Uang pas
                </button>
                {QUICK.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setCash((c) => c + v)}
                    className="rounded-lg bg-white/[0.06] px-2.5 py-1 text-[11px] font-black tabular-nums text-white/60 hover:bg-white/[0.1] hover:text-white"
                  >
                    +{v / 1000}rb
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5">
                <span className="text-[11px] font-black uppercase tracking-widest text-emerald-600">
                  Kembalian
                </span>
                <span className="text-lg font-black tabular-nums text-emerald-700">
                  {rp(change)}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex gap-2 px-6 pb-6">
          <button
            type="button"
            onClick={onClose}
            className="h-14 flex-1 rounded-xl bg-white/[0.06] text-[11px] font-black uppercase tracking-widest text-white/65 hover:bg-white/[0.1] hover:text-white"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!canPay}
            onClick={() =>
              onConfirm({
                payment_method: method,
                bank_account_id: account,
                cash_received: method === "cash" ? cash : total,
              })
            }
            className="h-14 flex-[2] rounded-xl bg-[#E5484D] text-[11px] font-black uppercase tracking-widest text-white shadow-xl shadow-rose-100 transition-all hover:bg-[#d83b40] disabled:opacity-50"
          >
            {processing ? "Memproses…" : "Bayar & Cetak Struk"}
          </button>
        </div>
      </div>
    </div>
  );
}
