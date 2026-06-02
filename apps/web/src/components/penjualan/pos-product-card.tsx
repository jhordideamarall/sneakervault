import { Package } from "lucide-react";
import { cn } from "@sneakervault/ui";

export type PosProduct = {
  id: string;
  brand: string;
  model: string;
  sku: string;
  barcode: string;
  size: number;
  color: string | null;
  quantity: number;
  sell_price: number;
  price_offline: number;
  image_url: string | null;
};

export type PosGroup = {
  key: string;
  brand: string;
  model: string;
  color: string | null;
  image: string | null;
  priceFrom: number;
  totalStock: number;
  variants: PosProduct[];
};

const rp = (v: number) => `Rp ${Number(v).toLocaleString("id-ID")}`;

/**
 * One card per model+color, in the aegis-pos visual language (font-black,
 * uppercase, slate, rounded-2xl). Sneaker sizes are tap-to-add chips.
 */
export function PosProductCard({
  group,
  onAdd,
}: {
  group: PosGroup;
  onAdd: (product: PosProduct) => void;
}) {
  const out = group.totalStock <= 0;
  const initials = (group.brand || "?").slice(0, 2).toUpperCase();
  const sizes = [...group.variants].sort((a, b) => a.size - b.size);

  return (
    <div
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-2xl border bg-white transition-all duration-200",
        out
          ? "border-slate-100 opacity-60"
          : "border-slate-200 hover:border-slate-300 hover:shadow-[0_16px_38px_-22px_rgba(15,23,42,0.45)]",
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden border-b border-slate-100 bg-gradient-to-br from-slate-50 to-slate-100">
        {group.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={group.image}
            alt={`${group.brand} ${group.model}`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {initials === "?" ? (
              <Package className="size-8 text-slate-200" />
            ) : (
              <span className="text-3xl font-black tracking-tighter text-slate-200">
                {initials}
              </span>
            )}
          </div>
        )}
        <span
          className={cn(
            "absolute right-2 top-2 inline-flex items-center rounded-full px-2 py-1 text-[9px] font-black uppercase tabular-nums tracking-tight",
            out
              ? "bg-slate-200 text-slate-500"
              : group.totalStock <= 5
                ? "bg-rose-50 text-rose-600"
                : "bg-emerald-50 text-emerald-700",
          )}
        >
          {out ? "Habis" : `${group.totalStock} stok`}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-3.5">
        <div>
          <h3
            className="line-clamp-1 text-xs font-black uppercase tracking-tight text-slate-900"
            title={`${group.brand} ${group.model}`}
          >
            {group.brand} {group.model}
          </h3>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="truncate text-[10px] font-bold uppercase tracking-tight text-slate-400">
              {group.color ?? "—"}
            </span>
            <span className="shrink-0 text-sm font-black tabular-nums tracking-tighter text-slate-900">
              {rp(group.priceFrom)}
            </span>
          </div>
        </div>

        <div className="mt-auto flex flex-wrap gap-1 border-t border-slate-50 pt-2.5">
          {sizes.map((v) => {
            const disabled = v.quantity <= 0;
            return (
              <button
                key={v.id}
                type="button"
                disabled={disabled}
                onClick={() => onAdd(v)}
                title={`Size ${v.size} · stok ${v.quantity}`}
                className={cn(
                  "min-w-[34px] rounded-lg px-2 py-1.5 text-[11px] font-black tabular-nums transition-all active:scale-95",
                  disabled
                    ? "cursor-not-allowed bg-slate-50 text-slate-300 line-through"
                    : "bg-slate-100 text-slate-700 hover:bg-[#E5484D] hover:text-white",
                )}
              >
                {v.size}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
