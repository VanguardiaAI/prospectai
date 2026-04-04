"use client";

import { clsx } from "clsx";
import { InputHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "w-full bg-transparent border-b border-border-light",
        "px-0 py-2.5 text-sm text-text-primary font-mono",
        "placeholder:text-text-muted/60",
        "focus:outline-none focus:border-text-primary",
        "transition-colors duration-150",
        className
      )}
      {...props}
    />
  );
}
