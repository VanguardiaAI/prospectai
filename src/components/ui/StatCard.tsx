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
  color?: "default" | "accent" | "success" | "warning" | "danger" | "info";
}) {
  const valueColors: Record<string, string> = {
    default: "text-text-display",
    accent: "text-accent",
    success: "text-success",
    warning: "text-warning",
    danger: "text-accent",
    info: "text-text-display",
  };
  return (
    <Card texture>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="nd-label mb-3">{label}</p>
          <p className={clsx("text-[28px] font-light font-mono tracking-tight leading-none", valueColors[color])}>
            {value}
          </p>
          {sub && <p className="text-[11px] text-text-secondary font-mono mt-2">{sub}</p>}
        </div>
        {icon && <div className="text-accent opacity-70 flex-shrink-0">{icon}</div>}
      </div>
    </Card>
  );
}
