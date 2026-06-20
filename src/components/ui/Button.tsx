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
        "ui-btn inline-flex items-center justify-center gap-2 font-mono uppercase tracking-[0.06em] cursor-pointer",
        "transition-[transform,box-shadow,background-color,border-color,color,opacity] duration-150 ease-out",
        "active:translate-y-0 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:shadow-none",
        {
          "bg-accent text-white rounded-full shadow-[0_2px_10px_-2px_rgba(var(--accent-rgb),0.5)] hover:-translate-y-px hover:shadow-[0_8px_22px_-4px_rgba(var(--accent-rgb),0.6)] active:opacity-90": variant === "primary",
          "rounded-full text-text-primary border border-border-light bg-[var(--glass-bg)] backdrop-blur-md hover:border-text-secondary hover:text-text-display": variant === "secondary",
          "bg-transparent border border-accent/40 text-accent rounded-full hover:bg-accent-subtle hover:border-accent": variant === "danger",
          "bg-transparent border border-success/40 text-success rounded-full hover:bg-success-subtle hover:border-success": variant === "success",
          "bg-transparent text-text-secondary hover:text-text-primary hover:bg-bg-hover/40 rounded-full": variant === "ghost",
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
