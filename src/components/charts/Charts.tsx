"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { clsx } from "clsx";

const COLORS = {
  accent: "var(--accent)",
  orange: "var(--accent)",
  orangeSoft: "var(--accent-2)",
  gray: "var(--text-secondary)",
  graySoft: "var(--text-disabled)",
  success: "var(--success)",
  border: "var(--border)",
  text: "var(--text-secondary)",
  // back-compat aliases → orange/grayscale scheme
  lavender: "var(--accent)",
  butter: "var(--accent-2)",
  mint: "var(--success)",
  sky: "var(--text-secondary)",
  coral: "var(--accent)",
  cyan: "var(--text-secondary)",
  violet: "var(--text-disabled)",
  warning: "var(--warning)",
};

// ─── Shared tooltip ───────────────────────────────────────────────────────
type TooltipPayload = { name?: string; value?: number | string; color?: string };
function GlassTooltip({
  active,
  payload,
  label,
  suffix = "",
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="nd-glass-strong rounded-lg px-3 py-2 text-[11px] font-mono">
      {label && <div className="text-text-muted uppercase tracking-[0.08em] mb-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-text-display">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-text-secondary">{p.name}</span>
          <span className="ml-auto tabular-nums">{p.value}{suffix}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Activity area chart (multi-series) ───────────────────────────────────
export function AreaTrend({
  data,
  series,
  height = 200,
}: {
  data: Record<string, number | string>[];
  series: { key: string; label: string; color: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.5} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke={COLORS.border} strokeDasharray="1 5" vertical horizontal />
        <XAxis
          dataKey="label"
          tick={{ fill: COLORS.text, fontSize: 10, fontFamily: "var(--font-data)" }}
          axisLine={false}
          tickLine={false}
          dy={6}
        />
        <YAxis
          tick={{ fill: COLORS.text, fontSize: 10, fontFamily: "var(--font-data)" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          width={34}
        />
        <Tooltip content={<GlassTooltip />} cursor={{ stroke: COLORS.border }} />
        {series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2.5}
            fill={`url(#grad-${s.key})`}
            dot={{ r: 2.5, fill: s.color, strokeWidth: 0 }}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Radial gauge (single percent) ────────────────────────────────────────
export function RadialGauge({
  value,
  label,
  color = COLORS.accent,
  size = 120,
}: {
  value: number;
  label: string;
  color?: string;
  size?: number;
}) {
  const data = [{ name: label, value: Math.max(0, Math.min(100, value)) }];
  return (
    <div className="flex flex-col items-center">
      <div style={{ width: size, height: size }} className="relative">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="72%"
            outerRadius="100%"
            data={data}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar background={{ fill: COLORS.border }} dataKey="value" cornerRadius={10} fill={color} isAnimationActive={false} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[18px] font-mono font-light tabular-nums text-text-display">{Math.round(value)}%</span>
        </div>
      </div>
      <span className="nd-label mt-1 text-center">{label}</span>
    </div>
  );
}

// ─── Donut (distribution) ─────────────────────────────────────────────────
// Monochrome orange → gray scale
const DONUT_PALETTE = [
  "var(--accent)",
  "var(--accent-2)",
  "rgba(var(--accent-rgb), 0.5)",
  "var(--text-secondary)",
  "var(--text-disabled)",
  "var(--border-visible)",
];

export function Donut({
  data,
  height = 180,
  centerLabel,
  centerValue,
}: {
  data: { name: string; value: number }[];
  height?: number;
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const outer = Math.round(height * 0.47);
  const inner = Math.round(height * 0.3);
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={inner}
            outerRadius={outer}
            paddingAngle={2}
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={DONUT_PALETTE[i % DONUT_PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip content={<GlassTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-[22px] font-mono font-light tabular-nums text-text-display leading-none">
          {centerValue ?? total}
        </span>
        {centerLabel && <span className="nd-label mt-1">{centerLabel}</span>}
      </div>
    </div>
  );
}

export const CHART_COLORS = COLORS;
export const DONUT_COLORS = DONUT_PALETTE;

// ─── Weekly bars (Installs-style): rounded bars, idle = diagonal hatch,
//     active = solid pastel with a floating value chip above. ───────────────
export function BarWeek({
  data,
  color = COLORS.lavender,
  height = 200,
}: {
  data: { label: string; value: number; active?: boolean }[];
  color?: string;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const track = height - 34; // room for label + chip
  return (
    <div className="flex items-end justify-between gap-2" style={{ height }}>
      {data.map((d, i) => {
        const h = Math.max(10, Math.round((d.value / max) * (track - 28)));
        return (
          <div key={i} className="flex flex-col items-center gap-2.5 flex-1 min-w-0">
            <div className="relative flex-1 w-full flex items-end justify-center">
              {d.active ? (
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 z-10 nd-chip !px-2.5 !py-1 tabular-nums">
                  {d.value}
                </div>
              ) : (
                <span className="absolute top-1 left-1/2 -translate-x-1/2 w-3 h-px bg-border-visible" />
              )}
              <div
                className={d.active ? "w-full rounded-[8px_8px_4px_4px]" : "nd-bar nd-bar-idle"}
                style={{
                  height: h,
                  ...(d.active
                    ? { background: `linear-gradient(to bottom, ${color}, color-mix(in srgb, ${color} 55%, transparent))` }
                    : {}),
                }}
              />
            </div>
            <span className="nd-label">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Horizontal bar list (top N) ──────────────────────────────────────────
export function BarList({
  items,
  color = COLORS.cyan,
}: {
  items: { label: string; value: number }[];
  color?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-2.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-[11px] text-text-secondary w-24 truncate">{it.label}</span>
          <div className="flex-1 h-2 rounded-full bg-border/60 overflow-hidden">
            <div
              className={clsx("h-full rounded-full transition-all duration-700")}
              style={{ width: `${(it.value / max) * 100}%`, background: color }}
            />
          </div>
          <span className="text-[11px] font-mono tabular-nums text-text-display w-7 text-right">{it.value}</span>
        </div>
      ))}
    </div>
  );
}
