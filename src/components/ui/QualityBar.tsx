"use client";

import { clsx } from "clsx";

export function QualityBar({ score, size = "md" }: { score: number | null; size?: "sm" | "md" }) {
  if (score === null) return <span className="text-[10px] text-text-muted font-mono tracking-wider">N/A</span>;

  const segments = 10;
  const filled = Math.round((score / 100) * segments);
  const color =
    score <= 30 ? "bg-accent" : score <= 60 ? "bg-warning" : "bg-success";

  return (
    <div className="flex items-center gap-2.5">
      <div className={clsx("flex gap-[2px]", size === "sm" ? "w-[56px]" : "w-[80px]")}>
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={clsx(
              "flex-1",
              size === "sm" ? "h-[3px]" : "h-[4px]",
              i < filled ? color : "bg-border"
            )}
          />
        ))}
      </div>
      <span className={clsx("font-mono text-text-primary tabular-nums", size === "sm" ? "text-[10px]" : "text-[11px]")}>
        {score}
      </span>
    </div>
  );
}
