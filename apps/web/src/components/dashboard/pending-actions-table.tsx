import Link from "next/link";
import { createClient } from "@sneakervault/supabase/server";

type PendingItem = {
  type: "retur" | "delete" | "stok_rendah";
  detail: string;
  from: string;
  time: string;
  href: string;
};

type ProductSummary = { brand: string; model: string; size: number };
type ProfileSummary = { full_name: string };

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function PendingActionsTable() {
  const supabase = await createClient();
  const items: PendingItem[] = [];

  // Pending returns
  const { data: returns } = await supabase
    .from("returns")
    .select("id, reason, created_at, packing_items(products(brand, model, size)), profiles:initiated_by(full_name)")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(5);

  for (const r of returns ?? []) {
    const product = (r.packing_items as { products?: ProductSummary | null } | null)?.products;
    const profile = firstRelation(r.profiles as unknown as ProfileSummary[] | ProfileSummary | null);
    items.push({
      type: "retur",
      detail: product ? `${product.brand} ${product.model} (${product.size})` : r.reason || "Retur",
      from: profile?.full_name ?? "—",
      time: r.created_at,
      href: "/returns",
    });
  }

  // Pending delete requests
  const { data: deletes } = await supabase
    .from("delete_requests")
    .select("id, entity_type, reason, created_at, profiles:requested_by(full_name)")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(5);

  for (const d of deletes ?? []) {
    const profile = firstRelation(d.profiles as unknown as ProfileSummary[] | ProfileSummary | null);
    items.push({
      type: "delete",
      detail: `Hapus ${d.entity_type}${d.reason ? ` — "${d.reason}"` : ""}`,
      from: profile?.full_name ?? "—",
      time: d.created_at,
      href: "/delete-requests",
    });
  }

  // Low stock products
  const { data: lowStock } = await supabase
    .from("products")
    .select("id, brand, model, size, quantity")
    .eq("is_active", true)
    .lt("quantity", 3)
    .gt("quantity", 0)
    .order("quantity", { ascending: true })
    .limit(5);

  for (const p of lowStock ?? []) {
    items.push({
      type: "stok_rendah",
      detail: `${p.brand} ${p.model} (${p.size}) — sisa ${p.quantity} pcs`,
      from: "Sistem",
      time: new Date().toISOString(),
      href: "/inventory",
    });
  }

  // Sort by time descending
  items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
        <p className="text-sm text-white/30">Tidak ada item pending — semua beres</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <div className="px-6 py-4 border-b border-white/[0.04]">
        <p className="text-sm font-medium text-white/80">Perlu Perhatian</p>
        <p className="text-[11px] text-white/30">Item yang menunggu keputusan kamu</p>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/[0.04] text-[11px] uppercase tracking-wider text-white/30">
            <th className="px-6 py-3 text-left font-medium">Tipe</th>
            <th className="px-6 py-3 text-left font-medium">Detail</th>
            <th className="px-6 py-3 text-left font-medium">Dari</th>
            <th className="px-6 py-3 text-right font-medium">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 10).map((item, i) => (
            <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
              <td className="px-6 py-3">
                <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${typeStyle[item.type]}`}>
                  {typeLabel[item.type]}
                </span>
              </td>
              <td className="px-6 py-3 text-[13px] text-white/70 max-w-[300px] truncate">{item.detail}</td>
              <td className="px-6 py-3 text-[12px] text-white/40">{item.from}</td>
              <td className="px-6 py-3 text-right">
                <Link href={item.href} className="text-[11px] font-medium text-blue-400 hover:text-blue-300 transition-colors">
                  Tinjau →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const typeLabel: Record<string, string> = {
  retur: "Retur",
  delete: "Hapus",
  stok_rendah: "Stok",
};

const typeStyle: Record<string, string> = {
  retur: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  delete: "bg-red-500/10 text-red-400 border border-red-500/20",
  stok_rendah: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
};
