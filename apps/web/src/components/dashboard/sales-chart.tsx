"use client";

import { Bar, Line, BarChart as ReBarChart, LineChart as ReLineChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type WeekData = Record<string, number | string>;

const BAR_COLORS = [
  "#8b5cf6", "#22c55e", "#eab308", "#ef4444", "#3b82f6", "#f97316", 
  "#a78bfa", "#06b6d4", "#ec4899", "#84cc16", "#f43f5e", "#14b8a6"
];
const LINE_COLORS = [
  "#f97316", "#3b82f6", "#a78bfa", "#06b6d4", "#ec4899", "#84cc16", 
  "#f43f5e", "#14b8a6", "#fbbf24", "#6366f1", "#d946ef", "#8b5cf6"
];

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#1c1c1e] px-4 py-3 shadow-2xl shadow-black/40">
      <p className="text-[11px] font-medium text-white/60 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
            <span className="text-[11px] text-white/70">{p.name}</span>
          </div>
          <span className="text-[11px] font-semibold text-white">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function SalesChart({ 
  data, 
  brands, 
  models,
  granularity = "week"
}: { 
  data: WeekData[]; 
  brands: string[]; 
  models: string[];
  granularity?: "week" | "day";
}) {
  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
        <p className="text-sm text-white/30">Belum ada data penjualan tercatat</p>
      </div>
    );
  }

  const activeBrands = brands.filter(b => data.some(d => (Number(d[b]) || 0) > 0));
  const total = data.reduce((sum, d) => sum + (Number(d.terjual) || 0), 0);
  
  const modelTotals = models.map(m => ({ 
    name: m, 
    totalSales: data.reduce((s, d) => s + (Number(d[m]) || 0), 0) 
  })).filter(m => m.totalSales > 0).sort((a, b) => b.totalSales - a.totalSales);
  
  // Show ALL models that have sales, no more limit
  const activeModels = modelTotals.map(m => m.name);

  const cumData = (() => {
    const cum: Record<string, number> = {};
    activeModels.forEach(m => { cum[m] = 0; });
    return data.map(d => {
      const row: Record<string, number | string> = { ...d };
      activeModels.forEach(m => {
        cum[m] = (cum[m] ?? 0) + (Number(d[m]) || 0);
        row[`cum_${m}`] = cum[m]!;
      });
      return row;
    });
  })();

  return (
    <div className="space-y-6">
      {/* Bar Chart: Weekly Distribution per Brand */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-white/70">Distribusi Penjualan {granularity === "day" ? "Harian" : "Mingguan"}</h2>
            <p className="text-xs text-white/30 mt-0.5">Volume unit keluar per brand di setiap {granularity === "day" ? "hari" : "minggu"}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-white/90">{total}</p>
            <p className="text-[10px] text-white/30">unit terjual</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-5">
          {activeBrands.map((b, i) => (
            <div key={b} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
              <span className="text-[10px] text-white/35">{b}</span>
            </div>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <ReBarChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="week" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            {activeBrands.map((b, i) => (
              <Bar key={b} dataKey={b} name={b} stackId="a" fill={BAR_COLORS[i % BAR_COLORS.length]} radius={i === activeBrands.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]} barSize={20} />
            ))}
          </ReBarChart>
        </ResponsiveContainer>
      </div>

      {/* Line Chart: Cumulative Trends per Model */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-white/70">Akumulasi Penjualan per Model</h2>
          <p className="text-xs text-white/30 mt-0.5">Tren pertumbuhan total unit terjual seluruh model</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-5">
          {activeModels.map((m, i) => (
            <div key={m} className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded" style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }} />
              <span className="text-[10px] text-white/35">{m}</span>
            </div>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={240}>
          <ReLineChart data={cumData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="week" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }} />
            {activeModels.map((m, i) => (
              <Line key={m} dataKey={`cum_${m}`} name={m} type="monotone" stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
            ))}
          </ReLineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
