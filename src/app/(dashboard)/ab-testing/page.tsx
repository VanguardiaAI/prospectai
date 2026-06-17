"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, Button, Input, Select, Modal, Badge, EmptyState, Spinner, ConfirmDialog, Tooltip } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useT } from "@/i18n/LocaleProvider";
import { FlaskConical, Plus, Trash2, Trophy, Crown, BarChart3, Mail, MessageCircle } from "lucide-react";
import { clsx } from "clsx";

interface VariantConfig {
  tone: string;
  instructions?: string;
}

interface VariantResults {
  total: number;
  opens: number;
  clicks: number;
  replies: number;
}

interface WaVariantResults {
  total: number;
  replies: number;
}

interface ABTest {
  id: number;
  campaignId: number | null;
  name: string;
  status: "active" | "completed";
  createdAt: string;
  campaignName: string | null;
  channel: "email" | "whatsapp" | "both";
  variantAConfig: VariantConfig;
  variantBConfig: VariantConfig;
  resultsA: VariantResults;
  resultsB: VariantResults;
  waResultsA: WaVariantResults;
  waResultsB: WaVariantResults;
}

interface Campaign {
  id: number;
  name: string;
}

const TONE_KEYS = ["professional", "friendly", "direct", "consultative", "casual"] as const;

function rate(num: number, den: number): string {
  if (den === 0) return "0.0";
  return ((num / den) * 100).toFixed(1);
}

function zTestProportions(p1: number, p2: number, n1: number, n2: number): number {
  if (n1 === 0 || n2 === 0) return 0;
  const p = (p1 * n1 + p2 * n2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (se === 0) return 0;
  return Math.abs((p1 - p2) / se);
}

const MIN_SAMPLE_SIZE = 30;

type SignificanceLevel = "significant" | "trend" | "insufficient";

function getSignificance(test: ABTest): { level: SignificanceLevel; color: "success" | "warning" | "default" } {
  // For WA-only tests, use WA reply rate instead of email open rate
  if (test.channel === "whatsapp") {
    const n1 = test.waResultsA?.total ?? 0;
    const n2 = test.waResultsB?.total ?? 0;
    if (n1 < MIN_SAMPLE_SIZE || n2 < MIN_SAMPLE_SIZE) {
      return { level: "insufficient", color: "default" };
    }
    const p1 = n1 > 0 ? (test.waResultsA?.replies ?? 0) / n1 : 0;
    const p2 = n2 > 0 ? (test.waResultsB?.replies ?? 0) / n2 : 0;
    const z = zTestProportions(p1, p2, n1, n2);
    if (z >= 1.96) {
      return { level: "significant", color: "success" };
    }
    if (z >= 1.645) {
      return { level: "trend", color: "warning" };
    }
    return { level: "insufficient", color: "default" };
  }

  const n1 = test.resultsA.total;
  const n2 = test.resultsB.total;

  if (n1 < MIN_SAMPLE_SIZE || n2 < MIN_SAMPLE_SIZE) {
    return { level: "insufficient", color: "default" };
  }

  const p1 = n1 > 0 ? test.resultsA.opens / n1 : 0;
  const p2 = n2 > 0 ? test.resultsB.opens / n2 : 0;
  const z = zTestProportions(p1, p2, n1, n2);

  // Z >= 1.96 => p < 0.05, Z >= 1.645 => p < 0.10
  if (z >= 1.96) {
    return { level: "significant", color: "success" };
  }
  if (z >= 1.645) {
    return { level: "trend", color: "warning" };
  }
  return { level: "insufficient", color: "default" };
}

const SIGNIFICANCE_LABELS: Record<SignificanceLevel, string> = {
  insufficient: "abTesting.insufficientData",
  significant: "abTesting.significant",
  trend: "abTesting.trend",
};

export default function ABTestingPage() {
  const { toast } = useToast();
  const { t, lang } = useT();
  const [tests, setTests] = useState<ABTest[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; action: () => void } | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    campaignId: "",
    channel: "email" as string,
    variantA: { tone: "professional", instructions: "" },
    variantB: { tone: "direct", instructions: "" },
  });

  const fetchTests = useCallback(async () => {
    const res = await fetch("/api/ab-testing");
    const data = await res.json();
    setTests(data);
    setLoading(false);
  }, []);

  const fetchCampaigns = useCallback(async () => {
    const res = await fetch("/api/campaigns");
    const data = await res.json();
    setCampaigns(data);
  }, []);

  useEffect(() => {
    fetchTests();
    fetchCampaigns();
  }, [fetchTests, fetchCampaigns]);

  const openCreate = () => {
    setForm({
      name: "",
      campaignId: "",
      channel: "email",
      variantA: { tone: "professional", instructions: "" },
      variantB: { tone: "direct", instructions: "" },
    });
    setShowModal(true);
  };

  const create = async () => {
    setSaving(true);
    await fetch("/api/ab-testing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: form.campaignId ? Number(form.campaignId) : null,
        name: form.name,
        channel: form.channel,
        variantA: {
          tone: form.variantA.tone,
          instructions: form.variantA.instructions || undefined,
        },
        variantB: {
          tone: form.variantB.tone,
          instructions: form.variantB.instructions || undefined,
        },
      }),
    });
    setSaving(false);
    setShowModal(false);
    fetchTests();
  };

  const declareWinner = async (test: ABTest, winner: "A" | "B") => {
    setConfirmAction({
      title: t("abTesting.declareWinner"),
      message: t("abTesting.declareWinnerConfirm", { variant: winner }),
      action: async () => {
        await fetch("/api/ab-testing", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: test.id, status: "completed", winnerId: winner }),
        });
        toast(t("abTesting.variantDeclaredWinner", { variant: winner }), "success");
        fetchTests();
      },
    });
  };

  const remove = async (id: number) => {
    setConfirmAction({
      title: t("abTesting.deleteTest"),
      message: t("abTesting.deleteTestConfirm"),
      action: async () => {
        await fetch(`/api/ab-testing?id=${id}`, { method: "DELETE" });
        toast(t("abTesting.testDeleted"), "success");
        fetchTests();
      },
    });
  };

  const getWinningVariant = (test: ABTest): "A" | "B" | "tie" => {
    const rateA = test.resultsA.total > 0 ? test.resultsA.replies / test.resultsA.total : 0;
    const rateB = test.resultsB.total > 0 ? test.resultsB.replies / test.resultsB.total : 0;
    if (rateA > rateB) return "A";
    if (rateB > rateA) return "B";
    return "tie";
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div>
      {/* Header */}
      <div className="nd-page-header">
        <div>
          <h1 className="nd-heading">{t("abTesting.title")}</h1>
          <p className="nd-label mt-2">{t("abTesting.subtitle")}</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("abTesting.newTest")}
        </Button>
      </div>

      {tests.length === 0 ? (
        <EmptyState
          icon={<FlaskConical className="h-10 w-10" strokeWidth={1.5} />}
          title={t("abTesting.noTests")}
          description={t("abTesting.noTestsDesc")}
          action={<Button size="sm" onClick={() => setShowModal(true)}><Plus className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("abTesting.newTest")}</Button>}
        />
      ) : (
        <div className="space-y-4">
          {tests.map((test) => {
            const winning = getWinningVariant(test);
            const significance = test.status === "active" ? getSignificance(test) : null;

            return (
              <Card key={test.id}>
                {/* Test header */}
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <h3 className="text-[15px] text-text-display font-medium">{test.name}</h3>
                    <div className="flex items-center gap-3 mt-1">
                      {test.campaignName && (
                        <span className="text-[11px] text-text-muted font-mono">{test.campaignName}</span>
                      )}
                      <span className="text-[11px] text-text-muted">
                        {new Date(test.createdAt).toLocaleDateString(lang === "es" ? "es-MX" : "en-US")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={clsx(
                      "text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border",
                      test.channel === "whatsapp" ? "text-success border-success/30 bg-success-subtle" :
                      test.channel === "both" ? "text-text-secondary border-border bg-surface-raised" :
                      "text-accent border-accent/30 bg-accent-subtle"
                    )}>
                      {test.channel === "email" ? "EMAIL" : test.channel === "whatsapp" ? "WHATSAPP" : "EMAIL + WA"}
                    </span>
                    {significance && (
                      <Badge color={significance.color}>
                        <BarChart3 className="h-3 w-3" strokeWidth={1.5} />
                        {t(SIGNIFICANCE_LABELS[significance.level])}
                      </Badge>
                    )}
                    <Badge color={test.status === "active" ? "success" : "default"}>
                      {test.status === "active" ? t("abTesting.active") : t("abTesting.completed")}
                    </Badge>
                  </div>
                </div>

                {/* Variant configs */}
                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div className={`border rounded-lg p-3 ${winning === "A" && test.status === "active" ? "border-success/30 bg-success-subtle" : "border-border"}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="nd-label">{t("abTesting.variantA")}</span>
                      {test.status === "completed" && winning === "A" && (
                        <Crown className="h-3.5 w-3.5 text-warning" strokeWidth={1.5} />
                      )}
                    </div>
                    <span className="text-[11px] text-text-primary font-mono uppercase">{test.variantAConfig.tone}</span>
                    {test.variantAConfig.instructions && (
                      <p className="text-[10px] text-text-muted mt-1 leading-relaxed">{test.variantAConfig.instructions}</p>
                    )}
                  </div>
                  <div className={`border rounded-lg p-3 ${winning === "B" && test.status === "active" ? "border-success/30 bg-success-subtle" : "border-border"}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="nd-label">{t("abTesting.variantB")}</span>
                      {test.status === "completed" && winning === "B" && (
                        <Crown className="h-3.5 w-3.5 text-warning" strokeWidth={1.5} />
                      )}
                    </div>
                    <span className="text-[11px] text-text-primary font-mono uppercase">{test.variantBConfig.tone}</span>
                    {test.variantBConfig.instructions && (
                      <p className="text-[10px] text-text-muted mt-1 leading-relaxed">{test.variantBConfig.instructions}</p>
                    )}
                  </div>
                </div>

                {/* Results comparison table */}
                <div className="border border-border rounded-lg overflow-hidden mb-5">
                  <div className="grid grid-cols-3 text-[10px] font-mono uppercase text-text-muted bg-surface-secondary">
                    <div className="px-3 py-2">{t("abTesting.metric")}</div>
                    <div className="px-3 py-2 text-center">{t("abTesting.variantA")}</div>
                    <div className="px-3 py-2 text-center">{t("abTesting.variantB")}</div>
                  </div>
                  {/* Email metrics (shown for email and both channels) */}
                  {(test.channel === "email" || test.channel === "both") && (
                    <>
                      {/* Emails sent */}
                      <div className="grid grid-cols-3 border-t border-border">
                        <div className="px-3 py-2 nd-label">{t("abTesting.emailsSent")}</div>
                        <div className="px-3 py-2 text-center text-sm text-text-display font-mono">{test.resultsA.total}</div>
                        <div className="px-3 py-2 text-center text-sm text-text-display font-mono">{test.resultsB.total}</div>
                      </div>
                      {/* Open rate */}
                      {(() => {
                        const openRateA = test.resultsA.total > 0 ? test.resultsA.opens / test.resultsA.total : 0;
                        const openRateB = test.resultsB.total > 0 ? test.resultsB.opens / test.resultsB.total : 0;
                        return (
                          <div className="grid grid-cols-3 border-t border-border">
                            <div className="px-3 py-2 nd-label">{t("abTesting.openRate")}</div>
                            <div className={`px-3 py-2 text-center text-sm font-mono ${openRateA > openRateB ? "text-success" : "text-text-display"}`}>
                              {rate(test.resultsA.opens, test.resultsA.total)}%
                            </div>
                            <div className={`px-3 py-2 text-center text-sm font-mono ${openRateB > openRateA ? "text-success" : "text-text-display"}`}>
                              {rate(test.resultsB.opens, test.resultsB.total)}%
                            </div>
                          </div>
                        );
                      })()}
                      {/* Click rate */}
                      {(() => {
                        const clickRateA = test.resultsA.total > 0 ? test.resultsA.clicks / test.resultsA.total : 0;
                        const clickRateB = test.resultsB.total > 0 ? test.resultsB.clicks / test.resultsB.total : 0;
                        return (
                          <div className="grid grid-cols-3 border-t border-border">
                            <div className="px-3 py-2 nd-label">{t("abTesting.clickRate")}</div>
                            <div className={`px-3 py-2 text-center text-sm font-mono ${clickRateA > clickRateB ? "text-success" : "text-text-display"}`}>
                              {rate(test.resultsA.clicks, test.resultsA.total)}%
                            </div>
                            <div className={`px-3 py-2 text-center text-sm font-mono ${clickRateB > clickRateA ? "text-success" : "text-text-display"}`}>
                              {rate(test.resultsB.clicks, test.resultsB.total)}%
                            </div>
                          </div>
                        );
                      })()}
                      {/* Reply rate */}
                      {(() => {
                        const replyRateA = test.resultsA.total > 0 ? test.resultsA.replies / test.resultsA.total : 0;
                        const replyRateB = test.resultsB.total > 0 ? test.resultsB.replies / test.resultsB.total : 0;
                        return (
                          <div className="grid grid-cols-3 border-t border-border">
                            <div className="px-3 py-2 nd-label">{t("abTesting.replyRate")}</div>
                            <div className={`px-3 py-2 text-center text-sm font-mono font-medium ${replyRateA > replyRateB ? "text-success" : "text-text-display"}`}>
                              {rate(test.resultsA.replies, test.resultsA.total)}%
                            </div>
                            <div className={`px-3 py-2 text-center text-sm font-mono font-medium ${replyRateB > replyRateA ? "text-success" : "text-text-display"}`}>
                              {rate(test.resultsB.replies, test.resultsB.total)}%
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                  {/* WA metrics (shown for whatsapp and both channels) */}
                  {(test.channel === "whatsapp" || test.channel === "both") && (
                    <>
                      <div className="grid grid-cols-3 gap-0 border-t border-border">
                        <div className="px-3 py-2 nd-label">{t("abTesting.waSent")}</div>
                        <div className="px-3 py-2 text-center text-sm text-text-display font-mono">{test.waResultsA?.total ?? 0}</div>
                        <div className="px-3 py-2 text-center text-sm text-text-display font-mono">{test.waResultsB?.total ?? 0}</div>
                      </div>
                      <div className="grid grid-cols-3 gap-0 border-t border-border">
                        <div className="px-3 py-2 nd-label">{t("abTesting.waReplies")}</div>
                        <div className="px-3 py-2 text-center text-sm font-mono font-medium">
                          {test.waResultsA?.total > 0 ? Math.round((test.waResultsA.replies / test.waResultsA.total) * 100) : 0}%
                        </div>
                        <div className="px-3 py-2 text-center text-sm font-mono font-medium">
                          {test.waResultsB?.total > 0 ? Math.round((test.waResultsB.replies / test.waResultsB.total) * 100) : 0}%
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-4 border-t border-border">
                  {test.status === "active" ? (
                    <>
                      {significance?.level === "insufficient" ? (
                        <Tooltip text={t("abTesting.statisticalNote")}>
                          <Button size="sm" variant="secondary" disabled>
                            <Trophy className="h-3 w-3" strokeWidth={1.5} /> {t("abTesting.declareWinnerA")}
                          </Button>
                        </Tooltip>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => declareWinner(test, "A")}>
                          <Trophy className="h-3 w-3" strokeWidth={1.5} /> {t("abTesting.declareWinnerA")}
                        </Button>
                      )}
                      {significance?.level === "insufficient" ? (
                        <Tooltip text={t("abTesting.statisticalNote")}>
                          <Button size="sm" variant="secondary" disabled>
                            <Trophy className="h-3 w-3" strokeWidth={1.5} /> {t("abTesting.declareWinnerB")}
                          </Button>
                        </Tooltip>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => declareWinner(test, "B")}>
                          <Trophy className="h-3 w-3" strokeWidth={1.5} /> {t("abTesting.declareWinnerB")}
                        </Button>
                      )}
                    </>
                  ) : (
                    <Badge color="success">
                      <Crown className="h-3 w-3" strokeWidth={1.5} />
                      {winning === "tie" ? t("abTesting.tie") : `${t("abTesting.winnerVariant")} ${winning}`}
                    </Badge>
                  )}
                  <div className="flex-1" />
                  <Button size="sm" variant="ghost" onClick={() => remove(test.id)}>
                    <Trash2 className="h-3 w-3 text-accent" strokeWidth={1.5} />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={`${t("abTesting.newTest")} A/B`}>
        <div className="space-y-5">
          <div>
            <label className="nd-label block mb-2">{t("abTesting.testName")}</label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t("abTesting.testNamePlaceholder")}
            />
          </div>
          <div>
            <label className="nd-label block mb-2">{t("common.campaign")}</label>
            <Select
              value={form.campaignId}
              onChange={(e) => setForm({ ...form, campaignId: e.target.value })}
            >
              <option value="">{t("abTesting.noCampaign")}</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="nd-label block mb-2">{t("abTesting.channelLabel")}</label>
            <Select
              value={form.channel || "email"}
              onChange={(e) => setForm({ ...form, channel: e.target.value })}
            >
              <option value="email">{t("abTesting.emailOnly")}</option>
              <option value="whatsapp">{t("abTesting.waOnly")}</option>
              <option value="both">{t("abTesting.bothChannels")}</option>
            </Select>
          </div>

          {/* Variant A */}
          <div className="border border-border rounded-lg p-4">
            <span className="nd-label block mb-3">{t("abTesting.variantA")}</span>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-text-muted block mb-1">{t("common.tone")}</label>
                <Select
                  value={form.variantA.tone}
                  onChange={(e) => setForm({ ...form, variantA: { ...form.variantA, tone: e.target.value } })}
                >
                  {TONE_KEYS.map((tone) => (
                    <option key={tone} value={tone}>{t(`tones.${tone}`)}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-[10px] text-text-muted block mb-1">{t("abTesting.customInstructions")}</label>
                <textarea
                  className="w-full bg-surface-primary border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-border-focus resize-none font-mono"
                  rows={2}
                  value={form.variantA.instructions}
                  onChange={(e) => setForm({ ...form, variantA: { ...form.variantA, instructions: e.target.value } })}
                  placeholder={t("abTesting.instructionsPlaceholderA")}
                />
              </div>
            </div>
          </div>

          {/* Variant B */}
          <div className="border border-border rounded-lg p-4">
            <span className="nd-label block mb-3">{t("abTesting.variantB")}</span>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-text-muted block mb-1">{t("common.tone")}</label>
                <Select
                  value={form.variantB.tone}
                  onChange={(e) => setForm({ ...form, variantB: { ...form.variantB, tone: e.target.value } })}
                >
                  {TONE_KEYS.map((tone) => (
                    <option key={tone} value={tone}>{t(`tones.${tone}`)}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-[10px] text-text-muted block mb-1">{t("abTesting.customInstructions")}</label>
                <textarea
                  className="w-full bg-surface-primary border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-border-focus resize-none font-mono"
                  rows={2}
                  value={form.variantB.instructions}
                  onChange={(e) => setForm({ ...form, variantB: { ...form.variantB, instructions: e.target.value } })}
                  placeholder={t("abTesting.instructionsPlaceholderB")}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setShowModal(false)}>{t("common.cancel")}</Button>
            <Button size="sm" onClick={create} disabled={!form.name || saving}>
              {saving ? t("common.creating") : t("abTesting.createTest")}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => confirmAction?.action()}
        title={confirmAction?.title ?? ""}
        message={confirmAction?.message ?? ""}
        confirmLabel={t("common.yes")}
        variant="warning"
      />
    </div>
  );
}
