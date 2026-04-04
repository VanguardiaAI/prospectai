"use client";

import { clsx } from "clsx";

export function ListRow({
  label,
  value,
  bar,
  barMax,
  barColor = "accent",
}: {
  label: string;
  value: string | number;
  bar?: number;
  barMax?: number;
  barColor?: "accent" | "success" | "warning" | "muted";
}) {
  const barColors: Record<string, string> = {
    accent: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    muted: "bg-text-muted",
  };
  const pct = bar !== undefined && barMax ? Math.min((bar / barMax) * 100, 100) : 0;
  return (
    <div className="nd-list-item group">
      <span className="text-sm text-text-primary truncate">{label}</span>
      <div className="flex items-center gap-3">
        {bar !== undefined && barMax && (
          <div className="w-[60px] h-[3px] bg-border rounded-full overflow-hidden">
            <div
              className={clsx("h-full rounded-full transition-all duration-500", barColors[barColor])}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        <span className="text-[12px] text-text-display font-mono tabular-nums min-w-[28px] text-right">{value}</span>
      </div>
    </div>
  );
}
