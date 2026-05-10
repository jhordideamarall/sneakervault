"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Search, Package, ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@sneakervault/supabase/client";

type Product = { id: string; brand: string; model: string; size: number; barcode: string; image_url: string | null; quantity: number };
type Order = { id: string; order_number: string; platform: string; status: string; created_at: string };

export function SearchBar() {
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState(-1);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  const totalResults = products.length + orders.length;

  const search = useCallback((q: string) => {
    if (q.length < 2) { setProducts([]); setOrders([]); return; }
    setLoading(true);
    const supabase = createClient();
    const pattern = `%${q}%`;

    Promise.all([
      supabase
        .from("products")
        .select("id, brand, model, size, barcode, image_url, quantity")
        .or(`brand.ilike.${pattern},model.ilike.${pattern},barcode.ilike.${pattern}`)
        .limit(6),
      supabase
        .from("packing_sessions")
        .select("id, platform_order_id, platform, status, created_at")
        .ilike("platform_order_id", pattern)
        .limit(4),
    ]).then(([prodRes, orderRes]) => {
      setProducts((prodRes.data ?? []) as Product[]);
      setOrders((orderRes.data ?? []).map(o => ({
        id: o.id,
        order_number: o.platform_order_id,
        platform: o.platform,
        status: o.status,
        created_at: o.created_at
      })) as Order[]);
      setSelected(-1);
    }).finally(() => setLoading(false));
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(val), 100);
  };

  const navigate = (idx: number) => {
    if (idx < products.length) router.push(`/inventory`);
    else router.push(`/orders`);
    close();
  };

  const close = () => {
    setFocused(false);
    setQuery("");
    setProducts([]);
    setOrders([]);
    inputRef.current?.blur();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, totalResults - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelected(s => Math.max(s - 1, -1)); }
    else if (e.key === "Enter" && selected >= 0) { e.preventDefault(); navigate(selected); }
    else if (e.key === "Escape") close();
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      {focused && createPortal(
        <div className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-md" onClick={close} />,
        document.body
      )}

      <div className="relative z-[9999] transition-all duration-500 ease-out" style={{ width: focused ? "100%" : "50%" }}>
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => handleChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onKeyDown={handleKey}
            placeholder="Cari produk, order, atau barcode... ⌘K"
            className={`w-full rounded-2xl border py-3.5 pl-12 pr-5 text-sm text-white/90 placeholder:text-white/30 focus:outline-none transition-all duration-500 ${
              focused
                ? "border-white/[0.1] bg-[#2a2a2a] shadow-2xl shadow-black/50 ring-1 ring-white/[0.08]"
                : "border-white/[0.06] bg-white/[0.03]"
            }`}
          />
        </div>

        {focused && query.length >= 2 && (
          <div className="absolute top-full left-0 right-0 mt-2 rounded-2xl border border-white/[0.08] bg-[#2a2a2a] shadow-2xl shadow-black/50 overflow-hidden">
            {loading && <p className="px-5 py-4 text-xs text-white/30">Mencari...</p>}
            {!loading && totalResults === 0 && <p className="px-5 py-4 text-xs text-white/30">Tidak ditemukan</p>}

            {products.length > 0 && (
              <div className="px-3 pt-3 pb-1">
                <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-white/25">Produk</p>
                {products.map((p, i) => (
                  <button
                    key={p.id}
                    onMouseDown={() => navigate(i)}
                    onMouseEnter={() => setSelected(i)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${selected === i ? "bg-white/[0.06]" : ""}`}
                  >
                    {p.image_url ? (
                      <img src={p.image_url} className="h-9 w-9 rounded-lg object-cover" alt="" />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.05]"><Package size={14} className="text-white/30" /></div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white/80 truncate">{p.brand} {p.model}</p>
                      <p className="text-[11px] text-white/30">Size {p.size} · {p.barcode}</p>
                    </div>
                    <span className="text-[11px] text-white/25">{p.quantity} stok</span>
                  </button>
                ))}
              </div>
            )}

            {orders.length > 0 && (
              <div className="px-3 pt-2 pb-3 border-t border-white/[0.04]">
                <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-white/25">Order</p>
                {orders.map((o, i) => {
                  const idx = products.length + i;
                  return (
                    <button
                      key={o.id}
                      onMouseDown={() => navigate(idx)}
                      onMouseEnter={() => setSelected(idx)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${selected === idx ? "bg-white/[0.06]" : ""}`}
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.05]"><ShoppingBag size={14} className="text-white/30" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white/80 truncate">{o.order_number}</p>
                        <p className="text-[11px] text-white/30">{o.platform} · {o.status}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
