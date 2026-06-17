"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Select, Badge } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useT } from "@/i18n/LocaleProvider";
import {
  Globe, PenLine, FastForward, Sparkles, ArrowLeft, ArrowRight, Send, CheckCircle,
  Building, User, Mail, Wand2, Plus, X, RefreshCw,
} from "lucide-react";

// ─── Catálogo (duplicado del settings page para no acoplar) ───────────────
const SERVICE_KEYS = ["web_development", "seo", "ai_agents", "google_business", "social_media"] as const;

const COUNTRY_CODES = [
  "ES", "MX", "AR", "CO", "CL", "PE", "EC", "UY",
  "US", "UK", "CA", "AU", "BR", "PT", "FR", "DE", "IT", "NL",
] as const;

const TONE_KEYS = ["professional", "friendly", "direct", "consultative"] as const;

// ─── Tipos ────────────────────────────────────────────────────────────────
interface ExtractedAgency {
  name: string | null;
  tagline: string | null;
  description: string | null;
  ownerName: string | null;
  ownerRole: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  city: string | null;
  country: string | null;
  services: string[];
  customServices: { label: string; description: string }[];
  valueProps: string[];
  caseStudies: { client: string; result: string; snippet?: string }[];
}

interface ProfileFields extends ExtractedAgency {
  url: string;
}

const EMPTY_PROFILE: ProfileFields = {
  name: "",
  tagline: "",
  description: "",
  ownerName: "",
  ownerRole: "",
  contactEmail: "",
  contactPhone: "",
  city: "",
  country: "",
  services: [],
  customServices: [],
  valueProps: [],
  caseStudies: [],
  url: "",
};

type Step = 1 | 2 | 3 | 4;
type EntryMode = "url" | "manual" | "skipped";

// ─── Helpers ──────────────────────────────────────────────────────────────
function normalizeProfile(p: Partial<ExtractedAgency> & { url?: string }): ProfileFields {
  return {
    name: p.name ?? "",
    tagline: p.tagline ?? "",
    description: p.description ?? "",
    ownerName: p.ownerName ?? "",
    ownerRole: p.ownerRole ?? "",
    contactEmail: p.contactEmail ?? "",
    contactPhone: p.contactPhone ?? "",
    city: p.city ?? "",
    country: p.country ?? "",
    services: Array.isArray(p.services) ? p.services : [],
    customServices: Array.isArray(p.customServices) ? p.customServices : [],
    valueProps: Array.isArray(p.valueProps) ? p.valueProps : [],
    caseStudies: Array.isArray(p.caseStudies) ? p.caseStudies : [],
    url: p.url ?? "",
  };
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// ─── Página principal ────────────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useT();

  const [step, setStep] = useState<Step>(1);
  const [mode, setMode] = useState<EntryMode | null>(null);
  const [profile, setProfile] = useState<ProfileFields>(EMPTY_PROFILE);
  const [extractedFields, setExtractedFields] = useState<Set<string>>(new Set());

  // Step 2 state
  const [extractUrl, setExtractUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  // Step 3 state
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [tone, setTone] = useState("professional");

  // Step 4 state
  const [testEmailTo, setTestEmailTo] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [finishing, setFinishing] = useState(false);

  // Si ya se completó el onboarding, redirige al dashboard
  useEffect(() => {
    fetch("/api/onboarding/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d?.onboardingComplete) router.replace("/inicio");
      })
      .catch(() => { /* ignore — primer arranque */ });
  }, [router]);

  // Cargar from_email/from_name actuales para no pisar config válida
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        if (s?.from_email && !fromEmail) setFromEmail(s.from_email);
        if (s?.from_name && !fromName) setFromName(s.from_name);
        if (s?.default_tone && tone === "professional") setTone(s.default_tone);
      })
      .catch(() => { /* ignore */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goNext = () => setStep((s) => Math.min(4, (s + 1)) as Step);
  const goBack = () => setStep((s) => Math.max(1, (s - 1)) as Step);

  const chooseMode = (m: EntryMode) => {
    setMode(m);
    if (m === "skipped") {
      finishOnboarding("skipped");
      return;
    }
    if (m === "manual") {
      setProfile(EMPTY_PROFILE);
      setExtractedFields(new Set());
    }
    goNext();
  };

  const runExtract = useCallback(async () => {
    if (!extractUrl.trim()) {
      setExtractError(t("onboarding.step2.extract.missingUrl"));
      return;
    }
    setExtracting(true);
    setExtractError(null);
    try {
      const res = await fetch("/api/onboarding/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: extractUrl.trim() }),
      });
      const data = await res.json();
      if (!data.ok) {
        setExtractError(data.error || t("onboarding.step2.extract.failedDefault"));
        setExtracting(false);
        return;
      }
      const merged = normalizeProfile({ ...data.extracted, url: data.url });
      setProfile(merged);
      const filled = new Set<string>();
      (Object.keys(merged) as (keyof ProfileFields)[]).forEach((k) => {
        const v = merged[k];
        if (v && (typeof v === "string" ? v : Array.isArray(v) && v.length > 0)) {
          filled.add(k as string);
        }
      });
      setExtractedFields(filled);
      if (merged.ownerName && !fromName) setFromName(merged.ownerName);
      if (merged.contactEmail && !fromEmail) setFromEmail(merged.contactEmail);
      toast(
        t("onboarding.step2.extract.successToast", {
          pages: data.pagesScraped,
          seconds: (data.elapsedMs / 1000).toFixed(1),
        }),
        "success",
      );
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : t("onboarding.step2.extract.networkError"));
    } finally {
      setExtracting(false);
    }
  }, [extractUrl, fromName, fromEmail, toast, t]);

  const updateProfile = <K extends keyof ProfileFields>(key: K, value: ProfileFields[K]) => {
    setProfile((p) => ({ ...p, [key]: value }));
  };

  const toggleService = (key: string) => {
    setProfile((p) => ({
      ...p,
      services: p.services.includes(key) ? p.services.filter((s) => s !== key) : [...p.services, key],
    }));
  };

  const addValueProp = () => updateProfile("valueProps", [...profile.valueProps, ""]);
  const removeValueProp = (i: number) =>
    updateProfile("valueProps", profile.valueProps.filter((_, idx) => idx !== i));
  const updateValueProp = (i: number, v: string) => {
    const next = [...profile.valueProps];
    next[i] = v;
    updateProfile("valueProps", next);
  };

  // Persistir el perfil (sin marcar completado)
  const persistProfile = useCallback(async (markComplete = false): Promise<boolean> => {
    const cleaned = {
      name: profile.name?.trim() || null,
      url: profile.url?.trim() || null,
      description: profile.description?.trim() || null,
      tagline: profile.tagline?.trim() || null,
      ownerName: profile.ownerName?.trim() || null,
      ownerRole: profile.ownerRole?.trim() || null,
      contactEmail: profile.contactEmail?.trim() || null,
      contactPhone: profile.contactPhone?.trim() || null,
      services: profile.services,
      customServices: profile.customServices,
      city: profile.city?.trim() || null,
      country: profile.country?.trim() || null,
      valueProps: profile.valueProps.map((v) => v.trim()).filter(Boolean),
      caseStudies: profile.caseStudies,
      source: mode === "url" ? "url" : "manual" as "url" | "manual",
      sourceUrl: mode === "url" ? profile.url || null : null,
      extractedAt: extractedFields.size > 0 ? new Date().toISOString() : null,
      markComplete,
    };

    const res = await fetch("/api/onboarding/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cleaned),
    });
    return res.ok;
  }, [profile, mode, extractedFields]);

  // Persistir from_email / from_name / target_country / default_tone en settings
  const persistSenderSettings = useCallback(async (): Promise<boolean> => {
    const updates: Record<string, string> = {
      from_email: fromEmail.trim(),
      from_name: fromName.trim(),
      default_tone: tone,
    };
    if (profile.country) updates.target_country = profile.country;
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    return res.ok;
  }, [fromEmail, fromName, tone, profile.country]);

  const handleSendTest = async () => {
    if (!isValidEmail(testEmailTo)) {
      toast(t("onboarding.step4.test.invalidTo"), "error");
      return;
    }
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/onboarding/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: testEmailTo.trim(),
          fromEmail: fromEmail.trim(),
          fromName: fromName.trim(),
          agencyName: profile.name || "tu agencia",
          tone,
        }),
      });
      const data = await res.json();
      setTestResult(data.ok ? { ok: true } : { ok: false, error: data.error });
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : "Error de red" });
    } finally {
      setTestSending(false);
    }
  };

  const finishOnboarding = async (sourceOverride?: "url" | "manual" | "skipped") => {
    setFinishing(true);
    try {
      // Para "skipped" sólo marcamos completado, sin tocar nada más
      if (sourceOverride === "skipped") {
        await fetch("/api/onboarding/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "skipped", markComplete: true }),
        });
        router.replace("/inicio");
        return;
      }
      const profileOk = await persistProfile(true);
      const senderOk = await persistSenderSettings();
      if (!profileOk || !senderOk) {
        toast(t("onboarding.errors.saveFailed"), "error");
        setFinishing(false);
        return;
      }
      router.replace("/campaigns?welcome=1");
    } catch (err) {
      toast(err instanceof Error ? err.message : t("common.error"), "error");
      setFinishing(false);
    }
  };

  // ─── Validación por paso ─────────────────────────────────────────────
  const canAdvanceFromStep2 = useMemo(() => {
    return Boolean(profile.name?.trim() && profile.description?.trim());
  }, [profile.name, profile.description]);

  const canAdvanceFromStep3 = useMemo(() => {
    return Boolean(isValidEmail(fromEmail) && fromName.trim() && profile.country);
  }, [fromEmail, fromName, profile.country]);

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-3xl mx-auto px-4 py-10 lg:py-16">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl lg:text-4xl font-light tracking-tight">
            {t("onboarding.title")}
          </h1>
          <p className="text-sm text-text-muted mt-2">
            {t("onboarding.subtitle")}
          </p>
        </div>

        {/* Stepper */}
        <Stepper current={step} />

        {/* Contenido */}
        <div className="mt-8">
          {step === 1 && <Step1Welcome onChoose={chooseMode} disabled={finishing} />}
          {step === 2 && (
            <Step2Profile
              mode={mode}
              extractUrl={extractUrl}
              setExtractUrl={setExtractUrl}
              extracting={extracting}
              extractError={extractError}
              onExtract={runExtract}
              profile={profile}
              extractedFields={extractedFields}
              updateProfile={updateProfile}
              toggleService={toggleService}
              addValueProp={addValueProp}
              removeValueProp={removeValueProp}
              updateValueProp={updateValueProp}
            />
          )}
          {step === 3 && (
            <Step3Sender
              fromEmail={fromEmail}
              setFromEmail={setFromEmail}
              fromName={fromName}
              setFromName={setFromName}
              country={profile.country || ""}
              setCountry={(c) => updateProfile("country", c)}
              tone={tone}
              setTone={setTone}
            />
          )}
          {step === 4 && (
            <Step4Launch
              profile={profile}
              fromEmail={fromEmail}
              fromName={fromName}
              tone={tone}
              testEmailTo={testEmailTo}
              setTestEmailTo={setTestEmailTo}
              testSending={testSending}
              testResult={testResult}
              onSendTest={handleSendTest}
            />
          )}
        </div>

        {/* Navegación */}
        <div className="mt-10 flex items-center justify-between">
          <div>
            {step > 1 && (
              <Button variant="secondary" size="sm" onClick={goBack} disabled={finishing}>
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("onboarding.nav.back")}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step === 1 && null}
            {step === 2 && (
              <>
                <button
                  onClick={() => finishOnboarding("skipped")}
                  className="text-xs text-text-muted hover:text-text-secondary underline-offset-2 hover:underline"
                  disabled={finishing}
                >
                  {t("onboarding.nav.skipLater")}
                </button>
                <Button
                  size="sm"
                  onClick={async () => {
                    await persistProfile(false);
                    goNext();
                  }}
                  disabled={!canAdvanceFromStep2}
                >
                  {t("onboarding.nav.continue")} <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                </Button>
              </>
            )}
            {step === 3 && (
              <Button
                size="sm"
                onClick={async () => {
                  await persistSenderSettings();
                  goNext();
                }}
                disabled={!canAdvanceFromStep3}
              >
                {t("onboarding.nav.continue")} <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
              </Button>
            )}
            {step === 4 && (
              <Button size="sm" onClick={() => finishOnboarding(mode || "manual")} disabled={finishing}>
                {finishing ? (
                  <><RefreshCw className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> {t("onboarding.nav.finishing")}</>
                ) : (
                  <><CheckCircle className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("onboarding.nav.launch")}</>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Stepper visual ────────────────────────────────────────────────────────
function Stepper({ current }: { current: Step }) {
  const { t } = useT();
  const steps = [
    { n: 1, label: t("onboarding.stepper.step1") },
    { n: 2, label: t("onboarding.stepper.step2") },
    { n: 3, label: t("onboarding.stepper.step3") },
    { n: 4, label: t("onboarding.stepper.step4") },
  ];
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => {
        const isActive = current === s.n;
        const isDone = current > s.n;
        return (
          <div key={s.n} className="flex items-center gap-2 flex-1">
            <div
              className={`flex items-center justify-center h-7 w-7 rounded-full border text-xs font-mono shrink-0 ${
                isDone
                  ? "bg-accent border-accent text-bg-primary"
                  : isActive
                  ? "border-accent text-accent"
                  : "border-border text-text-muted"
              }`}
            >
              {isDone ? "✓" : s.n}
            </div>
            <span className={`text-[11px] uppercase tracking-wider ${isActive ? "text-text-primary" : "text-text-muted"}`}>
              {s.label}
            </span>
            {i < steps.length - 1 && <div className="flex-1 h-px bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1: bienvenida ──────────────────────────────────────────────────
function Step1Welcome({ onChoose, disabled }: { onChoose: (m: EntryMode) => void; disabled: boolean }) {
  const { t } = useT();
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <ChoiceCard
        icon={<Globe className="h-6 w-6" strokeWidth={1.5} />}
        title={t("onboarding.step1.url.title")}
        description={t("onboarding.step1.url.description")}
        recommendedLabel={t("onboarding.step1.recommended")}
        recommended
        onClick={() => onChoose("url")}
        disabled={disabled}
      />
      <ChoiceCard
        icon={<PenLine className="h-6 w-6" strokeWidth={1.5} />}
        title={t("onboarding.step1.manual.title")}
        description={t("onboarding.step1.manual.description")}
        onClick={() => onChoose("manual")}
        disabled={disabled}
      />
      <ChoiceCard
        icon={<FastForward className="h-6 w-6" strokeWidth={1.5} />}
        title={t("onboarding.step1.skip.title")}
        description={t("onboarding.step1.skip.description")}
        muted
        onClick={() => onChoose("skipped")}
        disabled={disabled}
      />
    </div>
  );
}

function ChoiceCard({
  icon, title, description, onClick, recommended, recommendedLabel, muted, disabled,
}: {
  icon: React.ReactNode; title: string; description: string; onClick: () => void;
  recommended?: boolean; recommendedLabel?: string; muted?: boolean; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group text-left p-5 rounded-xl border transition-all cursor-pointer disabled:cursor-not-allowed ${
        recommended ? "border-accent" : "border-border hover:border-border-light"
      } ${muted ? "opacity-70" : ""}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={recommended ? "text-accent" : "text-text-muted"}>{icon}</div>
        {recommended && recommendedLabel && <Badge color="success">{recommendedLabel}</Badge>}
      </div>
      <h3 className="text-sm font-medium mb-1.5">{title}</h3>
      <p className="text-xs text-text-muted leading-relaxed">{description}</p>
    </button>
  );
}

// ─── Step 2: perfil ──────────────────────────────────────────────────────
function Step2Profile({
  mode, extractUrl, setExtractUrl, extracting, extractError, onExtract,
  profile, extractedFields, updateProfile, toggleService,
  addValueProp, removeValueProp, updateValueProp,
}: {
  mode: EntryMode | null;
  extractUrl: string; setExtractUrl: (v: string) => void;
  extracting: boolean; extractError: string | null; onExtract: () => void;
  profile: ProfileFields;
  extractedFields: Set<string>;
  updateProfile: <K extends keyof ProfileFields>(key: K, value: ProfileFields[K]) => void;
  toggleService: (key: string) => void;
  addValueProp: () => void;
  removeValueProp: (i: number) => void;
  updateValueProp: (i: number, v: string) => void;
}) {
  const { t } = useT();
  return (
    <div className="space-y-5">
      {mode === "url" && (
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Wand2 className="h-4 w-4" strokeWidth={1.5} />
            {t("onboarding.step2.extract.title")}
          </h3>
          <div className="flex gap-2">
            <Input
              value={extractUrl}
              onChange={(e) => setExtractUrl(e.target.value)}
              placeholder={t("onboarding.step2.extract.urlPlaceholder")}
              disabled={extracting}
              className="flex-1"
            />
            <Button onClick={onExtract} disabled={extracting || !extractUrl.trim()} size="sm">
              {extracting ? (
                <><RefreshCw className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> {t("onboarding.step2.extract.analyzing")}</>
              ) : (
                <><Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("onboarding.step2.extract.analyze")}</>
              )}
            </Button>
          </div>
          {extracting && (
            <p className="text-[11px] text-text-muted mt-3">
              {t("onboarding.step2.extract.hint")}
            </p>
          )}
          {extractError && (
            <p className="text-[11px] text-red-500 mt-3 font-mono">{t("onboarding.errors.errorPrefix")} {extractError}</p>
          )}
          {extractedFields.size > 0 && !extracting && (
            <p className="text-[11px] text-success mt-3">
              {t("onboarding.step2.extract.success")}
            </p>
          )}
        </Card>
      )}

      <Card className="p-5">
        <h3 className="text-sm font-medium mb-5 flex items-center gap-2">
          <Building className="h-4 w-4" strokeWidth={1.5} />
          {t("onboarding.step2.identity.section")}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FieldWithBadge label={t("onboarding.step2.identity.name")} extractedLabel={t("onboarding.step2.extractedField")} extracted={extractedFields.has("name")}>
            <Input
              value={profile.name || ""}
              onChange={(e) => updateProfile("name", e.target.value)}
              placeholder={t("onboarding.step2.identity.namePlaceholder")}
            />
          </FieldWithBadge>
          <FieldWithBadge label={t("onboarding.step2.identity.url")} extractedLabel={t("onboarding.step2.extractedField")} extracted={extractedFields.has("url")}>
            <Input
              value={profile.url || ""}
              onChange={(e) => updateProfile("url", e.target.value)}
              placeholder={t("onboarding.step2.identity.urlPlaceholder")}
            />
          </FieldWithBadge>
          <div className="md:col-span-2">
            <FieldWithBadge label={t("onboarding.step2.identity.tagline")} extractedLabel={t("onboarding.step2.extractedField")} extracted={extractedFields.has("tagline")}>
              <Input
                value={profile.tagline || ""}
                onChange={(e) => updateProfile("tagline", e.target.value)}
                placeholder={t("onboarding.step2.identity.taglinePlaceholder")}
              />
            </FieldWithBadge>
          </div>
          <div className="md:col-span-2">
            <FieldWithBadge label={t("onboarding.step2.identity.description")} extractedLabel={t("onboarding.step2.extractedField")} extracted={extractedFields.has("description")}>
              <textarea
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-transparent text-text-primary focus:outline-none focus:ring-1 focus:ring-text-primary min-h-[80px]"
                value={profile.description || ""}
                onChange={(e) => updateProfile("description", e.target.value)}
                placeholder={t("onboarding.step2.identity.descriptionPlaceholder")}
              />
            </FieldWithBadge>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-medium mb-5 flex items-center gap-2">
          <User className="h-4 w-4" strokeWidth={1.5} />
          {t("onboarding.step2.owner.section")}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FieldWithBadge label={t("onboarding.step2.owner.name")} extractedLabel={t("onboarding.step2.extractedField")} extracted={extractedFields.has("ownerName")}>
            <Input
              value={profile.ownerName || ""}
              onChange={(e) => updateProfile("ownerName", e.target.value)}
              placeholder={t("onboarding.step2.owner.namePlaceholder")}
            />
          </FieldWithBadge>
          <FieldWithBadge label={t("onboarding.step2.owner.role")} extractedLabel={t("onboarding.step2.extractedField")} extracted={extractedFields.has("ownerRole")}>
            <Input
              value={profile.ownerRole || ""}
              onChange={(e) => updateProfile("ownerRole", e.target.value)}
              placeholder={t("onboarding.step2.owner.rolePlaceholder")}
            />
          </FieldWithBadge>
          <FieldWithBadge label={t("onboarding.step2.owner.city")} extractedLabel={t("onboarding.step2.extractedField")} extracted={extractedFields.has("city")}>
            <Input
              value={profile.city || ""}
              onChange={(e) => updateProfile("city", e.target.value)}
              placeholder={t("onboarding.step2.owner.cityPlaceholder")}
            />
          </FieldWithBadge>
          <FieldWithBadge label={t("onboarding.step2.owner.email")} extractedLabel={t("onboarding.step2.extractedField")} extracted={extractedFields.has("contactEmail")}>
            <Input
              value={profile.contactEmail || ""}
              onChange={(e) => updateProfile("contactEmail", e.target.value)}
              placeholder={t("onboarding.step2.owner.emailPlaceholder")}
            />
          </FieldWithBadge>
          <FieldWithBadge label={t("onboarding.step2.owner.phone")} extractedLabel={t("onboarding.step2.extractedField")} extracted={extractedFields.has("contactPhone")}>
            <Input
              value={profile.contactPhone || ""}
              onChange={(e) => updateProfile("contactPhone", e.target.value)}
              placeholder={t("onboarding.step2.owner.phonePlaceholder")}
            />
          </FieldWithBadge>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
          <Sparkles className="h-4 w-4" strokeWidth={1.5} />
          {t("onboarding.step2.services.section")}
          {extractedFields.has("services") && <Badge color="info">{t("onboarding.step2.extractedBadge")}</Badge>}
        </h3>
        <p className="text-[11px] text-text-muted mb-4">
          {t("onboarding.step2.services.hint")}
        </p>
        <div className="flex flex-wrap gap-2">
          {SERVICE_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleService(key)}
              className={`inline-flex items-center px-3 py-1.5 rounded-full border text-[11px] font-mono uppercase tracking-[0.04em] transition-all cursor-pointer ${
                profile.services.includes(key)
                  ? "border-accent bg-accent-subtle text-accent"
                  : "border-border text-text-muted hover:border-border-light hover:text-text-secondary"
              }`}
            >
              {t(`services.${key}`)}
            </button>
          ))}
        </div>
        {profile.customServices.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] text-text-muted mb-2">{t("onboarding.step2.services.additional")}</p>
            <div className="space-y-1">
              {profile.customServices.map((s, i) => (
                <div key={i} className="text-[11px]">
                  <span className="text-text-primary font-medium">{s.label}</span>
                  <span className="text-text-muted"> — {s.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            {t("onboarding.step2.valueProps.section")}
            {extractedFields.has("valueProps") && <Badge color="info">{t("onboarding.step2.extractedBadge")}</Badge>}
          </h3>
          <Button variant="secondary" size="sm" onClick={addValueProp}>
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("onboarding.step2.valueProps.add")}
          </Button>
        </div>
        <p className="text-[11px] text-text-muted mb-3">
          {t("onboarding.step2.valueProps.hint")}
        </p>
        <div className="space-y-2">
          {profile.valueProps.length === 0 && (
            <p className="text-[11px] text-text-muted italic">
              {t("onboarding.step2.valueProps.examples")}
            </p>
          )}
          {profile.valueProps.map((v, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={v}
                onChange={(e) => updateValueProp(i, e.target.value)}
                placeholder={t("onboarding.step2.valueProps.placeholder")}
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => removeValueProp(i)}
                className="text-text-muted hover:text-red-500 cursor-pointer p-2"
                aria-label={t("onboarding.step2.valueProps.remove")}
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function FieldWithBadge({
  label, children, extracted, extractedLabel,
}: {
  label: string; children: React.ReactNode; extracted?: boolean; extractedLabel: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11px] uppercase tracking-wider text-text-muted">{label}</label>
        {extracted && <span className="text-[10px] font-mono text-accent uppercase">{extractedLabel}</span>}
      </div>
      {children}
    </div>
  );
}

// ─── Step 3: remitente ────────────────────────────────────────────────────
function Step3Sender({
  fromEmail, setFromEmail, fromName, setFromName, country, setCountry, tone, setTone,
}: {
  fromEmail: string; setFromEmail: (v: string) => void;
  fromName: string; setFromName: (v: string) => void;
  country: string; setCountry: (v: string) => void;
  tone: string; setTone: (v: string) => void;
}) {
  const { t } = useT();
  const emailError = fromEmail && !isValidEmail(fromEmail);
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h3 className="text-sm font-medium mb-1 flex items-center gap-2">
          <Mail className="h-4 w-4" strokeWidth={1.5} />
          {t("onboarding.step3.section")}
        </h3>
        <p className="text-[11px] text-text-muted mb-5">
          {t("onboarding.step3.hint")}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-text-muted block mb-1.5">
              {t("onboarding.step3.email")}
            </label>
            <Input
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder={t("onboarding.step3.emailPlaceholder")}
              className={emailError ? "border-red-500" : ""}
            />
            <p className="text-[11px] text-text-muted mt-1">
              {t("onboarding.step3.emailHint")}
            </p>
            {emailError && <p className="text-[11px] text-red-500 mt-1">{t("onboarding.step3.emailInvalid")}</p>}
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-text-muted block mb-1.5">
              {t("onboarding.step3.name")}
            </label>
            <Input
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder={t("onboarding.step3.namePlaceholder")}
            />
            <p className="text-[11px] text-text-muted mt-1">
              {t("onboarding.step3.nameHint", { name: fromName || t("onboarding.step3.namePlaceholder") })}
            </p>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-text-muted block mb-1.5">
              {t("onboarding.step3.country")}
            </label>
            <Select value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">{t("onboarding.step3.countryPlaceholder")}</option>
              {COUNTRY_CODES.map((code) => (
                <option key={code} value={code}>{t(`countries.${code}`)}</option>
              ))}
            </Select>
            <p className="text-[11px] text-text-muted mt-1">
              {t("onboarding.step3.countryHint")}
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-medium mb-1">{t("onboarding.step3.tone.section")}</h3>
        <p className="text-[11px] text-text-muted mb-4">
          {t("onboarding.step3.tone.hint")}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {TONE_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTone(key)}
              className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
                tone === key ? "border-accent bg-accent-subtle" : "border-border hover:border-border-light"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{t(`tones.${key}`)}</span>
                {tone === key && <CheckCircle className="h-4 w-4 text-accent" strokeWidth={1.5} />}
              </div>
              <p className="text-[11px] text-text-muted leading-relaxed italic">&ldquo;{t(`onboarding.step3.tone.samples.${key}`)}&rdquo;</p>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Step 4: test + resumen ──────────────────────────────────────────────
function Step4Launch({
  profile, fromEmail, fromName, tone,
  testEmailTo, setTestEmailTo, testSending, testResult, onSendTest,
}: {
  profile: ProfileFields; fromEmail: string; fromName: string; tone: string;
  testEmailTo: string; setTestEmailTo: (v: string) => void;
  testSending: boolean; testResult: { ok: boolean; error?: string } | null;
  onSendTest: () => void;
}) {
  const { t } = useT();
  const countryLabel = profile.country ? t(`countries.${profile.country}`) : "—";
  const toneLabel = TONE_KEYS.includes(tone as (typeof TONE_KEYS)[number])
    ? t(`tones.${tone}`)
    : tone;
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Send className="h-4 w-4" strokeWidth={1.5} />
          {t("onboarding.step4.test.section")} <span className="text-[10px] text-text-muted font-mono">{t("onboarding.step4.test.recommended")}</span>
        </h3>
        <p className="text-[11px] text-text-muted mb-4">
          {t("onboarding.step4.test.hint")}
        </p>
        <div className="flex gap-2">
          <Input
            type="email"
            value={testEmailTo}
            onChange={(e) => setTestEmailTo(e.target.value)}
            placeholder={t("onboarding.step4.test.placeholder")}
            className="flex-1"
          />
          <Button onClick={onSendTest} disabled={testSending || !testEmailTo} size="sm">
            {testSending ? (
              <><RefreshCw className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> {t("onboarding.step4.test.sending")}</>
            ) : (
              <><Send className="h-3.5 w-3.5" strokeWidth={1.5} /> {t("onboarding.step4.test.send")}</>
            )}
          </Button>
        </div>
        {testResult?.ok && (
          <p className="text-[11px] text-success mt-3 flex items-center gap-1.5">
            <CheckCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
            {t("onboarding.step4.test.success")}
          </p>
        )}
        {testResult?.ok === false && (
          <p className="text-[11px] text-red-500 mt-3 font-mono">{t("onboarding.errors.errorPrefix")} {testResult.error}</p>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-medium mb-4">{t("onboarding.step4.summary.section")}</h3>
        <div className="space-y-2 text-xs">
          <SummaryRow label={t("onboarding.step4.summary.agency")} value={profile.name || "—"} />
          {profile.tagline && <SummaryRow label={t("onboarding.step4.summary.tagline")} value={profile.tagline} />}
          <SummaryRow
            label={t("onboarding.step4.summary.signsAs")}
            value={t("onboarding.step4.summary.signsAsValue", { name: fromName || "—", email: fromEmail || "—" })}
          />
          <SummaryRow
            label={t("onboarding.step4.summary.countryTone")}
            value={`${countryLabel} · ${toneLabel}`}
          />
          <SummaryRow
            label={t("onboarding.step4.summary.services")}
            value={profile.services.length ? profile.services.map((k) => t(`services.${k}`)).join(", ") : "—"}
          />
          {profile.valueProps.length > 0 && (
            <SummaryRow
              label={t("onboarding.step4.summary.valueProps")}
              value={t("onboarding.step4.summary.valuePropsCount", { count: profile.valueProps.length })}
            />
          )}
        </div>
      </Card>

      <div className="text-center text-[11px] text-text-muted">
        {t("onboarding.step4.footer")}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
      <span className="text-[11px] uppercase tracking-wider text-text-muted">{label}</span>
      <span className="text-text-primary text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}
