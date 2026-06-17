"use client";

import { clsx } from "clsx";
import { ReactNode } from "react";

export function Card({
  children,
  className,
  flush = false,
  texture = false,
  title,
  meta,
  interactive = false,
  feature = false,
  ticks = false,
  edge = false,
  dots = false,
}: {
  children: ReactNode;
  className?: string;
  flush?: boolean;
  /** Legacy dot texture overlay */
  texture?: boolean;
  /** Subtle in-card dot matrix (fine-detail texture) */
  dots?: boolean;
  /** Header strip: accent pip + label + diagonal separation band */
  title?: string;
  /** Trailing text on the title row (e.g. a count) */
  meta?: ReactNode;
  /** Hover lift + accent border + glow */
  interactive?: boolean;
  /** Left accent rail */
  feature?: boolean;
  /** Technical corner ticks */
  ticks?: boolean;
  /** Gradient hairline edge light */
  edge?: boolean;
}) {
  return (
    <div
      className={clsx(
        "nd-card overflow-hidden",
        interactive && "nd-card-interactive",
        feature && "nd-card-feature",
        ticks && "nd-ticks",
        edge && "nd-edge",
        flush ? "p-0" : "px-6 py-5",
        className
      )}
    >
      {texture && <div className="absolute inset-0 pointer-events-none nd-texture opacity-40" />}
      {dots && <div className="absolute inset-0 pointer-events-none nd-dots nd-dots-fade opacity-50" />}
      <div className={texture || dots ? "relative" : undefined}>
        {title && (
          <div className="nd-card-head">
            <span className="nd-card-head-title">{title}</span>
            {meta && (
              <span className="font-mono text-[11px] tracking-[0.06em] text-text-muted whitespace-nowrap">
                {meta}
              </span>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
