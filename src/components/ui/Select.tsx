"use client";

import { clsx } from "clsx";
import { SelectHTMLAttributes } from "react";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(
        "w-full bg-bg-tertiary border border-border rounded-lg",
        "px-3 py-2.5 text-sm text-text-primary font-mono",
        "focus:outline-none focus:border-border-light",
        "transition-colors duration-150",
        "appearance-none cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
