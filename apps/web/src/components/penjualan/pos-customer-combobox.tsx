"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown, Plus, Search, User, X } from "lucide-react";
import { useToast } from "@/components/toast";
import { createCustomer } from "@/lib/actions/customers";
import type { CustomerRow } from "@/lib/queries";

type Selected = { id: string; name: string } | null;

export function PosCustomerCombobox({
  customers,
  selected,
  onSelect,
  onCreated,
}: {
  customers: CustomerRow[];
  selected: Selected;
  onSelect: (c: Selected) => void;
  onCreated: (c: CustomerRow) => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, startTransition] = useTransition();

  const filtered = customers
    .filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q.toLowerCase()) ||
        (c.phone ?? "").includes(q),
    )
    .slice(0, 8);

  function save() {
    if (!name.trim()) {
      toast.push("Nama customer wajib diisi", "error");
      return;
    }
    startTransition(async () => {
      const res = await createCustomer({
        name: name.trim(),
        phone: phone.trim() || undefined,
        channel: "offline",
      });
      const err = (res as { error?: unknown }).error;
      if (err) {
        const msg =
          typeof err === "string"
            ? err
            : ((err as { _form?: string[] })._form?.[0] ?? "Gagal menambah customer");
        toast.push(msg, "error");
        return;
      }
      const c = (res as { data: CustomerRow }).data;
      onCreated(c);
      onSelect({ id: c.id, name: c.name });
      setAdding(false);
      setName("");
      setPhone("");
      setOpen(false);
      toast.push("Customer ditambahkan", "success");
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-left transition-colors hover:bg-slate-100"
      >
        <span className="flex min-w-0 items-center gap-2">
          <User className="size-4 shrink-0 text-slate-400" />
          <span className="truncate text-[11px] font-black uppercase tracking-wide text-slate-600">
            {selected?.name ?? "Walk-in Customer"}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-slate-400" />
      </button>

      {open ? (
        <div className="absolute bottom-full z-20 mb-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          {!adding ? (
            <>
              <div className="relative border-b border-slate-100 p-2">
                <Search className="absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-slate-300" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Cari customer…"
                  className="h-9 w-full rounded-lg bg-slate-50 pl-8 pr-3 text-[13px] outline-none"
                />
              </div>
              <div className="max-h-52 overflow-y-auto p-1">
                <button
                  type="button"
                  onClick={() => {
                    onSelect(null);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[12px] font-bold text-slate-500 hover:bg-slate-50"
                >
                  Walk-in Customer
                  {!selected ? <Check className="size-3.5 text-[#E5484D]" /> : null}
                </button>
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onSelect({ id: c.id, name: c.name });
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-bold text-slate-800">
                        {c.name}
                      </span>
                      {c.phone ? (
                        <span className="block text-[11px] text-slate-400">{c.phone}</span>
                      ) : null}
                    </span>
                    {selected?.id === c.id ? (
                      <Check className="size-3.5 shrink-0 text-[#E5484D]" />
                    ) : null}
                  </button>
                ))}
                {filtered.length === 0 ? (
                  <p className="px-3 py-3 text-center text-[12px] text-slate-400">
                    Tidak ada customer
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  setAdding(true);
                  setName(q);
                }}
                className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2.5 text-[12px] font-black uppercase tracking-wide text-[#E5484D] hover:bg-rose-50"
              >
                <Plus className="size-3.5" /> Tambah customer baru
              </button>
            </>
          ) : (
            <div className="space-y-2 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Customer Baru
                </span>
                <button type="button" onClick={() => setAdding(false)}>
                  <X className="size-3.5 text-slate-400" />
                </button>
              </div>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama customer *"
                className="h-9 w-full rounded-lg bg-slate-50 px-3 text-[13px] outline-none"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="No. HP (opsional)"
                className="h-9 w-full rounded-lg bg-slate-50 px-3 text-[13px] outline-none"
              />
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="h-9 w-full rounded-lg bg-slate-900 text-[12px] font-black uppercase tracking-widest text-white disabled:opacity-50"
              >
                {pending ? "Menyimpan…" : "Simpan & Pilih"}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
