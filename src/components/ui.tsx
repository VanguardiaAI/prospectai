"use client";

import { clsx } from "clsx";
import { X } from "lucide-react";
import { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

// ─── Card ───────────────────────────────────────────────────────────
// Nothing Design: flat surface, 1px border separation, no shadows ever.
// Radius capped at 16px per spec. Padding 16–24px.

export function Card({
  children,
  className,
  flush = false,
  texture = false,
}: {
  children: ReactNode;
  className?: string;
  flush?: boolean;
  texture?: boolean;
}) {
  return (
    <div
      className={clsx(
        "relative bg-bg-secondary border border-border rounded-[12px] overflow-hidden",
        flush ? "p-0" : "px-6 py-5",
        className
      )}
    >
      {texture && (
        <div className="absolute inset-0 pointer-events-none nd-texture" />
      )}
      <div className={texture ? "relative" : undefined}>{children}</div>
    </div>
  );
}

// ─── StatCard ───────────────────────────────────────────────────────
// Nothing Design: hero number in display weight, label as metadata tier.
// Icon at reduced opacity. Sub-text in caption tier.

export function StatCard({
  label,
  value,
  sub,
  icon,
  color = "default",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: ReactNode;
  color?: "default" | "accent" | "success" | "warning" | "danger" | "info";
}) {
  const valueColors: Record<string, string> = {
    default: "text-text-display",
    accent: "text-accent",
    success: "text-success",
    warning: "text-warning",
    danger: "text-accent",
    info: "text-text-display",
  };
  return (
    <Card texture>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="nd-label mb-3">{label}</p>
          <p className={clsx("text-[28px] font-light font-mono tracking-tight leading-none", valueColors[color])}>
            {value}
          </p>
          {sub && <p className="text-[11px] text-text-secondary font-mono mt-2">{sub}</p>}
        </div>
        {icon && <div className="text-accent opacity-70 flex-shrink-0">{icon}</div>}
      </div>
    </Card>
  );
}

// ─── Button ─────────────────────────────────────────────────────────
// Nothing Design: pill shape (999px radius), Space Mono ALL CAPS 13px.
// Primary: white bg / black text. Secondary: transparent + border.
// Ghost: no border, no bg. Destructive: accent border.

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
        // Variants
        {
          "bg-text-display text-bg-primary rounded-full hover:opacity-85 active:opacity-75": variant === "primary",
          "bg-transparent border border-border-light text-text-primary rounded-full hover:border-text-secondary hover:text-text-display": variant === "secondary",
          "bg-transparent border border-accent/40 text-accent rounded-full hover:bg-accent-subtle hover:border-accent": variant === "danger",
          "bg-transparent border border-success/40 text-success rounded-full hover:bg-success-subtle hover:border-success": variant === "success",
          "bg-transparent text-text-secondary hover:text-text-primary rounded-full": variant === "ghost",
        },
        // Sizes
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

// ─── Input ──────────────────────────────────────────────────────────
// Nothing Design: underline only, mono font for data entry.
// Focus shifts border to text-primary. Error state uses accent.

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

// ─── Select ─────────────────────────────────────────────────────────
// Nothing Design: surface-raised bg, border, mono font.

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

// ─── Textarea ───────────────────────────────────────────────────────

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

// ─── Badge ──────────────────────────────────────────────────────────
// Nothing Design: pill border, no fill. 11px mono ALL CAPS.

export function Badge({
  children,
  color = "default",
}: {
  children: ReactNode;
  color?: "default" | "accent" | "success" | "warning" | "danger" | "info";
}) {
  const colors: Record<string, string> = {
    default: "border-border-light text-text-secondary",
    accent: "border-accent/50 text-accent",
    success: "border-success/50 text-success",
    warning: "border-warning/50 text-warning",
    danger: "border-accent/50 text-accent",
    info: "border-border-light text-text-secondary",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2.5 py-0.5 rounded-full border",
        "text-[10px] font-mono uppercase tracking-[0.06em] leading-none whitespace-nowrap",
        colors[color]
      )}
    >
      {children}
    </span>
  );
}

// ─── StatusBadge ────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: "default" | "accent" | "success" | "warning" | "danger" | "info" }> = {
    imported: { label: "IMPORTADO", color: "default" },
    queued: { label: "EN COLA", color: "info" },
    scraping: { label: "SCRAPEANDO", color: "info" },
    scraped: { label: "SCRAPEADO", color: "info" },
    analyzing: { label: "ANALIZANDO", color: "info" },
    analyzed: { label: "ANALIZADO", color: "warning" },
    email_generated: { label: "EMAIL GEN", color: "warning" },
    email_approved: { label: "EMAIL OK", color: "success" },
    email_sent: { label: "EMAIL SENT", color: "success" },
    wa_generated: { label: "WA GEN", color: "warning" },
    wa_approved: { label: "WA OK", color: "success" },
    wa_sent: { label: "WA SENT", color: "success" },
    contacted: { label: "CONTACTADO", color: "success" },
    rejected: { label: "RECHAZADO", color: "danger" },
    blacklisted: { label: "BLACKLIST", color: "danger" },
    error: { label: "ERROR", color: "danger" },
    draft: { label: "BORRADOR", color: "default" },
    approved: { label: "APROBADO", color: "success" },
    sent: { label: "ENVIADO", color: "success" },
    failed: { label: "FALLIDO", color: "danger" },
    active: { label: "ACTIVA", color: "success" },
    paused: { label: "PAUSADA", color: "warning" },
    archived: { label: "ARCHIVADA", color: "default" },
  };

  const info = map[status] || { label: status.toUpperCase(), color: "default" as const };
  return <Badge color={info.color}>{info.label}</Badge>;
}

// ─── Toggle ─────────────────────────────────────────────────────────
// Nothing Design: pill track, mechanical feel. White track when on.

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <label className="inline-flex items-center gap-3 cursor-pointer">
      <div
        className={clsx(
          "relative w-10 h-[22px] rounded-full transition-colors duration-150",
          checked
            ? "bg-text-display"
            : "border border-border-light bg-transparent"
        )}
        onClick={() => onChange(!checked)}
      >
        <div
          className={clsx(
            "absolute top-[3px] w-4 h-4 rounded-full transition-transform duration-150",
            checked
              ? "translate-x-[20px] bg-bg-primary"
              : "translate-x-[3px] bg-text-muted"
          )}
        />
      </div>
      {label && (
        <span className="text-[11px] text-text-secondary font-mono uppercase tracking-[0.06em]">
          {label}
        </span>
      )}
    </label>
  );
}

// ─── Modal ──────────────────────────────────────────────────────────
// Nothing Design: 0.8 opacity black backdrop, surface bg, 16px radius max.
// No shadows. Max 480px default width.

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
      <div className="absolute inset-0 bg-black/85" onClick={onClose} />
      <div
        className={clsx(
          "relative bg-bg-secondary border border-border-light rounded-[12px] w-full mx-4",
          maxWidth
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="nd-heading">{title}</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors duration-150 cursor-pointer rounded-full hover:bg-bg-tertiary"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// ─── QualityBar ─────────────────────────────────────────────────────
// Nothing Design signature: segmented progress bar with 2px gaps.

export function QualityBar({ score, size = "md" }: { score: number | null; size?: "sm" | "md" }) {
  if (score === null) return <span className="text-[10px] text-text-muted font-mono tracking-wider">N/A</span>;

  const segments = 10;
  const filled = Math.round((score / 100) * segments);
  const color =
    score <= 30 ? "bg-accent" : score <= 60 ? "bg-warning" : "bg-success";

  return (
    <div className="flex items-center gap-2.5">
      <div className={clsx("flex gap-[2px]", size === "sm" ? "w-[56px]" : "w-[80px]")}>
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={clsx(
              "flex-1",
              size === "sm" ? "h-[3px]" : "h-[4px]",
              i < filled ? color : "bg-border"
            )}
          />
        ))}
      </div>
      <span className={clsx("font-mono text-text-primary tabular-nums", size === "sm" ? "text-[10px]" : "text-[11px]")}>
        {score}
      </span>
    </div>
  );
}

// ─── EmptyState ─────────────────────────────────────────────────────
// Nothing Design: no mascots, bracket text, minimal.

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-text-muted/40 mb-5">{icon}</div>
      <h3 className="nd-label text-text-secondary mb-2">[{title}]</h3>
      {description && (
        <p className="text-xs text-text-muted max-w-xs leading-relaxed">{description}</p>
      )}
    </div>
  );
}

// ─── Spinner ────────────────────────────────────────────────────────
// Nothing Design: segmented pulse, no skeleton screens.

export function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex gap-[3px]">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={clsx(
              "bg-text-display animate-pulse",
              size === "sm" ? "w-1.5 h-1.5" : size === "md" ? "w-2 h-2" : "w-2.5 h-2.5"
            )}
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
      <span className="text-[10px] font-mono uppercase tracking-[0.1em] text-text-muted">
        [LOADING]
      </span>
    </div>
  );
}
