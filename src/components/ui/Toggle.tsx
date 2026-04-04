"use client";

import { clsx } from "clsx";

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <label className="inline-flex items-center gap-3 cursor-pointer">
      <div
        className={clsx(
          "relative w-10 h-[22px] rounded-full transition-colors duration-150",
          checked
            ? "bg-accent"
            : "border border-border-light bg-transparent"
        )}
        onClick={() => onChange(!checked)}
      >
        <div
          className={clsx(
            "absolute top-[3px] w-4 h-4 rounded-full transition-transform duration-150",
            checked
              ? "translate-x-[20px] bg-white"
              : "translate-x-[3px] bg-text-muted"
          )}
        />
      </div>
      {label && (
        <span className="text-[11px] text-text-secondary font-mono uppercase tracking-[0.06em]">
          {label}
        </span>
      )}
    </label>
  );
}
