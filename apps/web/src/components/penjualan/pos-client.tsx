"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Minus,
  Package,
  Plus,
  ScanBarcode,
  Search,
  Settings2,
  ShoppingCart,
} from "lucide-react";
import { cn, NumberInput } from "@sneakervault/ui";
import { useToast } from "@/components/toast";
import { formatRupiah as rp } from "@/lib/format";
import { posCheckout } from "@/lib/actions/pos";
import type { BankAccountRow, CustomerRow } from "@/lib/queries";
import {
  PosProductCard,
  type PosGroup,
  type PosProduct,
} from "./pos-product-card";
import { PosReceipt, type ReceiptSale, type ReceiptSettings } from "./pos-receipt";
import { PosReceiptSettingsDialog } from "./pos-receipt-settings";
import { PosCustomerCombobox } from "./pos-customer-combobox";
import { PosPaymentModal, type PosPaymentResult } from "./pos-payment-modal";

type CartLine = { product: PosProduct; qty: number; unit_price: number };
type SelectedCustomer = { id: string; name: string } | null;

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Tunai",
  bank_transfer: "Transfer",
  other: "QRIS",
};

const today = () => new Date().toISOString().slice(0, 10);

function actionError(result: unknown): string | null {
  if (!result || typeof result !== "object" || !("error" in result)) return null;
  const error = (result as { error?: unknown }).error;
  if (!error) return null;
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    return Object.values(error as Record<string, unknown>).flat().join(", ");
  }
  return "Terjadi kesalahan";
}

const unitPrice = (p: PosProduct) =>
  Number(p.price_offline) > 0 ? Number(p.price_offline) : Number(p.sell_price);

export function PosClient({
  products,
  bankAccounts,
  customers: initialCustomers,
  receiptSettings,
  cashierName,
}: {
  products: PosProduct[];
  bankAccounts: BankAccountRow[];
  customers: CustomerRow[];
  receiptSettings: ReceiptSettings;
  cashierName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const barcodeRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [barcode, setBarcode] = useState("");
  const [brand, setBrand] = useState("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>(initialCustomers);
  const [customer, setCustomer] = useState<SelectedCustomer>(null);
  const [discount, setDiscount] = useState(0);
  const [showPayment, setShowPayment] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptSale | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    barcodeRef.current?.focus();
  }, [receipt]);

  const brands = useMemo(
    () => ["all", ...Array.from(new Set(products.map((p) => p.brand))).sort()],
    [products],
  );

  const groups = useMemo<PosGroup[]>(() => {
    const map = new Map<string, PosGroup>();
    for (const p of products) {
      const key = `${p.brand}|${p.model}|${p.color ?? ""}`;
      const price = unitPrice(p);
      const g = map.get(key);
      if (g) {
        g.variants.push(p);
        g.totalStock += p.quantity;
        g.priceFrom = Math.min(g.priceFrom, price);
        if (!g.image && p.image_url) g.image = p.image_url;
      } else {
        map.set(key, {
          key,
          brand: p.brand,
          model: p.model,
          color: p.color,
          image: p.image_url,
          priceFrom: price,
          totalStock: p.quantity,
          variants: [p],
        });
      }
    }
    return [...map.values()];
  }, [products]);

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .filter((g) => (brand === "all" ? true : g.brand === brand))
      .filter(
        (g) =>
          !q ||
          g.brand.toLowerCase().includes(q) ||
          g.model.toLowerCase().includes(q) ||
          (g.color ?? "").toLowerCase().includes(q) ||
          g.variants.some(
            (v) =>
              v.sku.toLowerCase().includes(q) ||
              v.barcode.toLowerCase().includes(q),
          ),
      )
      .slice(0, 80);
  }, [groups, brand, query]);

  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, l) => s + l.qty * l.unit_price, 0);
    return { subtotal, total: Math.max(0, subtotal - discount) };
  }, [cart, discount]);

  function addProduct(product: PosProduct) {
    setCart((current) => {
      const found = current.find((l) => l.product.id === product.id);
      if (found) {
        return current.map((l) =>
          l.product.id === product.id
            ? { ...l, qty: Math.min(l.qty + 1, product.quantity) }
            : l,
        );
      }
      return [...current, { product, qty: 1, unit_price: unitPrice(product) }];
    });
  }

  function scan() {
    const code = barcode.trim();
    if (!code) return;
    const product = products.find((p) => p.barcode === code || p.sku === code);
    if (!product) return toast.push("Barcode/SKU tidak ditemukan", "error");
    if (product.quantity <= 0) return toast.push("Stok habis", "error");
    addProduct(product);
    setBarcode("");
  }

  function setQty(productId: string, qty: number) {
    setCart((current) =>
      current
        .map((l) =>
          l.product.id === productId
            ? { ...l, qty: Math.max(0, Math.min(qty, l.product.quantity)) }
            : l,
        )
        .filter((l) => l.qty > 0),
    );
  }

  function clearCart() {
    setCart([]);
    setDiscount(0);
    setCustomer(null);
  }

  function checkout(payment: PosPaymentResult) {
    const customerName = customer?.name ?? "Walk-in Customer";
    const snapshot = {
      customer_name: customerName,
      payment_label: PAYMENT_LABELS[payment.payment_method] ?? "Lainnya",
      lines: cart.map((l) => ({
        name: `${l.product.brand} ${l.product.model}${l.product.color ? ` ${l.product.color}` : ""} · ${l.product.size}`,
        qty: l.qty,
        price: l.unit_price,
      })),
      subtotal: totals.subtotal,
      discount,
      total: totals.total,
      paid: payment.cash_received,
      change: Math.max(0, payment.cash_received - totals.total),
    };

    startTransition(async () => {
      const result = await posCheckout({
        customer_name: customerName,
        customer_id: customer?.id,
        invoice_date: today(),
        payment_method: payment.payment_method,
        bank_account_id: payment.bank_account_id,
        discount,
        tax: 0,
        notes: "POS Kasir Offline",
        lines: cart.map((l) => ({
          product_id: l.product.id,
          qty: l.qty,
          unit_price: l.unit_price,
        })),
      });

      const message = actionError(result);
      if (message) return toast.push(message || "Checkout gagal", "error");

      const data = (result as {
        data: { invoice_number: string; payment_number: string };
      }).data;

      setReceipt({
        invoice_number: data.invoice_number,
        payment_number: data.payment_number,
        date: new Date().toISOString(),
        cashier: cashierName,
        ...snapshot,
      });
      setShowPayment(false);
      setCart([]);
      setDiscount(0);
      setCustomer(null);
      router.refresh();
      toast.push("Checkout POS berhasil", "success");
    });
  }

  return (
    <div className="flex h-full min-h-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900">
      {/* LEFT — search + grid */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 p-4">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-300" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari produk, brand, warna…"
              className="h-12 w-full rounded-xl border-none bg-slate-50 pl-11 pr-3 text-sm font-bold text-slate-900 shadow-inner outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-[#E5484D]/30"
            />
          </div>
          <div className="relative w-48">
            <ScanBarcode className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-300" />
            <input
              ref={barcodeRef}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && scan()}
              placeholder="Scan barcode"
              className="h-12 w-full rounded-xl border-none bg-slate-50 pl-11 pr-3 text-sm font-bold text-slate-900 shadow-inner outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-[#E5484D]/30"
            />
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Pengaturan struk"
            className="grid size-12 place-items-center rounded-xl bg-slate-50 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <Settings2 className="size-4" />
          </button>
        </div>

        {brands.length > 1 ? (
          <div className="flex items-center gap-1 overflow-x-auto px-4 pb-3">
            <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1.5 shadow-inner">
              {brands.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBrand(b)}
                  className={cn(
                    "h-8 whitespace-nowrap rounded-xl px-4 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95",
                    brand === b
                      ? "bg-white text-slate-900 shadow-md ring-1 ring-black/5"
                      : "text-slate-400 hover:text-slate-600",
                  )}
                >
                  {b === "all" ? "Semua" : b}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {visibleGroups.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 text-center">
              <Package className="mb-3 size-10 text-slate-300" />
              <p className="text-sm font-bold text-slate-700">Produk tidak ditemukan</p>
              <p className="mt-1 text-xs text-slate-400">Coba ubah kata kunci atau brand.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {visibleGroups.map((g) => (
                <PosProductCard key={g.key} group={g} onAdd={addProduct} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — cart */}
      <div className="hidden w-[340px] flex-col border-l border-slate-200 bg-slate-50 md:flex xl:w-[380px]">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center gap-2">
            <ShoppingCart className="size-4 text-slate-900" />
            <span className="text-sm font-black uppercase tracking-widest">Keranjang</span>
          </div>
          {cart.length > 0 ? (
            <button
              type="button"
              onClick={clearCart}
              className="text-[10px] font-black uppercase tracking-wide text-rose-500 hover:text-rose-600"
            >
              Kosongkan
            </button>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {cart.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-slate-300">
              <Package className="mb-3 size-10 stroke-[1.25px]" />
              <p className="text-[10px] font-black uppercase tracking-[0.3em]">Keranjang kosong</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {cart.map((l) => (
                <div
                  key={l.product.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-2.5 shadow-sm animate-in fade-in slide-in-from-right-4 duration-300"
                >
                  <div className="size-10 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                    {l.product.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={l.product.image_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full place-items-center">
                        <Package className="size-4 text-slate-300" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-black uppercase leading-tight text-slate-800">
                      {l.product.brand} {l.product.model}
                    </p>
                    <p className="mt-0.5 text-[11px] font-black tabular-nums tracking-tighter text-slate-400">
                      Size {l.product.size} · {rp(l.unit_price)}
                    </p>
                  </div>
                  <div className="flex h-9 items-center rounded-xl border border-slate-100 bg-slate-50 p-1">
                    <button
                      type="button"
                      onClick={() => setQty(l.product.id, l.qty - 1)}
                      className="grid size-6 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-900"
                    >
                      <Minus className="size-3" />
                    </button>
                    <span className="w-6 text-center text-xs font-black tabular-nums text-slate-900">
                      {l.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQty(l.product.id, l.qty + 1)}
                      className="grid size-6 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-900"
                    >
                      <Plus className="size-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-slate-200 bg-white p-4 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.06)]">
          <PosCustomerCombobox
            customers={customers}
            selected={customer}
            onSelect={setCustomer}
            onCreated={(c) => setCustomers((cur) => [c, ...cur])}
          />

          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-black uppercase tracking-widest text-slate-300">
              Diskon
            </span>
            <NumberInput
              min={0}
              value={discount || ""}
              onValueChange={(value) => setDiscount(Math.max(0, value))}
              placeholder="0"
              className="h-10 w-full rounded-xl !border-none !bg-slate-50 pl-16 pr-3 text-right text-sm font-black tabular-nums !text-slate-900 outline-none focus:!ring-0"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                Subtotal
              </span>
              <span className="text-xs font-black tabular-nums text-slate-500">
                {rp(totals.subtotal)}
              </span>
            </div>
            <div className="flex items-end justify-between border-t border-slate-50 px-1 pt-2">
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-900">
                Total
              </span>
              <span className="text-2xl font-black tabular-nums tracking-tighter text-slate-900">
                {rp(totals.total)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowPayment(true)}
            disabled={cart.length === 0}
            className="h-14 w-full rounded-xl bg-[#E5484D] text-xs font-black uppercase tracking-[0.16em] text-white shadow-xl shadow-rose-100 transition-all hover:bg-[#d83b40] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Bayar
          </button>
        </div>
      </div>

      <PosPaymentModal
        open={showPayment}
        onClose={() => setShowPayment(false)}
        total={totals.total}
        bankAccounts={bankAccounts}
        processing={pending}
        onConfirm={checkout}
      />

      {receipt ? (
        <PosReceipt
          sale={receipt}
          settings={receiptSettings}
          onClose={() => setReceipt(null)}
        />
      ) : null}

      <PosReceiptSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initial={receiptSettings}
      />
    </div>
  );
}
