"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Check, Smartphone, AlertCircle } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/Brands";

interface WAStatus {
  status: "disconnected" | "qr_pending" | "authenticating" | "ready" | "error";
  qrDataUrl: string | null;
  error: string | null;
  phone: string | null;
}

// Inline WhatsApp QR/status panel. Rendered in the chat right after the agent runs
// connect_whatsapp / get_whatsapp_status, so the user can link their phone without
// leaving the conversation. Polls the existing status endpoint (provider-agnostic —
// it doesn't depend on how each AI provider surfaces tool output).
export function WhatsAppConnect() {
  const [s, setS] = useState<WAStatus | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const stop = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
    const poll = () =>
      fetch("/api/whatsapp/status")
        .then((r) => r.json())
        .then((d: WAStatus) => {
          if (cancelled) return;
          setS(d);
          // Stop polling once we reach a steady state.
          if (d.status === "ready" || d.status === "disconnected") stop();
        })
        .catch(() => {});
    poll();
    timerRef.current = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  if (!s) return null;

  return (
    <div className="ml-8 max-w-[260px] rounded-xl border border-border bg-bg-secondary p-3">
      <div className="flex items-center gap-2 mb-2">
        <WhatsAppIcon className="w-4 h-4" />
        <span className="text-[12px] font-semibold text-text-display">WhatsApp</span>
      </div>

      {s.status === "qr_pending" && s.qrDataUrl && (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={s.qrDataUrl}
            alt="QR de WhatsApp"
            className="w-full rounded-lg bg-white p-1"
          />
          <p className="text-[11px] text-text-secondary flex items-start gap-1.5">
            <Smartphone className="w-3 h-3 mt-0.5 shrink-0" />
            Abre WhatsApp → Dispositivos vinculados → Vincular un dispositivo y escanea
            este código.
          </p>
        </div>
      )}

      {s.status === "authenticating" && (
        <p className="text-[12px] text-text-secondary flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Autenticando…
        </p>
      )}

      {s.status === "ready" && (
        <p className="text-[12px] text-success flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" /> Conectado{s.phone ? ` · ${s.phone}` : ""}
        </p>
      )}

      {(s.status === "disconnected" || s.status === "error") && (
        <p className="text-[12px] text-text-secondary flex items-center gap-1.5">
          {s.status === "error" ? (
            <AlertCircle className="w-3.5 h-3.5 text-accent" />
          ) : (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          )}
          {s.status === "error"
            ? s.error || "Error al conectar"
            : "Iniciando sesión…"}
        </p>
      )}
    </div>
  );
}
