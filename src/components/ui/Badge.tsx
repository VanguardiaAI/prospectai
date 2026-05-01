"use client";

import { clsx } from "clsx";
import { ReactNode } from "react";

export type BadgeColor = "default" | "accent" | "success" | "warning" | "danger" | "info";

export function Badge({
  children,
  color = "default",
}: {
  children: ReactNode;
  color?: BadgeColor;
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

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: BadgeColor }> = {
    imported: { label: "IMPORTADO", color: "default" },
    queued: { label: "EN COLA", color: "info" },
    scraping: { label: "SCRAPEANDO", color: "info" },
    scraped: { label: "SCRAPEADO", color: "info" },
    analyzing: { label: "ANALIZANDO", color: "info" },
    analyzed: { label: "ANALIZADO", color: "warning" },
    email_generated: { label: "BORRADOR EMAIL", color: "warning" },
    email_approved: { label: "EMAIL APROBADO", color: "success" },
    email_sent: { label: "EMAIL ENVIADO", color: "success" },
    wa_generated: { label: "BORRADOR WA", color: "warning" },
    wa_approved: { label: "WA APROBADO", color: "success" },
    wa_sent: { label: "WA ENVIADO", color: "success" },
    contacted: { label: "CONTACTADO", color: "success" },
    replied: { label: "RESPONDIO", color: "accent" },
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
