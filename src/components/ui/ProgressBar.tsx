"use client";

import { clsx } from "clsx";

export function ProgressBar({
  value,
  max = 100,
  label,
  showValue = true,
  color = "accent",
  size = "md",
}: {
  value: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  color?: "accent" | "success" | "warning" | "muted";
  size?: "sm" | "md";
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const barColors: Record<string, string> = {
    accent: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    muted: "bg-text-muted",
  };
  return (
    <div className="w-full">
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-text-secondary font-mono uppercase tracking-[0.06em]">{label}</span>
          {showValue && (
            <span className="text-[11px] text-text-display font-mono tabular-nums">{Math.round(pct)}%</span>
          )}
        </div>
      )}
      <div className={clsx("w-full bg-border rounded-full overflow-hidden", size === "sm" ? "h-[3px]" : "h-[5px]")}>
        <div
          className={clsx("h-full rounded-full transition-all duration-500", barColors[color])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
