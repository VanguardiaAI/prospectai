"use client";

import { clsx } from "clsx";
import { ReactNode } from "react";
import { Card } from "./Card";

export function StatCard({
  label,
  value,
  sub,
  icon,
  color = "default",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: ReactNode;
  color?: "default" | "accent" | "success" | "warning" | "danger" | "info" | "cyan" | "violet";
}) {
  const valueColors: Record<string, string> = {
    default: "text-text-display",
    accent: "text-accent",
    success: "text-success",
    warning: "text-warning",
    danger: "text-accent",
    info: "text-text-display",
    cyan: "text-cyan",
    violet: "text-violet",
  };
  const iconColors: Record<string, string> = {
    default: "text-text-muted",
    accent: "text-accent",
    success: "text-success",
    warning: "text-warning",
    danger: "text-accent",
    info: "text-text-muted",
    cyan: "text-cyan",
    violet: "text-violet",
  };
  return (
    <Card interactive>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="nd-label mb-3">{label}</p>
          <p
            className={clsx(
              "text-[30px] font-light font-mono tracking-tight leading-none tabular-nums",
              valueColors[color]
            )}
          >
            {value}
          </p>
          {sub && <p className="text-[11px] text-text-secondary font-mono mt-2.5">{sub}</p>}
        </div>
        {icon && <div className={clsx("flex-shrink-0 opacity-80", iconColors[color])}>{icon}</div>}
      </div>
    </Card>
  );
}
