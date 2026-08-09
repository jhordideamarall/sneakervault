import { Package } from "lucide-react";
import { cn } from "@sneakervault/ui";
import { formatRupiah as rp } from "@/lib/format";

export type PosProduct = {
  id: string;
  brand: string;
  model: string;
  sku: string;
  barcode: string;
  size: number | null;
  size_label?: string | null;
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

/** Prevent imported rows such as brand=Adidas, model="Adidas Samba" from
 * rendering as "Adidas Adidas Samba" without mutating the master data. */
export function posModelLabel(brand: string, model: string) {
  const cleanBrand = brand.trim();
  const cleanModel = model.trim();
  const prefix = `${cleanBrand.toLocaleLowerCase("id-ID")} `;

  if (cleanBrand && cleanModel.toLocaleLowerCase("id-ID").startsWith(prefix)) {
    return cleanModel.slice(cleanBrand.length).trim() || cleanModel;
  }

  return cleanModel;
}

/**
 * One card per model+color. Sneaker sizes are tap-to-add chips.
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
  const modelLabel = posModelLabel(group.brand, group.model);
  const sizes = [...group.variants].sort(
    (a, b) => Number(a.size ?? 0) - Number(b.size ?? 0),
  );

  return (
    <div
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-xl border bg-[#262626] transition-all duration-200",
        out
          ? "border-white/[0.04] opacity-60"
          : "border-white/[0.08] hover:border-white/[0.16] hover:bg-[#2b2b2b]",
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden border-b border-white/[0.06] bg-white/[0.03]">
        {group.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={group.image}
            alt={`${group.brand} ${modelLabel}`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {initials === "?" ? (
              <Package aria-hidden="true" className="size-8 text-white/20" />
            ) : (
              <span aria-hidden="true" className="text-3xl font-black tracking-tighter text-white/60">
                {initials}
              </span>
            )}
          </div>
        )}
        <span
          className={cn(
            "absolute right-2 top-2 inline-flex items-center rounded-full px-2 py-1 text-[9px] font-black uppercase tabular-nums tracking-tight",
            out
              ? "bg-white/[0.08] text-white/35"
              : group.totalStock <= 5
                ? "bg-rose-500/10 text-rose-300"
                : "bg-emerald-500/10 text-emerald-300",
          )}
        >
          {out ? "Habis" : `${group.totalStock} stok`}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-3">
        <div>
          <h3
            className="line-clamp-2 min-h-[2rem] text-[12px] font-black uppercase leading-tight tracking-tight text-white/90"
            title={`${group.brand} ${modelLabel}`}
          >
            {group.brand} {modelLabel}
          </h3>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="truncate text-[10px] font-bold uppercase tracking-tight text-white/60">
              {group.color ?? "—"}
            </span>
            <span className="shrink-0 text-[13px] font-black tabular-nums tracking-tighter text-white">
              {rp(group.priceFrom)}
            </span>
          </div>
        </div>

        <div className="mt-auto border-t border-white/[0.05] pt-2.5">
          <div className="flex max-h-[4.25rem] flex-wrap gap-1.5 overflow-y-auto pr-1">
            {sizes.map((v) => {
              const disabled = v.quantity <= 0;
              const sizeLabel =
                v.size_label ??
                (v.size == null
                  ? "-"
                  : Number(v.size).toFixed(2).replace(/\.?0+$/, ""));
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onAdd(v)}
                  title={`Size ${sizeLabel} · stok ${v.quantity}`}
                  aria-label={`${group.brand} ${modelLabel}, size ${sizeLabel}, stok ${v.quantity}`}
                  className={cn(
                    "h-7 min-w-[38px] shrink-0 rounded-lg px-2 text-[11px] font-black tabular-nums transition-all active:scale-95",
                    disabled
                      ? "cursor-not-allowed bg-white/[0.03] text-white/20 line-through"
                      : "bg-white/[0.06] text-white/75 hover:bg-[#E5484D] hover:text-white",
                  )}
                >
                  {sizeLabel}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
