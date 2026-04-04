"use client";

import { clsx } from "clsx";

export function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex gap-[3px]">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={clsx(
              "bg-text-display animate-pulse",
              size === "sm" ? "w-1.5 h-1.5" : size === "md" ? "w-2 h-2" : "w-2.5 h-2.5"
            )}
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
      <span className="text-[10px] font-mono uppercase tracking-[0.1em] text-text-muted">
        [LOADING]
      </span>
    </div>
  );
}
