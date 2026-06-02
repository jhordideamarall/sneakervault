"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn, NumberInput } from "@sneakervault/ui";
import type { BankAccountRow } from "@/lib/queries";

const rp = (v: number) => `Rp ${Number(v).toLocaleString("id-ID")}`;

const PAYMENTS = [
  { value: "cash", label: "Tunai" },
  { value: "bank_transfer", label: "Transfer" },
  { value: "other", label: "QRIS" },
] as const;

const QUICK = [50000, 100000, 200000];

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
  const [method, setMethod] = useState<string>("cash");
  const [account, setAccount] = useState(accounts[0]?.id ?? "");
  const [cash, setCash] = useState(0);

  useEffect(() => {
    if (open) {
      setMethod("cash");
      setCash(0);
      setAccount(accounts[0]?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const change = method === "cash" ? Math.max(0, cash - total) : 0;
  const canPay =
    !!account && total > 0 && !processing && (method !== "cash" || cash >= total);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200">
        <div className="flex items-center justify-between px-6 pt-5">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Pembayaran
          </span>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div className="rounded-2xl bg-slate-900 p-5 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">
              Total Tagihan
            </p>
            <p className="mt-1 text-3xl font-black tabular-nums tracking-tighter text-white">
              {rp(total)}
            </p>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              Metode Bayar
            </p>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENTS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setMethod(p.value)}
                  className={cn(
                    "h-12 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all",
                    method === p.value
                      ? "bg-slate-900 text-white shadow-lg shadow-slate-200"
                      : "bg-slate-50 text-slate-500 hover:bg-slate-100",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              Akun Kas/Bank
            </p>
            <select
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="h-12 w-full rounded-xl bg-slate-50 px-3 text-sm font-bold text-slate-800 outline-none"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {method === "cash" ? (
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Uang Diterima
              </p>
              <NumberInput
                min={0}
                value={cash || ""}
                onValueChange={(value) => setCash(Math.max(0, value))}
                placeholder="0"
                className="h-12 w-full rounded-xl !border-none !bg-slate-50 px-4 text-lg font-black tabular-nums !text-slate-900 outline-none focus:!ring-0"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setCash(total)}
                  className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-black uppercase text-slate-600 hover:bg-slate-200"
                >
                  Uang pas
                </button>
                {QUICK.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setCash((c) => c + v)}
                    className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-black tabular-nums text-slate-600 hover:bg-slate-200"
                  >
                    +{v / 1000}rb
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-2.5">
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
            className="h-14 flex-1 rounded-xl bg-slate-50 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100"
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
