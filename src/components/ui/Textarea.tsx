"use client";

import { clsx } from "clsx";
import { TextareaHTMLAttributes } from "react";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(
        "w-full bg-[var(--glass-bg)] backdrop-blur-md border border-border rounded-lg caret-accent",
        "px-4 py-3 text-sm text-text-primary font-mono leading-relaxed",
        "placeholder:text-text-muted/60",
        "focus:outline-none focus:border-accent/60",
        "transition-colors duration-200 resize-y",
        className
      )}
      {...props}
    />
  );
}
