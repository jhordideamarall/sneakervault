"use client";

import {
  Bar, Line, BarChart, LineChart, PieChart, Pie, Cell,
  CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

const COLORS = ["#8b5cf6", "#22c55e", "#3b82f6", "#eab308", "#ef4444", "#f97316", "#06b6d4", "#ec4899"];

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#1c1c1e] px-4 py-3 shadow-2xl">
      {label && <p className="text-[11px] text-white/60 mb-2">{label}</p>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
            <span className="text-[11px] text-white/70">{p.name}</span>
          </div>
          <span className="text-[11px] font-semibold text-white">
            {typeof p.value === "number" ? `Rp ${p.value.toLocaleString("id-ID")}` : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function RevenueChart({ data }: { data: { month: string; revenue: number; profit: number }[] }) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
      <div className="mb-4">
        <p className="text-sm font-medium text-white/80">Revenue vs Profit</p>
        <p className="text-[11px] text-white/30">Tren keuangan bulanan — apakah margin membaik atau memburuk</p>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} />
          <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickFormatter={(v) => `${(v / 1000000).toFixed(0)}jt`} />
          <Tooltip content={<ChartTooltip />} />
          <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={false} name="Revenue" />
          <Line type="monotone" dataKey="profit" stroke="#22c55e" strokeWidth={2} dot={false} name="Profit" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StockPieChart({ data }: { data: { brand: string; value: number; units: number }[] }) {
  if (data.length === 0) return <EmptyChart />;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
      <div className="mb-4">
        <p className="text-sm font-medium text-white/80">Distribusi Stok per Brand</p>
        <p className="text-[11px] text-white/30">Proporsi modal terikat — bantu keputusan restock</p>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="brand" cx="50%" cy="50%" outerRadius={80} strokeWidth={0}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-3 mt-2">
        {data.slice(0, 5).map((d, i) => (
          <div key={d.brand} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            <span className="text-[10px] text-white/50">{d.brand} ({((d.value / total) * 100).toFixed(0)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TopProductsChart({ data }: { data: { name: string; count: number }[] }) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
      <div className="mb-4">
        <p className="text-sm font-medium text-white/80">Top 5 Produk Terlaris</p>
        <p className="text-[11px] text-white/30">Produk paling laku — prioritas restock</p>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
          <XAxis type="number" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} />
          <YAxis type="category" dataKey="name" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} axisLine={false} width={100} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Terjual" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeeklySalesChart({ data }: { data: { week: string; terjual: number }[] }) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
      <div className="mb-4">
        <p className="text-sm font-medium text-white/80">Volume Penjualan Mingguan</p>
        <p className="text-[11px] text-white/30">Unit keluar per minggu — deteksi tren seasonal</p>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="week" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} />
          <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="terjual" fill="#22c55e" radius={[4, 4, 0, 0]} name="Unit terjual" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 flex items-center justify-center h-[300px]">
      <p className="text-sm text-white/20">Belum ada data</p>
    </div>
  );
}
