"use client";

import { clsx } from "clsx";
import { SelectHTMLAttributes } from "react";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(
        "ui-select w-full bg-[var(--glass-bg)] backdrop-blur-md border border-border rounded-lg",
        "pl-3 pr-9 py-2.5 text-sm text-text-primary font-mono",
        "focus:outline-none focus:border-accent/60",
        "transition-colors duration-200",
        "appearance-none cursor-pointer bg-no-repeat",
        "[background-position:right_0.7rem_center] [background-size:14px]",
        "[background-image:url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2024%2024'%20fill='none'%20stroke='%23999'%20stroke-width='2'%3E%3Cpath%20d='M6%209l6%206%206-6'/%3E%3C/svg%3E\")]",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
