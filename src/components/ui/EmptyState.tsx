"use client";

import { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center nd-enter-fade">
      <div className="relative mb-6">
        <div className="nd-card relative w-16 h-16 rounded-[14px] flex items-center justify-center text-text-muted/60">
          {icon}
        </div>
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-px bg-accent/40" />
      </div>
      <h3 className="nd-label text-text-secondary mb-2">[{title}]</h3>
      {description && (
        <p className="text-xs text-text-muted max-w-xs leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
