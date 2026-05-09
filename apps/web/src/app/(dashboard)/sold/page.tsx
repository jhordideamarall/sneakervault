import { getSoldHistory } from "@/lib/queries";
import { PLATFORMS, COURIERS } from "@sneakervault/shared";
import { Card } from "@sneakervault/ui";
import { ExportButtons } from "@/components/export-buttons";

type SoldSession = Record<string, unknown> & {
  id: string;
  platform: string;
  courier: string;
  platform_order_id: string | null;
  completed_at: string | null;
  created_at: string;
  packing_items: {
    id: string;
    sell_price: number;
    unit_hpp: number;
    products?: { brand: string; model: string; size: number } | null;
  }[];
  profiles?: { full_name: string } | null;
};

export default async function SoldPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { data } = await getSoldHistory({
    platform: sp.platform,
    courier: sp.courier,
    limit: 100,
  });

  const sessions = data as SoldSession[];

  // Totals
  let totalItems = 0;
  let totalRevenue = 0;
  let totalProfit = 0;
  for (const s of sessions) {
    for (const i of s.packing_items ?? []) {
      totalItems += 1;
      totalRevenue += Number(i.sell_price ?? 0);
      totalProfit += Number(i.sell_price ?? 0) - Number(i.unit_hpp ?? 0);
    }
  }

  // Flatten rows for export
  const exportRows: (string | number)[][] = [];
  for (const s of sessions) {
    for (const i of s.packing_items ?? []) {
      exportRows.push([
        s.completed_at ? new Date(s.completed_at).toLocaleDateString("id-ID") : "",
        s.platform_order_id ?? "",
        s.platform,
        s.courier,
        i.products?.brand ?? "",
        i.products?.model ?? "",
        i.products?.size ?? "",
        Number(i.sell_price),
        Number(i.unit_hpp),
        Number(i.sell_price) - Number(i.unit_hpp),
      ]);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1a1a2e]">💰 Riwayat Terjual</h1>
        <ExportButtons
          title="Riwayat Terjual"
          sheetName="Sold"
          columns={["Tanggal", "Order ID", "Platform", "Kurir", "Brand", "Model", "Size", "Harga Jual", "HPP", "Profit"]}
          rows={exportRows}
          subtitle={`${totalItems} item · Rp ${totalRevenue.toLocaleString("id-ID")} · Profit Rp ${totalProfit.toLocaleString("id-ID")}`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-[#6b7280]">Item Terjual</p>
          <p className="mt-1 text-2xl font-bold text-[#1a1a2e]">{totalItems}</p>
        </Card>
        <Card>
          <p className="text-sm text-[#6b7280]">Pendapatan</p>
          <p className="mt-1 text-2xl font-bold text-[#1a1a2e]">Rp {totalRevenue.toLocaleString("id-ID")}</p>
        </Card>
        <Card>
          <p className="text-sm text-[#6b7280]">Profit</p>
          <p className="mt-1 text-2xl font-bold text-green-600">Rp {totalProfit.toLocaleString("id-ID")}</p>
        </Card>
      </div>

      <form className="flex items-center gap-3">
        <select name="platform" defaultValue={sp.platform ?? ""} className="rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm">
          <option value="">Semua Platform</option>
          {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select name="courier" defaultValue={sp.courier ?? ""} className="rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm">
          <option value="">Semua Kurir</option>
          {COURIERS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <button type="submit" className="rounded-lg bg-[#1a1a2e] px-4 py-2 text-sm text-white hover:bg-[#16213e]">
          Terapkan
        </button>
      </form>

      <div className="rounded-xl border border-[#e5e7eb] bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-[#e5e7eb] bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Tanggal Selesai</th>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Order ID</th>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Platform</th>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Kurir</th>
              <th className="px-4 py-3 text-left font-medium text-[#6b7280]">Items</th>
              <th className="px-4 py-3 text-right font-medium text-[#6b7280]">Total Jual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e7eb]">
            {sessions.map((s) => {
              const items = s.packing_items ?? [];
              const totalSale = items.reduce((sum, i) => sum + Number(i.sell_price ?? 0), 0);
              return (
                <tr key={s.id} className="hover:bg-gray-50 align-top">
                  <td className="px-4 py-3 text-[#6b7280]">
                    {s.completed_at ? new Date(s.completed_at).toLocaleDateString("id-ID") : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{s.platform_order_id ?? "—"}</td>
                  <td className="px-4 py-3 capitalize">{s.platform}</td>
                  <td className="px-4 py-3 uppercase">{s.courier}</td>
                  <td className="px-4 py-3">
                    <ul className="space-y-0.5 text-xs text-[#6b7280]">
                      {items.map((i) => (
                        <li key={i.id}>
                          {i.products?.brand} {i.products?.model} size {i.products?.size}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">Rp {totalSale.toLocaleString("id-ID")}</td>
                </tr>
              );
            })}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[#6b7280]">
                  Belum ada penjualan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
