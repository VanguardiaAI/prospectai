"use client";

import { clsx } from "clsx";
import { ReactNode } from "react";

export function Card({
  children,
  className,
  flush = false,
  texture = false,
}: {
  children: ReactNode;
  className?: string;
  flush?: boolean;
  texture?: boolean;
}) {
  return (
    <div
      className={clsx(
        "relative bg-bg-secondary border border-border rounded-[12px] overflow-hidden",
        flush ? "p-0" : "px-6 py-5",
        className
      )}
    >
      {texture && (
        <div className="absolute inset-0 pointer-events-none nd-texture" />
      )}
      <div className={texture ? "relative" : undefined}>{children}</div>
    </div>
  );
}
