"use client";

import { clsx } from "clsx";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

/** Soft delta pill with trend arrow (green up / coral down). Uses `.nd-delta`. */
export function DeltaBadge({
  value,
  suffix = "%",
  className,
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  const up = value >= 0;
  return (
    <span className={clsx("nd-delta", up ? "nd-delta-up" : "nd-delta-down", className)}>
      {up ? (
        <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
      ) : (
        <ArrowDownRight className="h-3 w-3" strokeWidth={2} />
      )}
      {Math.abs(value)}
      {suffix}
    </span>
  );
}
