"use client";

import { ReactNode } from "react";

export function Tooltip({ children, text }: { children: ReactNode; text: string }) {
  return (
    <span className="relative group inline-flex">
      {children}
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-text-display text-bg-primary text-[11px] font-mono leading-relaxed whitespace-pre-line opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 min-w-[200px] max-w-[280px]">
        {text}
      </span>
    </span>
  );
}
