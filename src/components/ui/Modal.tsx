"use client";

import { clsx } from "clsx";
import { X } from "lucide-react";
import { ReactNode } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-md nd-enter-fade" onClick={onClose} />
      <div
        className={clsx(
          "nd-card relative w-full mx-4 nd-enter-scale shadow-[var(--shadow-lg)]",
          maxWidth
        )}
      >
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <h2 className="nd-heading flex items-center gap-2 whitespace-nowrap">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent" />
            {title}
          </h2>
          <span className="flex-1" />
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors duration-150 cursor-pointer rounded-full hover:bg-bg-tertiary flex-shrink-0"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
