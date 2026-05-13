"use client";

import { Bar, BarChart as ReBarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, ScatterChart, Scatter, ZAxis } from "recharts";

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

// ─── Helpers ────────────────────────────────────────────────────────────

type TrendInfo = { dir: "up" | "down" | "flat" | "new" | "none"; pct: number };

/**
 * Compare current-period total vs previous-period total for one model.
 * - both zero → flat
 * - previous zero, current > 0 → new
 * - current zero, previous > 0 → down -100%
 * - else → percentage change, ±10% threshold for flat
 */
function computeTrend(current: number, previous: number): TrendInfo {
  if (current === 0 && previous === 0) return { dir: "flat", pct: 0 };
  if (previous === 0 && current > 0) return { dir: "new", pct: 0 };
  if (current === 0 && previous > 0) return { dir: "down", pct: -100 };
  const pct = Math.round(((current - previous) / previous) * 100);
  const dir = pct > 10 ? "up" : pct < -10 ? "down" : "flat";
  return { dir, pct };
}

export function SalesChart({ 
  data, 
  brands, 
  models,
  granularity = "week",
  previousTotals,
}: { 
  data: WeekData[]; 
  brands: string[]; 
  models: string[];
  granularity?: "week" | "day" | "hour";
  /** Units sold per model in the previous comparable period (yesterday / last month). */
  previousTotals?: Record<string, number>;
}) {
  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
        <p className="text-sm text-white/30">Belum ada data penjualan tercatat</p>
      </div>
    );
  }

  const granularityLabel = granularity === "hour" ? "per Jam" : granularity === "day" ? "Harian" : "Mingguan";
  const granularityUnit = granularity === "hour" ? "jam" : granularity === "day" ? "hari" : "minggu";

  const activeBrands = brands.filter(b => data.some(d => (Number(d[b]) || 0) > 0));
  const total = data.reduce((sum, d) => sum + (Number(d.terjual) || 0), 0);

  const modelTotals = models.map(m => ({
    name: m,
    totalSales: data.reduce((s, d) => s + (Number(d[m]) || 0), 0)
  })).filter(m => m.totalSales > 0).sort((a, b) => b.totalSales - a.totalSales);

  // Strip plot: each model gets its OWN horizontal lane (Y row). Sales events
  // show as dots on that lane's timeline. No overlap between models.
  const MAX_LANES = 12;
  const laneModels = modelTotals.slice(0, MAX_LANES);
  const hiddenModelCount = Math.max(0, modelTotals.length - MAX_LANES);

  // X axis is time — we index by position and tick-format back to the label.
  const xLabels = data.map(d => d.week as string);

  // One point per (period, model) that has sales. x = period index.
  type StripPoint = { x: number; model: string; units: number };
  const stripPoints: StripPoint[] = [];
  data.forEach((d, i) => {
    laneModels.forEach(({ name: m }) => {
      const units = Number(d[m]) || 0;
      if (units > 0) stripPoints.push({ x: i, model: m, units });
    });
  });

  // Y axis (model lane) is categorical. We also add an invisible "rail" dataset
  // per model to guarantee every lane shows up even if a model has no visible
  // dot in the current viewport.
  const modelNames = laneModels.map(m => m.name);

  // Tooltip that knows how to read scatter payloads with the period label.
  const ScatterTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0]?.payload as StripPoint | undefined;
    if (!p) return null;
    const period = xLabels[p.x] ?? "";
    const color = payload[0]?.color ?? payload[0]?.fill ?? "#fff";
    return (
      <div className="rounded-xl border border-white/[0.08] bg-[#1c1c1e] px-3 py-2 shadow-2xl shadow-black/40">
        <p className="text-[10px] text-white/50 mb-1">{period}</p>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-[11px] text-white/80">{p.model}</span>
          <span className="text-[11px] font-semibold text-white ml-auto">{p.units} unit</span>
        </div>
      </div>
    );
  };

  // Height scales with number of lanes for readability (row height ~36px).
  const LANE_HEIGHT = 36;
  const stripHeight = Math.max(160, modelNames.length * LANE_HEIGHT + 60);
  // Ensure X tick density stays readable for long periods.
  const xTickInterval = Math.max(0, Math.floor(data.length / 12));

  // ─── Trend per model (current period vs previous period) ────────────
  // If previousTotals is not provided (all-time view), trends stay "none".
  const trends: Record<string, TrendInfo> = {};
  laneModels.forEach(({ name: m, totalSales }) => {
    if (!previousTotals) {
      trends[m] = { dir: "none", pct: 0 };
      return;
    }
    trends[m] = computeTrend(totalSales, previousTotals[m] ?? 0);
  });

  // Y label width is shared between the YAxis and the custom tick positioning.
  const Y_LABEL_WIDTH = 140;

  // Custom Y axis tick: left-aligned trend badge + model name, color-coded.
  const trendColor = (dir: TrendInfo["dir"]) =>
    dir === "up" ? "#22c55e"
    : dir === "down" ? "#ef4444"
    : dir === "new" ? "#3b82f6"
    : "rgba(255,255,255,0.3)";
  const trendSymbol = (dir: TrendInfo["dir"]) =>
    dir === "up" ? "↑" : dir === "down" ? "↓" : dir === "new" ? "✦" : dir === "flat" ? "→" : "";

  const ModelTick = (props: any) => {
    const { x, y, payload } = props;
    const name = payload.value as string;
    const t = trends[name] ?? { dir: "none" as const, pct: 0 };

    // Left-align within the reserved label area (Y_LABEL_WIDTH), with 4px
    // padding so text doesn't touch the chart's edge.
    const leftX = -Y_LABEL_WIDTH + 4;

    // If there's no previous period to compare against, skip the badge entirely.
    const showBadge = t.dir !== "none";
    const badgeText = !showBadge
      ? ""
      : t.dir === "new"
      ? `${trendSymbol(t.dir)} NEW`
      : t.dir === "flat" && t.pct === 0
      ? `${trendSymbol(t.dir)} 0%`
      : `${trendSymbol(t.dir)} ${t.pct > 0 ? "+" : ""}${t.pct}%`;

    return (
      <g transform={`translate(${x},${y})`}>
        <text x={leftX} y={0} dy={4} textAnchor="start" fontSize={10} fontFamily="inherit">
          {showBadge && (
            <tspan fill={trendColor(t.dir)} fontWeight={700}>{badgeText} </tspan>
          )}
          <tspan fill="rgba(255,255,255,0.65)">{name}</tspan>
        </text>
      </g>
    );
  };

  return (
    <div className="space-y-6">
      {/* Bar Chart: Weekly Distribution per Brand */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-white/70">Distribusi Penjualan {granularityLabel}</h2>
            <p className="text-xs text-white/30 mt-0.5">Volume unit keluar per brand di setiap {granularityUnit}</p>
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

      {/* Strip Plot: each model on its own Y lane, sales as dots on timeline */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div className="mb-5">
          <h2 className="text-sm font-semibold text-white/70">Penjualan {granularityLabel} per Model</h2>
          <p className="text-xs text-white/30 mt-0.5">
            Titik = unit terjual · ukuran = jumlah unit
            {previousTotals && (
              <span className="ml-1">· trend kiri = {granularity === "hour" ? "vs hari sebelumnya" : granularity === "day" ? "vs bulan sebelumnya" : ""}</span>
            )}
            {hiddenModelCount > 0 && (
              <span className="ml-1">· top {MAX_LANES} dari {modelNames.length + hiddenModelCount} model</span>
            )}
          </p>
        </div>

        {modelNames.length === 0 ? (
          <p className="text-xs text-white/20 italic text-center py-8">Belum ada penjualan per model</p>
        ) : (
          <ResponsiveContainer width="100%" height={stripHeight}>
            <ScatterChart margin={{ top: 10, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                type="number"
                dataKey="x"
                domain={[-0.5, Math.max(0, data.length - 0.5)]}
                ticks={data.map((_, i) => i)}
                tickFormatter={(v: number) => xLabels[Math.round(v)] ?? ""}
                interval={xTickInterval}
                tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                allowDuplicatedCategory={false}
              />
              <YAxis
                type="category"
                dataKey="model"
                allowDuplicatedCategory={false}
                domain={modelNames}
                tick={<ModelTick />}
                axisLine={false}
                tickLine={false}
                width={Y_LABEL_WIDTH}
                interval={0}
                reversed
              />
              <ZAxis dataKey="units" range={[50, 320]} name="Units" />
              <Tooltip
                cursor={{ strokeDasharray: "3 3", stroke: "rgba(255,255,255,0.08)" }}
                content={<ScatterTooltip />}
              />
              {laneModels.map((m, i) => (
                <Scatter
                  key={m.name}
                  name={m.name}
                  data={stripPoints.filter(p => p.model === m.name)}
                  fill={LINE_COLORS[i % LINE_COLORS.length]}
                  isAnimationActive={false}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
