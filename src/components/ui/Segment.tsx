"use client";

import { clsx } from "clsx";
import { ReactNode } from "react";

export type SegmentOption<T extends string> = { value: T; label: ReactNode };

/**
 * White-pill segmented toggle (active = solid `--text-display` pill).
 * The canonical tab/filter switch for the app. Uses `.nd-segment`.
 */
export function Segment<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={clsx("nd-segment", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          data-active={value === o.value}
          className="nd-segment-item inline-flex items-center gap-1.5"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
