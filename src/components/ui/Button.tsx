"use client";

import { clsx } from "clsx";
import { ButtonHTMLAttributes } from "react";

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "success";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 font-mono uppercase tracking-[0.06em] transition-all cursor-pointer",
        "disabled:opacity-30 disabled:cursor-not-allowed",
        {
          "bg-accent text-white rounded-full hover:opacity-85 active:opacity-75": variant === "primary",
          "bg-transparent border border-border-light text-text-primary rounded-full hover:border-text-secondary hover:text-text-display": variant === "secondary",
          "bg-transparent border border-accent/40 text-accent rounded-full hover:bg-accent-subtle hover:border-accent": variant === "danger",
          "bg-transparent border border-success/40 text-success rounded-full hover:bg-success-subtle hover:border-success": variant === "success",
          "bg-transparent text-text-secondary hover:text-text-primary rounded-full": variant === "ghost",
        },
        {
          "px-3 py-1.5 text-[11px]": size === "sm",
          "px-5 py-2 text-[12px] min-h-[40px]": size === "md",
          "px-7 py-2.5 text-[13px] min-h-[44px]": size === "lg",
        },
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
