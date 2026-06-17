"use client";

import { clsx } from "clsx";
import { ReactNode } from "react";

/** Floating rounded value chip with an optional color dot. Uses `.nd-chip`. */
export function ValueChip({
  color,
  children,
  className,
}: {
  color?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={clsx("nd-chip", className)}>
      {color && <span className="nd-chip-dot" style={{ background: color }} />}
      {children}
    </span>
  );
}
