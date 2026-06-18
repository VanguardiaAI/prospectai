"use client";

import { useEffect, useRef, useState } from "react";
import { Card, Button, EmptyState, Spinner, Badge, Input, Textarea, Toggle, StatusBadge } from "@/components/ui";
import type { BadgeColor } from "@/components/ui/Badge";
import { Briefcase } from "lucide-react";
import { useT } from "@/i18n/LocaleProvider";
import { INTENT_TONE, isReplyIntent } from "@/lib/reply-intent";

interface ReplyRow {
  id: number;
  fromName: string | null;
  projectTitle: string | null;
  body: string | null;
  suggestedReply: string | null;
  intent: string | null;
  status: string;
}

function intentBadgeColor(intent: string | null): BadgeColor {
  if (!isReplyIntent(intent)) return "default";
  const tone = INTENT_TONE[intent];
  return tone === "good" ? "success" : tone === "warn" ? "warning" : "default";
}

type AuthState = "disconnected" | "connected" | "needs_reauth";
type ConnectPhase = "idle" | "awaiting_login" | "connected" | "timeout" | "error";

interface ProjectRow {
  id: number;
  title: string;
  fitScore: number | null;
  shouldBid: boolean | null;
  reason: string | null;
  status: string;
}
interface ProposalRow {
  id: number;
  projectTitle: string | null;
  projectUrl: string | null;
  fitScore: number | null;
  coverLetter: string;
  bidAmount: number | null;
  currency: string | null;
  deliveryDays: number | null;
  confidence: number | null;
  status: string;
}

function ProposalCard({ p, onChanged, allowSubmit }: { p: ProposalRow; onChanged: () => void; allowSubmit: boolean }) {
  const { t } = useT();
  const [cover, setCover] = useState(p.coverLetter);
  const [bid, setBid] = useState(p.bidAmount != null ? String(p.bidAmount) : "");
  const [days, setDays] = useState(p.deliveryDays != null ? String(p.deliveryDays) : "");
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState("");
  const editable = p.status === "draft";

  const doSubmit = async (dry: boolean) => {
    setSubmitting(true);
    setSubmitMsg("");
    const res = await put({ action: dry ? "submit_dry" : "submit" });
    const d = await res.json().catch(() => ({}));
    if (d.ok && d.dryRun) setSubmitMsg(t("workana.dryOk"));
    else if (d.ok) {
      setSubmitMsg(t("workana.sentOk"));
      onChanged();
    } else setSubmitMsg(d.error || "error");
    setSubmitting(false);
  };

  const put = (extra: Record<string, unknown>) =>
    fetch("/api/workana/proposals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, ...extra }),
    });

  const save = async () => {
    setBusy(true);
    await put({ coverLetter: cover, bidAmount: bid ? Number(bid) : null, deliveryDays: days ? Number(days) : null });
    setBusy(false);
    onChanged();
  };
  const setStatus = async (status: string) => {
    setBusy(true);
    // Persist any edits along with the status change.
    await put({ status, coverLetter: cover, bidAmount: bid ? Number(bid) : null, deliveryDays: days ? Number(days) : null });
    setBusy(false);
    onChanged();
  };
  const regenerate = async () => {
    setBusy(true);
    const res = await put({ action: "regenerate" });
    const d = await res.json().catch(() => ({}));
    if (d?.draft) {
      setCover(d.draft.coverLetter ?? "");
      setBid(d.draft.bidAmount != null ? String(d.draft.bidAmount) : "");
      setDays(d.draft.deliveryDays != null ? String(d.draft.deliveryDays) : "");
    }
    setBusy(false);
    onChanged();
  };

  return (
    <div className="py-4 border-t border-border first:border-t-0">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <span className="text-sm text-text-display">{p.projectTitle || "—"}</span>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted font-mono">
            {p.fitScore != null && <span>fit {p.fitScore}</span>}
            {p.confidence != null && <span>conf {p.confidence}</span>}
            {p.projectUrl && (
              <a href={p.projectUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                {t("workana.viewProject")}
              </a>
            )}
          </div>
        </div>
        <StatusBadge status={p.status} />
      </div>

      <label className="nd-label block mb-1">{t("workana.coverLabel")}</label>
      <Textarea value={cover} onChange={(e) => setCover(e.target.value)} rows={9} disabled={!editable} className="w-full" />

      <div className="flex flex-wrap gap-4 mt-3">
        <div>
          <label className="nd-label block mb-1">{t("workana.bidLabel")}</label>
          <Input value={bid} onChange={(e) => setBid(e.target.value)} disabled={!editable} className="w-32" inputMode="decimal" />
        </div>
        <div>
          <label className="nd-label block mb-1">{t("workana.deliveryLabel")}</label>
          <Input value={days} onChange={(e) => setDays(e.target.value)} disabled={!editable} className="w-28" inputMode="numeric" />
        </div>
      </div>

      {editable ? (
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <Button size="sm" variant="secondary" onClick={save} disabled={busy}>
            {busy ? t("workana.saving") : t("workana.save")}
          </Button>
          <Button size="sm" variant="success" onClick={() => setStatus("approved")} disabled={busy}>
            {t("workana.approve")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setStatus("rejected")} disabled={busy}>
            {t("workana.reject")}
          </Button>
          <Button size="sm" variant="ghost" onClick={regenerate} disabled={busy}>
            {busy ? t("workana.regenerating") : t("workana.regenerate")}
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            {p.status === "approved" && (
              <>
                <Button size="sm" variant="secondary" onClick={() => doSubmit(true)} disabled={submitting}>
                  {t("workana.dryRun")}
                </Button>
                <Button size="sm" onClick={() => doSubmit(false)} disabled={submitting || !allowSubmit}>
                  {submitting ? t("workana.sending") : t("workana.sendNow")}
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => setStatus("draft")} disabled={busy}>
              {t("workana.reopen")}
            </Button>
          </div>
          {p.status === "approved" && !allowSubmit && <p className="text-[10px] text-text-muted">{t("workana.sendDisabledHint")}</p>}
          {p.status === "submitted" && <p className="text-[11px] text-success font-mono">{t("workana.submittedNote")}</p>}
          {submitMsg && <p className="text-[11px] text-text-muted font-mono">{submitMsg}</p>}
        </div>
      )}
    </div>
  );
}

export default function WorkanaPage() {
  const { t } = useT();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [authState, setAuthState] = useState<AuthState>("disconnected");
  const [cfg, setCfg] = useState({
    weeklyConnections: "10",
    scanIntervalHours: "12",
    maxEval: "15",
    maxDrafts: "5",
    headless: "true",
    profileUrl: "",
    allowSubmit: "false",
  });
  const [savingCfg, setSavingCfg] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connectPhase, setConnectPhase] = useState<ConnectPhase>("idle");
  const [connectMsg, setConnectMsg] = useState("");
  const [checking, setChecking] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ scraped?: number; evaluated?: number; drafted?: number; skipped?: string } | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [replies, setReplies] = useState<ReplyRow[]>([]);
  const [checkingReplies, setCheckingReplies] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAuth = async () => {
    const res = await fetch("/api/workana/auth").catch(() => null);
    if (res?.ok) {
      const d = await res.json();
      setAuthState(d.authState ?? "disconnected");
      if (d.connect?.phase) setConnectPhase(d.connect.phase);
      if (d.connect?.message) setConnectMsg(d.connect.message);
    }
  };

  const loadData = async () => {
    const [scanRes, propRes, repRes] = await Promise.all([
      fetch("/api/workana/scan").catch(() => null),
      fetch("/api/workana/proposals").catch(() => null),
      fetch("/api/workana/replies").catch(() => null),
    ]);
    if (scanRes?.ok) setProjects((await scanRes.json()).projects ?? []);
    if (propRes?.ok) setProposals((await propRes.json()).proposals ?? []);
    if (repRes?.ok) setReplies((await repRes.json()).replies ?? []);
  };

  const checkReplies = async () => {
    setCheckingReplies(true);
    await fetch("/api/workana/replies", { method: "POST" }).catch(() => null);
    await loadData();
    setCheckingReplies(false);
  };

  const handleReply = async (id: number, action: "handle" | "unhandle") => {
    await fetch("/api/workana/replies", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    }).catch(() => null);
    await loadData();
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/settings").catch(() => null);
      const s = res?.ok ? await res.json() : null;
      if (cancelled) return;
      const isEnabled = s?.workana_enabled === "true";
      setEnabled(isEnabled);
      if (isEnabled) {
        setCfg({
          weeklyConnections: s?.workana_weekly_connections || "10",
          scanIntervalHours: s?.workana_scan_interval_hours || "12",
          maxEval: s?.workana_max_eval_per_scan || "15",
          maxDrafts: s?.workana_max_drafts_per_scan || "5",
          headless: s?.workana_headless || "true",
          profileUrl: s?.workana_profile_url || "",
          allowSubmit: s?.workana_allow_submit || "false",
        });
        await Promise.all([loadAuth(), loadData()]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const postAuth = (action: string) =>
    fetch("/api/workana/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });

  const startConnect = async () => {
    setBusy(true);
    setConnectMsg("");
    await postAuth("connect");
    setConnectPhase("awaiting_login");
    setBusy(false);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const res = await fetch("/api/workana/auth").catch(() => null);
      if (!res?.ok) return;
      const d = await res.json();
      setConnectPhase(d.connect?.phase ?? "idle");
      setConnectMsg(d.connect?.message ?? "");
      setAuthState(d.authState ?? "disconnected");
      if (d.connect?.phase && d.connect.phase !== "awaiting_login" && pollRef.current) clearInterval(pollRef.current);
    }, 4000);
  };

  const checkSession = async () => {
    setChecking(true);
    const res = await postAuth("check");
    if (res.ok) setAuthState((await res.json()).authState ?? authState);
    setChecking(false);
  };

  const disconnectSession = async () => {
    setBusy(true);
    await postAuth("disconnect");
    setAuthState("disconnected");
    setConnectPhase("idle");
    setBusy(false);
  };

  const runScan = async () => {
    setScanning(true);
    setScanResult(null);
    const res = await fetch("/api/workana/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const d = await res.json().catch(() => ({}));
    setScanResult(res.ok ? d : { skipped: d.error || "error" });
    if (res.ok) await loadData();
    setScanning(false);
  };

  const setEnabledSetting = async (value: boolean) => {
    setBusy(true);
    await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workana_enabled: String(value) }) });
    window.location.reload();
  };

  const saveCfg = async () => {
    setSavingCfg(true);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workana_weekly_connections: cfg.weeklyConnections,
        workana_scan_interval_hours: cfg.scanIntervalHours,
        workana_max_eval_per_scan: cfg.maxEval,
        workana_max_drafts_per_scan: cfg.maxDrafts,
        workana_headless: cfg.headless,
        workana_profile_url: cfg.profileUrl,
        workana_allow_submit: cfg.allowSubmit,
      }),
    }).catch(() => null);
    setSavingCfg(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const authLabel =
    authState === "connected" ? t("workana.authConnected") : authState === "needs_reauth" ? t("workana.authNeedsReauth") : t("workana.authDisconnected");
  const authColor: BadgeColor = authState === "connected" ? "success" : authState === "needs_reauth" ? "warning" : "default";
  const showConnect = authState !== "connected";

  return (
    <div>
      <div className="nd-page-header">
        <div>
          <h1>{t("workana.title")}</h1>
          <p className="nd-label mt-2">{t("workana.subtitle")}</p>
        </div>
      </div>

      {!enabled ? (
        <EmptyState
          icon={<Briefcase className="h-10 w-10" strokeWidth={1.5} />}
          title={t("workana.disabledTitle")}
          description={t("workana.disabledDesc")}
          action={
            <Button onClick={() => setEnabledSetting(true)} disabled={busy}>
              {busy ? t("workana.enabling") : t("workana.enable")}
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {/* Re-auth banner */}
          {authState === "needs_reauth" && (
            <Card dots className="border-warning/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-warning">{t("workana.reauthTitle")}</p>
                  <p className="mt-1 text-[11px] text-text-muted">{t("workana.reauthDesc")}</p>
                </div>
                <Button size="sm" onClick={startConnect} disabled={busy || connectPhase === "awaiting_login"}>
                  {t("workana.connect")}
                </Button>
              </div>
            </Card>
          )}

          {/* Session */}
          <Card title={t("workana.connection")} dots>
            <div className="flex items-center justify-between py-3">
              <span className="nd-label">{t("workana.status")}</span>
              <Badge color={authColor} dot>
                {authLabel}
              </Badge>
            </div>
            <div className="flex items-center justify-between py-3 border-t border-border">
              <span className="nd-label">{t("workana.weeklyConnections")}</span>
              <span className="text-sm text-text-display font-mono">{cfg.weeklyConnections}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-4 mt-1 border-t border-border">
              {showConnect ? (
                <Button size="sm" onClick={startConnect} disabled={busy || connectPhase === "awaiting_login"}>
                  {t("workana.connect")}
                </Button>
              ) : (
                <>
                  <Button size="sm" variant="secondary" onClick={checkSession} disabled={checking}>
                    {checking ? t("workana.checking") : t("workana.check")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={disconnectSession} disabled={busy}>
                    {t("workana.disconnectSession")}
                  </Button>
                </>
              )}
            </div>
            {connectPhase === "awaiting_login" && <p className="mt-3 text-[11px] text-accent font-mono">{t("workana.awaitingLogin")}</p>}
            {(connectPhase === "timeout" || connectPhase === "error") && connectMsg && <p className="mt-3 text-[11px] text-text-muted font-mono">{connectMsg}</p>}
            <p className="mt-3 text-[11px] text-text-muted leading-relaxed">{t("workana.connectHint")}</p>
          </Card>

          {/* Scan */}
          <Card title={t("workana.scanTitle")} dots>
            <p className="text-xs text-text-muted leading-relaxed mb-4 max-w-prose">{t("workana.scanDesc")}</p>
            <Button size="sm" onClick={runScan} disabled={scanning}>
              {scanning ? t("workana.scanningNow") : t("workana.scanNow")}
            </Button>
            {scanning && <p className="mt-3 text-[11px] text-text-muted font-mono">{t("workana.scanSlow")}</p>}
            {scanResult && !scanResult.skipped && (
              <p className="mt-3 text-sm text-text-display font-mono">
                {scanResult.scraped ?? 0} {t("workana.scanScraped")} · {scanResult.evaluated ?? 0} {t("workana.scanEvaluated")} · {scanResult.drafted ?? 0} {t("workana.scanDrafted")}
              </p>
            )}
            {scanResult?.skipped && <p className="mt-3 text-[11px] text-text-muted font-mono">{scanResult.skipped}</p>}
          </Card>

          {/* Drafts (review + edit + approve) */}
          {proposals.length > 0 && (
            <Card title={t("workana.draftsHeading")} meta={String(proposals.length)} dots>
              {proposals.map((p) => (
                <ProposalCard
                  key={`${p.id}:${p.status}:${p.confidence ?? ""}:${p.bidAmount ?? ""}:${p.deliveryDays ?? ""}:${p.coverLetter.length}`}
                  p={p}
                  onChanged={loadData}
                  allowSubmit={cfg.allowSubmit === "true"}
                />
              ))}
            </Card>
          )}

          {/* Client replies (actionable inbox) */}
          <Card title={t("workana.repliesHeading")} meta={replies.length ? String(replies.length) : undefined} dots>
            <p className="text-xs text-text-muted leading-relaxed mb-4 max-w-prose">{t("workana.repliesDesc")}</p>
            <Button size="sm" variant="secondary" onClick={checkReplies} disabled={checkingReplies}>
              {checkingReplies ? t("workana.checkingReplies") : t("workana.checkReplies")}
            </Button>
            {replies.length === 0 ? (
              <p className="mt-4 text-[11px] text-text-muted">{t("workana.noReplies")}</p>
            ) : (
              <div className="divide-y divide-border mt-4">
                {replies.map((r) => (
                  <div key={r.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex items-center gap-2">
                        {isReplyIntent(r.intent) && <Badge color={intentBadgeColor(r.intent)}>{t(`intent.${r.intent}`)}</Badge>}
                        <span className="text-sm text-text-display truncate">{r.fromName || r.projectTitle || "—"}</span>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => handleReply(r.id, r.status === "handled" ? "unhandle" : "handle")}>
                        {r.status === "handled" ? t("workana.reopen") : t("workana.markHandled")}
                      </Button>
                    </div>
                    {r.body && <p className="mt-2 text-[11px] text-text-secondary leading-relaxed line-clamp-3">{r.body}</p>}
                    {r.suggestedReply && (
                      <div className="mt-2 rounded-lg border border-border bg-surface-raised p-3">
                        <p className="nd-label mb-1">{t("workana.suggestedReply")}</p>
                        <p className="text-[11px] text-text-secondary leading-relaxed whitespace-pre-wrap">{r.suggestedReply}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Evaluated projects */}
          {projects.length > 0 && (
            <Card title={t("workana.projectsHeading")} meta={String(projects.length)} dots>
              <div className="divide-y divide-border">
                {projects.map((p) => (
                  <div key={p.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge color={p.shouldBid ? "success" : "default"}>{p.shouldBid ? t("workana.recommended") : t("workana.skipped")}</Badge>
                        <span className="text-sm text-text-display truncate">{p.title}</span>
                      </div>
                      {p.reason && <p className="mt-1 text-[11px] text-text-muted leading-relaxed line-clamp-2">{p.reason}</p>}
                    </div>
                    <span className="text-[11px] text-text-secondary font-mono shrink-0">fit {p.fitScore ?? "—"}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Config */}
          <Card title={t("workana.configTitle")} dots>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <label className="nd-label block mb-1">{t("workana.weeklyConnections")}</label>
                <Input value={cfg.weeklyConnections} onChange={(e) => setCfg({ ...cfg, weeklyConnections: e.target.value })} inputMode="numeric" />
              </div>
              <div>
                <label className="nd-label block mb-1">{t("workana.scanInterval")}</label>
                <Input value={cfg.scanIntervalHours} onChange={(e) => setCfg({ ...cfg, scanIntervalHours: e.target.value })} inputMode="numeric" />
              </div>
              <div>
                <label className="nd-label block mb-1">{t("workana.maxEval")}</label>
                <Input value={cfg.maxEval} onChange={(e) => setCfg({ ...cfg, maxEval: e.target.value })} inputMode="numeric" />
              </div>
              <div>
                <label className="nd-label block mb-1">{t("workana.maxDrafts")}</label>
                <Input value={cfg.maxDrafts} onChange={(e) => setCfg({ ...cfg, maxDrafts: e.target.value })} inputMode="numeric" />
              </div>
            </div>
            <div className="mt-4">
              <label className="nd-label block mb-1">{t("workana.profileUrlLabel")}</label>
              <Input
                value={cfg.profileUrl}
                onChange={(e) => setCfg({ ...cfg, profileUrl: e.target.value })}
                placeholder="https://www.workana.com/freelancer/..."
                className="w-full"
              />
            </div>
            <div className="mt-4">
              <Toggle checked={cfg.headless !== "false"} onChange={(v) => setCfg({ ...cfg, headless: v ? "true" : "false" })} label={t("workana.headlessLabel")} />
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <Toggle checked={cfg.allowSubmit === "true"} onChange={(v) => setCfg({ ...cfg, allowSubmit: v ? "true" : "false" })} label={t("workana.allowSubmitLabel")} />
              <p className="mt-2 text-[10px] text-warning leading-relaxed max-w-prose">{t("workana.allowSubmitWarn")}</p>
            </div>
            <div className="mt-4">
              <Button size="sm" variant="secondary" onClick={saveCfg} disabled={savingCfg}>
                {savingCfg ? t("workana.saving") : t("workana.save")}
              </Button>
            </div>
          </Card>

          {/* ToS disclaimer */}
          <p className="text-[10px] text-text-muted leading-relaxed">{t("workana.tos")}</p>

          <Button variant="ghost" size="sm" onClick={() => setEnabledSetting(false)} disabled={busy}>
            {t("workana.disable")}
          </Button>
        </div>
      )}
    </div>
  );
}
