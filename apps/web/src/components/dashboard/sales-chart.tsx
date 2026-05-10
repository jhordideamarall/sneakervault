"use client";

import { Bar, Line, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

type WeekData = { week: string; terjual: number; nike: number; adidas: number; nb: number };

function getColor(value: number, max: number) {
  const ratio = max > 0 ? value / max : 0;
  if (ratio >= 0.7) return "#8b5cf6";
  if (ratio >= 0.4) return "#22c55e";
  return "#eab308";
}

export function SalesChart({ data }: { data: WeekData[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
        <p className="text-sm text-white/30">Belum ada data penjualan</p>
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.terjual, 0);
  const max = Math.max(...data.map(d => d.terjual));

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white/70">Penjualan 6 Bulan Terakhir</h2>
          <p className="text-xs text-white/30 mt-0.5">Bar = total · Line = per brand</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-white/90">{total}</p>
          <p className="text-[10px] text-white/30">total terjual</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mb-5">
        <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#8b5cf6]" /><span className="text-[10px] text-white/35">Tinggi</span></div>
        <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#22c55e]" /><span className="text-[10px] text-white/35">Cukup</span></div>
        <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#eab308]" /><span className="text-[10px] text-white/35">Rendah</span></div>
        <span className="text-white/10">|</span>
        <div className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[#f97316]" /><span className="text-[10px] text-white/35">Nike</span></div>
        <div className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[#3b82f6]" /><span className="text-[10px] text-white/35">Adidas</span></div>
        <div className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[#a78bfa]" /><span className="text-[10px] text-white/35">New Balance</span></div>
      </div>

      {/* Combined Chart */}
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data.map(d => ({
          ...d,
          nikeOffset: d.nike + max,
          adidasOffset: d.adidas + max,
          nbOffset: d.nb + max,
        }))} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="week"
            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            interval={3}
          />
          <YAxis
            tick={false}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1c1c1e",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "12px",
              fontSize: "11px",
              color: "rgba(255,255,255,0.8)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            formatter={(value: number, name: string) => {
              if (name === "Nike" || name === "Adidas" || name === "New Balance") return [value - max, name];
              return [value, name];
            }}
          />
          <Bar dataKey="terjual" name="Total" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={getColor(d.terjual, max)} />
            ))}
          </Bar>
          <Line dataKey="nikeOffset" name="Nike" type="monotone" stroke="#f97316" strokeWidth={2.5} dot={false} />
          <Line dataKey="adidasOffset" name="Adidas" type="monotone" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
          <Line dataKey="nbOffset" name="New Balance" type="monotone" stroke="#a78bfa" strokeWidth={2.5} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
