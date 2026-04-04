"use client";

import { clsx } from "clsx";
import { TextareaHTMLAttributes } from "react";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(
        "w-full bg-transparent border border-border rounded-lg",
        "px-4 py-3 text-sm text-text-primary font-mono leading-relaxed",
        "placeholder:text-text-muted/60",
        "focus:outline-none focus:border-border-light",
        "transition-colors duration-150 resize-y",
        className
      )}
      {...props}
    />
  );
}
