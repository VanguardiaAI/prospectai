"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, Button, Badge, EmptyState, Spinner, ProgressBar, ConfirmDialog } from "@/components/ui";
import { useToast } from "@/components/Toast";
import {
  RefreshCw,
  Send,
  Mail,
  MessageCircle,
  Check,
  X,
  Pause,
  Clock,
  CheckCheck,
  Zap,
  MapPin,
  Megaphone,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────────────────────── */

interface PendingEmail {
  email: {
    id: number;
    leadId: number;
    toEmail: string;
    subject: string;
    bodyHtml: string;
    status: string;
    tone: string;
    createdAt: string;
  };
  leadName: string | null;
  leadCity: string | null;
  leadCategory: string | null;
  campaignName: string | null;
}

interface PendingWA {
  message: {
    id: number;
    leadId: number;
    toPhone: string;
    body: string;
    status: string;
    tone: string;
  };
  leadName: string | null;
  leadCity: string | null;
}

interface TodayData {
  pendingEmails: PendingEmail[];
  pendingWa: PendingWA[];
  readyToSend: number;
  readyToSendWa: number;
  activeSequences: number;
  sentToday: number;
  waSentToday: number;
  effectiveLimit: number;
  pendingJobs: number;
}

/* ─── Helpers ───────────────────────────────────────────────────────── */

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function preview(html: string, max = 150): string {
  const text = stripHtml(html);
  return text.length > max ? text.slice(0, max) + "..." : text;
}

/* ─── Component ─────────────────────────────────────────────────────── */

export default function TodayPage() {
  const { toast } = useToast();
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; action: () => void } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /* Fetch data */
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/today");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  /* Combined pending items list */
  const allPending: Array<{ type: "email"; item: PendingEmail } | { type: "wa"; item: PendingWA }> = [];
  if (data) {
    for (const e of data.pendingEmails) allPending.push({ type: "email", item: e });
    for (const w of data.pendingWa) allPending.push({ type: "wa", item: w });
  }

  /* Clamp index on data change */
  useEffect(() => {
    if (allPending.length > 0 && currentIndex >= allPending.length) {
      setCurrentIndex(Math.max(0, allPending.length - 1));
    }
  }, [allPending.length, currentIndex]);

  /* ─── Actions ─────────────────────────────────────────────────────── */

  const approveEmail = async (id: number) => {
    setActionLoading(true);
    await fetch("/api/emails", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "approved" }),
    });
    setActionLoading(false);
    toast("Email aprobado", "success");
    fetchData();
  };

  const rejectEmail = async (id: number) => {
    setActionLoading(true);
    await fetch("/api/emails", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "rejected" }),
    });
    setActionLoading(false);
    toast("Email rechazado", "warning");
    fetchData();
  };

  const approveWA = async (id: number) => {
    setActionLoading(true);
    await fetch("/api/whatsapp", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "approved" }),
    });
    setActionLoading(false);
    toast("WhatsApp aprobado", "success");
    fetchData();
  };

  const rejectWA = async (id: number) => {
    setActionLoading(true);
    await fetch("/api/whatsapp", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "rejected" }),
    });
    setActionLoading(false);
    toast("WhatsApp rechazado", "warning");
    fetchData();
  };

  const bulkApproveAll = async () => {
    if (!data || data.pendingEmails.length === 0) return;
    setActionLoading(true);
    const ids = data.pendingEmails.map((e) => e.email.id);
    await fetch("/api/emails", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bulkApprove: true, ids }),
    });
    setActionLoading(false);
    toast(`${ids.length} emails aprobados`, "success");
    fetchData();
  };

  const sendAll = async () => {
    setActionLoading(true);
    await fetch("/api/cron?action=send", { method: "POST" });
    setActionLoading(false);
    toast("Envio iniciado", "info");
    fetchData();
  };

  /* ─── Keyboard shortcuts ──────────────────────────────────────────── */

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case "a": {
          // Approve current item
          const current = allPending[currentIndex];
          if (!current || actionLoading) return;
          if (current.type === "email") approveEmail(current.item.email.id);
          else approveWA(current.item.message.id);
          break;
        }
        case "r": {
          // Reject current item
          const current = allPending[currentIndex];
          if (!current || actionLoading) return;
          if (current.type === "email") rejectEmail(current.item.email.id);
          else rejectWA(current.item.message.id);
          break;
        }
        case "n":
          // Next item
          setCurrentIndex((i) => Math.min(i + 1, allPending.length - 1));
          break;
        case "p":
          // Previous item
          setCurrentIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          // Send all
          if (!actionLoading) sendAll();
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPending, currentIndex, actionLoading]);

  /* ─── Scroll selected item into view ──────────────────────────────── */

  useEffect(() => {
    const el = document.getElementById(`today-item-${currentIndex}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [currentIndex]);

  /* ─── Loading state ───────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div ref={containerRef}>
      {/* ─── Page Header ────────────────────────────────────────────── */}
      <div className="nd-page-header">
        <div>
          <h1>Cola del Dia</h1>
          <p className="nd-label mt-2">
            Que necesitas hacer hoy
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data.pendingJobs > 0 && (
            <Badge>
              <Clock className="h-3 w-3 mr-1" strokeWidth={1.5} /> {data.pendingJobs} JOBS
            </Badge>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setLoading(true); fetchData(); }}
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} /> Refresh
          </Button>
        </div>
      </div>

      {/* ─── Stat Cards (Bento) ──────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-4 nd-section">
        <Card className="col-span-12 md:col-span-5" texture>
          <div className="flex items-start justify-between">
            <div>
              <p className="nd-label mb-3">Enviados Hoy</p>
              <div className="flex items-baseline gap-2">
                <span className="text-[36px] font-light font-mono tracking-tight leading-none text-text-display">
                  {data.sentToday}
                </span>
                <span className="text-[14px] font-mono text-text-muted">/ {data.effectiveLimit}</span>
              </div>
            </div>
            <div className="text-accent opacity-50 flex items-center gap-2">
              <span className="text-[10px] text-text-muted font-mono">+{data.waSentToday} WA</span>
              <Send className="h-5 w-5" strokeWidth={1.5} />
            </div>
          </div>
          <div className="mt-4">
            <ProgressBar
              value={data.sentToday}
              max={data.effectiveLimit}
              color={data.sentToday >= data.effectiveLimit ? "warning" : "accent"}
              size="sm"
              showValue={false}
            />
          </div>
        </Card>

        <Card className="col-span-6 md:col-span-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="nd-label mb-2">Pendiente Revision</p>
              <p className="text-[28px] font-light font-mono tracking-tight leading-none text-text-display">
                {data.pendingEmails.length + data.pendingWa.length}
              </p>
              <p className="text-[10px] text-text-muted font-mono mt-2">{data.pendingEmails.length} emails · {data.pendingWa.length} WA</p>
            </div>
            <Mail className="h-4 w-4 text-text-muted" strokeWidth={1.5} />
          </div>
        </Card>

        <div className="col-span-6 md:col-span-4 grid grid-rows-2 gap-4">
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="nd-label mb-1">Listos Para Enviar</p>
                <p className="text-[22px] font-light font-mono tracking-tight leading-none text-text-display">{data.readyToSend}</p>
              </div>
              <Zap className="h-4 w-4 text-accent" strokeWidth={1.5} />
            </div>
          </Card>
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="nd-label mb-1">Secuencias Activas</p>
                <p className="text-[22px] font-light font-mono tracking-tight leading-none text-text-display">{data.activeSequences}</p>
              </div>
              <CheckCheck className="h-4 w-4 text-text-muted" strokeWidth={1.5} />
            </div>
          </Card>
        </div>
      </div>

      {/* ─── Quick Actions ──────────────────────────────────────────── */}
      <div className="nd-section">
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <span className="nd-label text-text-muted mr-2">Acciones rapidas</span>
            <Button
              variant="success"
              size="sm"
              onClick={() => setConfirmAction({
                title: "Aprobar todos los emails",
                message: `Se aprobaran ${data.pendingEmails.length} emails pendientes. Esta accion no se puede deshacer.`,
                action: bulkApproveAll,
              })}
              disabled={actionLoading || data.pendingEmails.length === 0}
            >
              <CheckCheck className="h-3.5 w-3.5" strokeWidth={1.5} /> Aprobar Todo
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setConfirmAction({
                title: "Enviar emails aprobados",
                message: "Se iniciara el envio de todos los emails aprobados. Continuar?",
                action: sendAll,
              })}
              disabled={actionLoading}
            >
              <Send className="h-3.5 w-3.5" strokeWidth={1.5} /> Enviar Todo
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled
            >
              <Pause className="h-3.5 w-3.5" strokeWidth={1.5} /> Pausar Todo
            </Button>

            {/* Keyboard hint */}
            <div className="ml-auto hidden lg:flex items-center gap-4">
              <span className="nd-label text-text-muted">
                <kbd className="px-1.5 py-0.5 rounded border border-border text-[10px] font-mono">a</kbd> aprobar
              </span>
              <span className="nd-label text-text-muted">
                <kbd className="px-1.5 py-0.5 rounded border border-border text-[10px] font-mono">r</kbd> rechazar
              </span>
              <span className="nd-label text-text-muted">
                <kbd className="px-1.5 py-0.5 rounded border border-border text-[10px] font-mono">n</kbd>/<kbd className="px-1.5 py-0.5 rounded border border-border text-[10px] font-mono">p</kbd> navegar
              </span>
              <span className="nd-label text-text-muted">
                <kbd className="px-1.5 py-0.5 rounded border border-border text-[10px] font-mono">Enter</kbd> enviar
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* ─── Email Review List ──────────────────────────────────────── */}
      {data.pendingEmails.length > 0 && (
        <div className="nd-section">
          <h2 className="nd-heading mb-4">
            <Mail className="h-4 w-4 inline mr-2 -mt-0.5" strokeWidth={1.5} />
            Emails por revisar
            <span className="text-text-muted ml-2">({data.pendingEmails.length})</span>
          </h2>
          <div className="space-y-3">
            {data.pendingEmails.map((row, i) => {
              // The index in the combined list for emails is just i
              const combinedIdx = i;
              const isSelected = currentIndex === combinedIdx;

              return (
                <div
                  key={row.email.id}
                  id={`today-item-${combinedIdx}`}
                  onClick={() => setCurrentIndex(combinedIdx)}
                  className="cursor-pointer"
                >
                  <Card
                    className={
                      isSelected
                        ? "border-accent/60 ring-1 ring-accent/20"
                        : "hover:border-border-light"
                    }
                  >
                    {/* Top row: lead info */}
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[14px] text-text-display font-medium truncate">
                            {row.leadName || "Sin nombre"}
                          </span>
                          {row.leadCity && (
                            <span className="nd-label text-text-muted flex items-center gap-1">
                              <MapPin className="h-3 w-3" strokeWidth={1.5} />
                              {row.leadCity}
                            </span>
                          )}
                          {row.leadCategory && (
                            <Badge>{row.leadCategory.toUpperCase()}</Badge>
                          )}
                          {row.campaignName && (
                            <Badge color="info">
                              <Megaphone className="h-2.5 w-2.5 mr-1" strokeWidth={1.5} />
                              {row.campaignName}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          variant="success"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            approveEmail(row.email.id);
                          }}
                          disabled={actionLoading}
                        >
                          <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            rejectEmail(row.email.id);
                          }}
                          disabled={actionLoading}
                        >
                          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </Button>
                      </div>
                    </div>

                    {/* Subject + preview */}
                    <div className="space-y-1.5">
                      <p className="text-[13px] text-text-primary font-medium truncate">
                        {row.email.subject}
                      </p>
                      <p className="text-[12px] text-text-secondary leading-relaxed">
                        {preview(row.email.bodyHtml)}
                      </p>
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── WhatsApp Review List ───────────────────────────────────── */}
      {data.pendingWa.length > 0 && (
        <div className="nd-section">
          <h2 className="nd-heading mb-4">
            <MessageCircle className="h-4 w-4 inline mr-2 -mt-0.5" strokeWidth={1.5} />
            WhatsApp por revisar
            <span className="text-text-muted ml-2">({data.pendingWa.length})</span>
          </h2>
          <div className="space-y-3">
            {data.pendingWa.map((row, i) => {
              // Combined index: offset by email count
              const combinedIdx = data.pendingEmails.length + i;
              const isSelected = currentIndex === combinedIdx;

              return (
                <div
                  key={row.message.id}
                  id={`today-item-${combinedIdx}`}
                  onClick={() => setCurrentIndex(combinedIdx)}
                  className="cursor-pointer"
                >
                  <Card
                    className={
                      isSelected
                        ? "border-accent/60 ring-1 ring-accent/20"
                        : "hover:border-border-light"
                    }
                  >
                    {/* Top row: lead info */}
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[14px] text-text-display font-medium truncate">
                            {row.leadName || "Sin nombre"}
                          </span>
                          {row.leadCity && (
                            <span className="nd-label text-text-muted flex items-center gap-1">
                              <MapPin className="h-3 w-3" strokeWidth={1.5} />
                              {row.leadCity}
                            </span>
                          )}
                          <Badge color="info">
                            <MessageCircle className="h-2.5 w-2.5 mr-1" strokeWidth={1.5} />
                            {row.message.toPhone}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          variant="success"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            approveWA(row.message.id);
                          }}
                          disabled={actionLoading}
                        >
                          <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            rejectWA(row.message.id);
                          }}
                          disabled={actionLoading}
                        >
                          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </Button>
                      </div>
                    </div>

                    {/* Message preview */}
                    <p className="text-[12px] text-text-secondary leading-relaxed">
                      {row.message.body.length > 150
                        ? row.message.body.slice(0, 150) + "..."
                        : row.message.body}
                    </p>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Empty State ────────────────────────────────────────────── */}
      {data.pendingEmails.length === 0 && data.pendingWa.length === 0 && (
        <EmptyState
          icon={<Check className="h-10 w-10" strokeWidth={1.5} />}
          title="Todo al dia"
          description="No hay mensajes pendientes de revision. Los nuevos emails y WhatsApps aparecen aqui automaticamente."
        />
      )}

      <ConfirmDialog
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => confirmAction?.action()}
        title={confirmAction?.title ?? ""}
        message={confirmAction?.message ?? ""}
        confirmLabel="Si, continuar"
        variant="warning"
      />
    </div>
  );
}
