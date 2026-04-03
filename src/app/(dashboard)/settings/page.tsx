"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, Button, Input, Select, Toggle, Spinner, Badge, ProgressBar } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { Zap, TestTube, CheckCircle, XCircle, RefreshCw, MessageCircle, Wifi, WifiOff, Globe, Building, Shield, Clock, Link2, Webhook, Settings2, Play, Square } from "lucide-react";

interface ConnectionTest {
  ok: boolean;
  error?: string;
}

interface WAStatus {
  status: "disconnected" | "qr_pending" | "authenticating" | "ready" | "error";
  qrDataUrl: string | null;
  error: string | null;
  phone: string | null;
}

const SERVICE_OPTIONS = [
  { key: "web_development", label: "Desarrollo Web" },
  { key: "seo", label: "SEO y Posicionamiento" },
  { key: "ai_agents", label: "Agentes IA / Chatbots" },
  { key: "google_business", label: "Google Business Profile" },
  { key: "social_media", label: "Redes Sociales" },
];

const COUNTRY_OPTIONS = [
  { code: "ES", label: "España", phoneCode: "34", phoneDigits: "9" },
  { code: "MX", label: "México", phoneCode: "52", phoneDigits: "10" },
  { code: "AR", label: "Argentina", phoneCode: "54", phoneDigits: "10" },
  { code: "CO", label: "Colombia", phoneCode: "57", phoneDigits: "10" },
  { code: "CL", label: "Chile", phoneCode: "56", phoneDigits: "9" },
  { code: "PE", label: "Perú", phoneCode: "51", phoneDigits: "9" },
  { code: "EC", label: "Ecuador", phoneCode: "593", phoneDigits: "9" },
  { code: "UY", label: "Uruguay", phoneCode: "598", phoneDigits: "8" },
  { code: "US", label: "Estados Unidos", phoneCode: "1", phoneDigits: "10" },
  { code: "UK", label: "Reino Unido", phoneCode: "44", phoneDigits: "10" },
  { code: "CA", label: "Canadá", phoneCode: "1", phoneDigits: "10" },
  { code: "AU", label: "Australia", phoneCode: "61", phoneDigits: "9" },
  { code: "BR", label: "Brasil", phoneCode: "55", phoneDigits: "11" },
  { code: "PT", label: "Portugal", phoneCode: "351", phoneDigits: "9" },
  { code: "FR", label: "Francia", phoneCode: "33", phoneDigits: "9" },
  { code: "DE", label: "Alemania", phoneCode: "49", phoneDigits: "11" },
  { code: "IT", label: "Italia", phoneCode: "39", phoneDigits: "10" },
  { code: "NL", label: "Países Bajos", phoneCode: "31", phoneDigits: "9" },
];

// ─── Validation helpers ────────────────────────────────────────────
function validateEmail(value: string): string | null {
  if (!value) return null; // empty is OK (optional)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : "Email no valido";
}

function validateUrl(value: string): string | null {
  if (!value) return null;
  try {
    const withProto = /^https?:\/\//.test(value) ? value : `https://${value}`;
    new URL(withProto);
    return null;
  } catch {
    return "URL no valida";
  }
}

function validatePositiveInt(value: string): string | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? null : "Debe ser un entero positivo";
}

type Validator = (v: string) => string | null;
const FIELD_VALIDATORS: Record<string, Validator> = {
  from_email: validateEmail,
  reply_to_email: validateEmail,
  agency_url: validateUrl,
  tracking_base_url: validateUrl,
  gmaps_scraper_url: validateUrl,
  crm_webhook_url: validateUrl,
  unsubscribe_url: validateUrl,
  global_daily_limit: validatePositiveInt,
  warmup_start_limit: validatePositiveInt,
  warmup_increment: validatePositiveInt,
  warmup_max_limit: validatePositiveInt,
  warmup_day: validatePositiveInt,
  send_window_start: validatePositiveInt,
  send_window_end: validatePositiveInt,
  scrape_concurrency: validatePositiveInt,
  scrape_delay_ms: validatePositiveInt,
  wa_daily_limit: validatePositiveInt,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, ConnectionTest> | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<string | null>(null);
  const [waStatus, setWaStatus] = useState<WAStatus>({ status: "disconnected", qrDataUrl: null, error: null, phone: null });
  const [waConnecting, setWaConnecting] = useState(false);
  const [schedulerRunning, setSchedulerRunning] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  // Per-field validation: only shows errors for fields the user has interacted with
  const getError = (key: string): string | null => {
    if (!touched[key]) return null;
    const validator = FIELD_VALIDATORS[key];
    return validator ? validator(settings[key] || "") : null;
  };

  const markTouched = (key: string) => {
    if (!touched[key]) setTouched(prev => ({ ...prev, [key]: true }));
  };

  const fieldProps = (key: string) => {
    const error = getError(key);
    return {
      onBlur: () => markTouched(key),
      className: error ? "border-red-500 focus:ring-red-500" : "",
    };
  };

  const fetchSettings = useCallback(async () => {
    const res = await fetch("/api/settings");
    setSettings(await res.json());
    setLoading(false);
  }, []);

  const fetchSchedulerStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/scheduler");
      const data = await res.json();
      setSchedulerRunning(data.running);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchSettings(); fetchSchedulerStatus(); }, [fetchSettings, fetchSchedulerStatus]);

  const pollWAStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/status");
      const data: WAStatus = await res.json();
      setWaStatus(data);
      if (data.status === "ready" || data.status === "error" || data.status === "disconnected") {
        setWaConnecting(false);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    pollWAStatus();
    pollRef.current = setInterval(pollWAStatus, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [pollWAStatus]);

  const connectWA = async () => {
    setWaConnecting(true);
    await fetch("/api/whatsapp/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "connect" }),
    });
  };

  const disconnectWA = async () => {
    await fetch("/api/whatsapp/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disconnect" }),
    });
    setWaStatus({ status: "disconnected", qrDataUrl: null, error: null, phone: null });
  };

  const save = async () => {
    // Validate all fields before saving
    const errors: string[] = [];
    for (const [key, validator] of Object.entries(FIELD_VALIDATORS)) {
      const err = validator(settings[key] || "");
      if (err) errors.push(key);
    }
    if (errors.length > 0) {
      // Mark all invalid fields as touched so errors show
      setTouched(prev => {
        const next = { ...prev };
        for (const k of errors) next[k] = true;
        return next;
      });
      toast("Corrige los campos con errores antes de guardar", "error");
      return;
    }

    setSaving(true);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const testConnections = async () => {
    setTesting(true);
    setTestResults(null);
    const res = await fetch("/api/test-connections");
    setTestResults(await res.json());
    setTesting(false);
  };

  const runJobs = async (action: string) => {
    setProcessing(true);
    setProcessResult(null);
    const res = await fetch(`/api/cron?action=${action}`, { method: "POST" });
    const data = await res.json();
    setProcessResult(JSON.stringify(data, null, 2));
    setProcessing(false);
  };

  const toggleService = (key: string) => {
    const current = (settings.agency_services || "").split(",").map((s) => s.trim()).filter(Boolean);
    const updated = current.includes(key)
      ? current.filter((s) => s !== key)
      : [...current, key];
    setSettings({ ...settings, agency_services: updated.join(",") });
  };

  const handleCountryChange = (code: string) => {
    const country = COUNTRY_OPTIONS.find((c) => c.code === code);
    if (country) {
      setSettings({
        ...settings,
        target_country: code,
        phone_country_code: country.phoneCode,
        phone_digits: country.phoneDigits,
      });
    }
  };

  const enabledServices = (settings.agency_services || "").split(",").map((s) => s.trim()).filter(Boolean);

  // Warmup effective limit calculation
  const warmupEffective = Math.min(
    parseInt(settings.warmup_start_limit || "5") + (parseInt(settings.warmup_day || "1") - 1) * parseInt(settings.warmup_increment || "5"),
    parseInt(settings.warmup_max_limit || "50")
  );
  const warmupPct = parseInt(settings.warmup_max_limit || "50") > 0
    ? Math.round((warmupEffective / parseInt(settings.warmup_max_limit || "50")) * 100)
    : 0;

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div>
      {/* Header */}
      <div className="nd-page-header">
        <div>
          <h1>Config</h1>
          <p className="nd-label mt-2">Ajustes globales del sistema</p>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "[GUARDANDO...]" : "Guardar cambios"}
          </Button>
          {saved && <span className="nd-label text-success">[SAVED]</span>}
        </div>
      </div>

      {/* ─── Bento Row 1: Identity + Country ─── */}
      <div className="grid grid-cols-12 gap-4 nd-section">
        <Card className="col-span-12 lg:col-span-8">
          <h3 className="nd-heading mb-6">
            <Building className="h-4 w-4 inline mr-2" strokeWidth={1.5} />
            Identidad de la Agencia
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <div>
              <label className="nd-label block mb-2">Nombre de la agencia</label>
              <Input value={settings.agency_name || ""} onChange={(e) => setSettings({ ...settings, agency_name: e.target.value })} />
            </div>
            <div>
              <label className="nd-label block mb-2">URL de la agencia</label>
              <Input value={settings.agency_url || ""} onChange={(e) => setSettings({ ...settings, agency_url: e.target.value })} placeholder="tuagencia.com" {...fieldProps("agency_url")} />
              {getError("agency_url") && <p className="text-[11px] text-red-500 mt-1">{getError("agency_url")}</p>}
            </div>
            <div className="md:col-span-2">
              <label className="nd-label block mb-2">Descripcion</label>
              <Input value={settings.agency_description || ""} onChange={(e) => setSettings({ ...settings, agency_description: e.target.value })} placeholder="Agencia de desarrollo web y..." />
            </div>
            <div className="md:col-span-2">
              <label className="nd-label block mb-3">Servicios ofrecidos</label>
              <div className="flex flex-wrap gap-2">
                {SERVICE_OPTIONS.map((svc) => (
                  <button
                    key={svc.key}
                    onClick={() => toggleService(svc.key)}
                    className={`inline-flex items-center px-3 py-1.5 rounded-full border text-[11px] font-mono uppercase tracking-[0.04em] transition-all cursor-pointer ${
                      enabledServices.includes(svc.key)
                        ? "border-accent bg-accent-subtle text-accent"
                        : "border-border text-text-muted hover:border-border-light hover:text-text-secondary"
                    }`}
                  >
                    {svc.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-text-muted mt-2">Los servicios seleccionados se usan en el analisis y generacion de mensajes</p>
            </div>
          </div>
        </Card>

        <Card className="col-span-12 lg:col-span-4">
          <h3 className="nd-heading mb-6">
            <Globe className="h-4 w-4 inline mr-2" strokeWidth={1.5} />
            Pais y Localizacion
          </h3>
          <div className="space-y-5">
            <div>
              <label className="nd-label block mb-2">Pais objetivo</label>
              <Select value={settings.target_country || "ES"} onChange={(e) => handleCountryChange(e.target.value)}>
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="nd-label block mb-2">Codigo de pais</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-muted">+</span>
                <Input value={settings.phone_country_code || ""} onChange={(e) => setSettings({ ...settings, phone_country_code: e.target.value })} className="w-20" />
                <span className="text-[11px] text-text-muted">({settings.phone_digits || "9"} dig.)</span>
              </div>
            </div>
            <div>
              <label className="nd-label block mb-2">Moneda</label>
              <Select value={settings.currency || "EUR"} onChange={(e) => setSettings({ ...settings, currency: e.target.value })}>
                <option value="EUR">EUR - Euro</option>
                <option value="USD">USD - Dolar</option>
                <option value="MXN">MXN - Peso Mexicano</option>
                <option value="GBP">GBP - Libra</option>
                <option value="ARS">ARS - Peso Argentino</option>
                <option value="COP">COP - Peso Colombiano</option>
                <option value="CLP">CLP - Peso Chileno</option>
                <option value="PEN">PEN - Sol Peruano</option>
                <option value="BRL">BRL - Real</option>
                <option value="AUD">AUD - Dolar Australiano</option>
                <option value="CAD">CAD - Dolar Canadiense</option>
              </Select>
            </div>
          </div>
        </Card>
      </div>

      {/* ─── Bento Row 2: Email + Warmup + Scraping ─── */}
      <div className="grid grid-cols-12 gap-4 nd-section">
        <Card className="col-span-12 md:col-span-4">
          <h3 className="nd-heading mb-6">Email</h3>
          <div className="space-y-5">
            <div>
              <label className="nd-label block mb-2">Email remitente</label>
              <Input value={settings.from_email || ""} onChange={(e) => setSettings({ ...settings, from_email: e.target.value })} {...fieldProps("from_email")} />
              {getError("from_email") && <p className="text-[11px] text-red-500 mt-1">{getError("from_email")}</p>}
            </div>
            <div>
              <label className="nd-label block mb-2">Nombre remitente</label>
              <Input value={settings.from_name || ""} onChange={(e) => setSettings({ ...settings, from_name: e.target.value })} />
            </div>
            <div>
              <label className="nd-label block mb-2">Limite diario</label>
              <Input type="number" value={settings.global_daily_limit || ""} onChange={(e) => setSettings({ ...settings, global_daily_limit: e.target.value })} {...fieldProps("global_daily_limit")} />
              {getError("global_daily_limit") && <p className="text-[11px] text-red-500 mt-1">{getError("global_daily_limit")}</p>}
            </div>
            <div>
              <label className="nd-label block mb-2">Tono por defecto</label>
              <Select value={settings.default_tone || "profesional"} onChange={(e) => setSettings({ ...settings, default_tone: e.target.value })}>
                <option value="profesional">Profesional</option>
                <option value="amigable">Amigable</option>
                <option value="directo">Directo</option>
                <option value="consultivo">Consultivo</option>
                <option value="casual">Casual</option>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="col-span-12 md:col-span-5" texture>
          <h3 className="nd-heading mb-6">
            <Clock className="h-4 w-4 inline mr-2" strokeWidth={1.5} />
            Warmup y Ventana de Envio
          </h3>
          <div className="space-y-5">
            <div>
              <Toggle
                checked={settings.warmup_enabled === "true"}
                onChange={(v) => setSettings({ ...settings, warmup_enabled: String(v) })}
                label="Warmup progresivo"
              />
              <p className="text-[11px] text-text-muted mt-2">Incrementa gradualmente el volumen de envio</p>
            </div>

            {settings.warmup_enabled === "true" && (
              <div className="space-y-4 pl-4 border-l-2 border-border">
                <div className="flex items-center gap-3">
                  <div>
                    <label className="nd-label block mb-1">Dia</label>
                    <Input type="number" value={settings.warmup_day || "1"} onChange={(e) => setSettings({ ...settings, warmup_day: e.target.value })} className={`w-16 ${getError("warmup_day") ? "border-red-500" : ""}`} onBlur={() => markTouched("warmup_day")} />
                  </div>
                  <div>
                    <label className="nd-label block mb-1">Inicio</label>
                    <Input type="number" value={settings.warmup_start_limit || "5"} onChange={(e) => setSettings({ ...settings, warmup_start_limit: e.target.value })} className={`w-16 ${getError("warmup_start_limit") ? "border-red-500" : ""}`} onBlur={() => markTouched("warmup_start_limit")} />
                  </div>
                  <div>
                    <label className="nd-label block mb-1">+/dia</label>
                    <Input type="number" value={settings.warmup_increment || "5"} onChange={(e) => setSettings({ ...settings, warmup_increment: e.target.value })} className={`w-16 ${getError("warmup_increment") ? "border-red-500" : ""}`} onBlur={() => markTouched("warmup_increment")} />
                  </div>
                  <div>
                    <label className="nd-label block mb-1">Max</label>
                    <Input type="number" value={settings.warmup_max_limit || "50"} onChange={(e) => setSettings({ ...settings, warmup_max_limit: e.target.value })} className={`w-16 ${getError("warmup_max_limit") ? "border-red-500" : ""}`} onBlur={() => markTouched("warmup_max_limit")} />
                  </div>
                </div>
                {(getError("warmup_day") || getError("warmup_start_limit") || getError("warmup_increment") || getError("warmup_max_limit")) && (
                  <p className="text-[11px] text-red-500">Los valores de warmup deben ser enteros positivos</p>
                )}
                <ProgressBar
                  value={warmupPct}
                  label={`Dia ${settings.warmup_day || "1"}: ${warmupEffective} emails/dia`}
                  color={warmupPct >= 100 ? "success" : "warning"}
                  size="sm"
                />
              </div>
            )}

            <div className="flex items-center gap-3">
              <div>
                <label className="nd-label block mb-1">Desde</label>
                <Input type="number" value={settings.send_window_start || "9"} onChange={(e) => setSettings({ ...settings, send_window_start: e.target.value })} className={`w-16 ${getError("send_window_start") ? "border-red-500" : ""}`} onBlur={() => markTouched("send_window_start")} />
              </div>
              <span className="text-text-muted mt-5">--</span>
              <div>
                <label className="nd-label block mb-1">Hasta</label>
                <Input type="number" value={settings.send_window_end || "18"} onChange={(e) => setSettings({ ...settings, send_window_end: e.target.value })} className={`w-16 ${getError("send_window_end") ? "border-red-500" : ""}`} onBlur={() => markTouched("send_window_end")} />
              </div>
              <span className="text-[11px] text-text-muted mt-5">hrs</span>
            </div>
            {(getError("send_window_start") || getError("send_window_end")) && (
              <p className="text-[11px] text-red-500">Las horas deben ser enteros positivos</p>
            )}
          </div>
        </Card>

        <Card className="col-span-12 md:col-span-3">
          <h3 className="nd-heading mb-6">
            <Settings2 className="h-4 w-4 inline mr-2" strokeWidth={1.5} />
            Scraping
          </h3>
          <div className="space-y-5">
            <div>
              <label className="nd-label block mb-2">Concurrencia</label>
              <Input type="number" value={settings.scrape_concurrency || ""} onChange={(e) => setSettings({ ...settings, scrape_concurrency: e.target.value })} {...fieldProps("scrape_concurrency")} />
              {getError("scrape_concurrency") && <p className="text-[11px] text-red-500 mt-1">{getError("scrape_concurrency")}</p>}
            </div>
            <div>
              <label className="nd-label block mb-2">Delay (ms)</label>
              <Input type="number" value={settings.scrape_delay_ms || ""} onChange={(e) => setSettings({ ...settings, scrape_delay_ms: e.target.value })} {...fieldProps("scrape_delay_ms")} />
              {getError("scrape_delay_ms") && <p className="text-[11px] text-red-500 mt-1">{getError("scrape_delay_ms")}</p>}
            </div>
            <div className="pt-2">
              <Toggle
                checked={settings.autopilot_global === "true"}
                onChange={(v) => setSettings({ ...settings, autopilot_global: String(v) })}
                label="Autopilot"
              />
              <p className="text-[11px] text-text-muted mt-2 leading-relaxed">Todo automatico</p>
            </div>
          </div>
        </Card>
      </div>

      {/* ─── Bento Row 3: WhatsApp + RGPD ─── */}
      <div className="grid grid-cols-12 gap-4 nd-section">
        <Card className="col-span-12 lg:col-span-5">
          <h3 className="nd-heading mb-6">
            <MessageCircle className="h-4 w-4 inline mr-2" strokeWidth={1.5} />
            WhatsApp
          </h3>
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <span className="nd-label">Estado</span>
              <div className="flex items-center gap-2">
                {waStatus.status === "ready" ? (
                  <Badge color="success"><Wifi className="h-3 w-3 mr-1" strokeWidth={1.5} /> CONECTADO</Badge>
                ) : waStatus.status === "qr_pending" ? (
                  <Badge color="warning">ESCANEAR QR</Badge>
                ) : waStatus.status === "authenticating" ? (
                  <Badge color="info"><RefreshCw className="h-3 w-3 mr-1 animate-spin" strokeWidth={1.5} /> AUTENTICANDO</Badge>
                ) : waStatus.status === "error" ? (
                  <Badge color="danger"><XCircle className="h-3 w-3 mr-1" strokeWidth={1.5} /> ERROR</Badge>
                ) : (
                  <Badge><WifiOff className="h-3 w-3 mr-1" strokeWidth={1.5} /> DESCONECTADO</Badge>
                )}
              </div>
            </div>

            {waStatus.phone && (
              <div className="flex items-center justify-between">
                <span className="nd-label">Numero</span>
                <span className="text-sm text-text-primary font-mono">+{waStatus.phone}</span>
              </div>
            )}

            {waStatus.qrDataUrl && (
              <div className="flex flex-col items-center py-4">
                <p className="nd-label mb-3">Escanea con WhatsApp</p>
                <img src={waStatus.qrDataUrl} alt="QR Code" className="w-48 h-48 rounded-lg" />
                <p className="text-[10px] text-text-muted font-mono mt-2">Abre WhatsApp &gt; Dispositivos vinculados</p>
              </div>
            )}

            {waStatus.error && waStatus.status === "error" && (
              <p className="text-[11px] text-accent font-mono">[ERROR] {waStatus.error}</p>
            )}

            <div className="flex gap-2 pt-2">
              {waStatus.status === "disconnected" || waStatus.status === "error" ? (
                <Button size="sm" onClick={connectWA} disabled={waConnecting}>
                  {waConnecting ? (
                    <><RefreshCw className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> Conectando...</>
                  ) : (
                    <><Wifi className="h-3.5 w-3.5" strokeWidth={1.5} /> Conectar WhatsApp</>
                  )}
                </Button>
              ) : waStatus.status === "ready" ? (
                <Button size="sm" variant="danger" onClick={disconnectWA}>
                  <WifiOff className="h-3.5 w-3.5" strokeWidth={1.5} /> Desconectar
                </Button>
              ) : null}
            </div>

            <div className="mt-4 pt-4 border-t border-border">
              <label className="nd-label block mb-2">Limite diario WA</label>
              <Input
                type="number"
                value={settings.wa_daily_limit || "20"}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSettings({ ...settings, wa_daily_limit: e.target.value })}
                {...fieldProps("wa_daily_limit")}
              />
              {getError("wa_daily_limit") && <p className="text-[11px] text-accent mt-1 font-mono">{getError("wa_daily_limit")}</p>}
              <p className="text-[11px] text-text-muted mt-1 font-mono">Maximo de WhatsApps enviados por dia</p>
            </div>
          </div>
        </Card>

        <Card className="col-span-12 lg:col-span-7">
          <h3 className="nd-heading mb-6">
            <Shield className="h-4 w-4 inline mr-2" strokeWidth={1.5} />
            Compliance / RGPD
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <div className="md:col-span-2">
              <label className="nd-label block mb-2">Footer legal (se anade a cada email)</label>
              <textarea
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-transparent text-text-primary focus:outline-none focus:ring-1 focus:ring-text-primary min-h-[80px] font-mono"
                value={settings.legal_footer || ""}
                onChange={(e) => setSettings({ ...settings, legal_footer: e.target.value })}
              />
            </div>
            <div>
              <label className="nd-label block mb-2">URL de baja (opcional)</label>
              <Input
                value={settings.unsubscribe_url || ""}
                onChange={(e) => setSettings({ ...settings, unsubscribe_url: e.target.value })}
                placeholder="/api/unsubscribe"
                {...fieldProps("unsubscribe_url")}
              />
              {getError("unsubscribe_url") ? <p className="text-[11px] text-red-500 mt-1">{getError("unsubscribe_url")}</p> : <p className="text-[11px] text-text-muted mt-1">Se anaden auto al blacklist.</p>}
            </div>
            <div>
              <label className="nd-label block mb-2">Reply-To (opcional)</label>
              <Input
                value={settings.reply_to_email || ""}
                onChange={(e) => setSettings({ ...settings, reply_to_email: e.target.value })}
                placeholder="respuestas@tudominio.com"
                type="email"
                {...fieldProps("reply_to_email")}
              />
              {getError("reply_to_email") ? <p className="text-[11px] text-red-500 mt-1">{getError("reply_to_email")}</p> : <p className="text-[11px] text-text-muted mt-1">Respuestas llegan aqui.</p>}
            </div>
          </div>
        </Card>
      </div>

      {/* ─── Bento Row 4: Tracking + CRM + Google Maps ─── */}
      <div className="grid grid-cols-12 gap-4 nd-section">
        <Card className="col-span-12 md:col-span-4">
          <h3 className="nd-heading mb-6">
            <Link2 className="h-4 w-4 inline mr-2" strokeWidth={1.5} />
            Tracking
          </h3>
          <div>
            <label className="nd-label block mb-2">URL base</label>
            <Input
              value={settings.tracking_base_url || ""}
              onChange={(e) => setSettings({ ...settings, tracking_base_url: e.target.value })}
              placeholder="https://tudominio.com"
              {...fieldProps("tracking_base_url")}
            />
            {getError("tracking_base_url") ? <p className="text-[11px] text-red-500 mt-1">{getError("tracking_base_url")}</p> : <p className="text-[11px] text-text-muted mt-1">Pixel apertura y clicks. Debe ser publica.</p>}
          </div>
        </Card>

        <Card className="col-span-12 md:col-span-4">
          <h3 className="nd-heading mb-6">
            <Webhook className="h-4 w-4 inline mr-2" strokeWidth={1.5} />
            CRM Webhook
          </h3>
          <div className="space-y-5">
            <div>
              <label className="nd-label block mb-2">Webhook URL</label>
              <Input
                value={settings.crm_webhook_url || ""}
                onChange={(e) => setSettings({ ...settings, crm_webhook_url: e.target.value })}
                placeholder="https://hooks.zapier.com/..."
                {...fieldProps("crm_webhook_url")}
              />
              {getError("crm_webhook_url") && <p className="text-[11px] text-red-500 mt-1">{getError("crm_webhook_url")}</p>}
            </div>
            <div>
              <label className="nd-label block mb-2">Disparar cuando</label>
              <Select
                value={settings.crm_webhook_on || "replied"}
                onChange={(e) => setSettings({ ...settings, crm_webhook_on: e.target.value })}
              >
                <option value="replied">Responde</option>
                <option value="contacted">Es contactado</option>
                <option value="replied,contacted">Ambos</option>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="col-span-12 md:col-span-4">
          <h3 className="nd-heading mb-6">Google Maps Scraper</h3>
          <div className="space-y-5">
            <div>
              <label className="nd-label block mb-2">URL del scraper</label>
              <Input
                value={settings.gmaps_scraper_url || ""}
                onChange={(e) => setSettings({ ...settings, gmaps_scraper_url: e.target.value })}
                placeholder="http://localhost:8080"
                {...fieldProps("gmaps_scraper_url")}
              />
              {getError("gmaps_scraper_url") && <p className="text-[11px] text-red-500 mt-1">{getError("gmaps_scraper_url")}</p>}
            </div>
            <div>
              <label className="nd-label block mb-2">API Key (opcional)</label>
              <Input
                type="password"
                value={settings.gmaps_scraper_api_key || ""}
                onChange={(e) => setSettings({ ...settings, gmaps_scraper_api_key: e.target.value })}
                placeholder="Dejar vacío si no se configuró"
              />
            </div>
          </div>
        </Card>
      </div>

      {/* ─── Bento Row 5: Test + Jobs ─── */}
      <div className="grid grid-cols-12 gap-4 nd-section">
        <Card className="col-span-12 lg:col-span-5">
          <h3 className="nd-heading mb-5">
            <TestTube className="h-4 w-4 inline mr-2" strokeWidth={1.5} />
            Probar conexiones
          </h3>
          <Button variant="secondary" size="sm" onClick={testConnections} disabled={testing}>
            {testing ? (
              <><RefreshCw className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> Probando...</>
            ) : (
              <><TestTube className="h-3.5 w-3.5" strokeWidth={1.5} /> Probar APIs</>
            )}
          </Button>

          {testResults && (
            <div className="mt-5">
              {Object.entries(testResults).map(([key, val], i) => (
                <div key={key} className={`nd-list-item ${i === 0 ? "pt-0" : ""}`}>
                  <span className="nd-list-label">{key}</span>
                  {val.ok ? (
                    <Badge color="success"><CheckCircle className="h-3 w-3 mr-1" strokeWidth={1.5} /> OK</Badge>
                  ) : (
                    <Badge color="danger"><XCircle className="h-3 w-3 mr-1" strokeWidth={1.5} /> ERROR</Badge>
                  )}
                </div>
              ))}
              {Object.entries(testResults).some(([, v]) => !v.ok) && (
                <div className="mt-3 text-[11px] text-accent font-mono">
                  {Object.entries(testResults).filter(([, v]) => !v.ok).map(([k, v]) => (
                    <p key={k}>[ERROR] {k}: {v.error}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Scheduler */}
        <Card className="col-span-12 lg:col-span-5">
          <h3 className="nd-heading mb-2">
            <Clock className="h-4 w-4 inline mr-2 text-accent" strokeWidth={1.5} />
            Scheduler automatico
          </h3>
          <p className="nd-label text-text-muted mb-4">Ejecuta scraping, generacion y envio cada 5 minutos</p>
          <div className="flex items-center gap-4">
            <Badge color={schedulerRunning ? "success" : "default"}>
              {schedulerRunning ? "ACTIVO" : "INACTIVO"}
            </Badge>
            <Button
              size="sm"
              variant={schedulerRunning ? "danger" : "success"}
              onClick={async () => {
                const action = schedulerRunning ? "stop" : "start";
                await fetch("/api/scheduler", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action }),
                });
                setSchedulerRunning(!schedulerRunning);
                toast(schedulerRunning ? "Scheduler detenido" : "Scheduler iniciado", schedulerRunning ? "warning" : "success");
              }}
            >
              {schedulerRunning ? (
                <><Square className="h-3 w-3" strokeWidth={1.5} /> Detener</>
              ) : (
                <><Play className="h-3 w-3" strokeWidth={1.5} /> Iniciar</>
              )}
            </Button>
          </div>
        </Card>

        <Card className="col-span-12 lg:col-span-7" texture>
          <h3 className="nd-heading mb-2">
            <Zap className="h-4 w-4 inline mr-2 text-accent" strokeWidth={1.5} />
            Ejecutar jobs
          </h3>
          <p className="nd-label text-text-muted mb-5">Ejecuta procesos de background manualmente</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => runJobs("scrape")} disabled={processing}>
              Scraping + Analisis
            </Button>
            <Button variant="secondary" size="sm" onClick={() => runJobs("generate")} disabled={processing}>
              Generar Emails
            </Button>
            <Button variant="secondary" size="sm" onClick={() => runJobs("send")} disabled={processing}>
              Enviar Emails
            </Button>
            <Button variant="secondary" size="sm" onClick={() => runJobs("send_wa")} disabled={processing}>
              Enviar WhatsApps
            </Button>
            <Button variant="secondary" size="sm" onClick={() => runJobs("sequences")} disabled={processing}>
              Procesar Secuencias
            </Button>
            <Button size="sm" onClick={() => runJobs("all")} disabled={processing}>
              <Zap className="h-3 w-3" strokeWidth={1.5} /> Ejecutar todo
            </Button>
          </div>
          {processResult && (
            <pre className="mt-4 px-4 py-3 border border-border rounded-lg text-[11px] text-text-secondary font-mono overflow-x-auto leading-relaxed">{processResult}</pre>
          )}
        </Card>
      </div>
    </div>
  );
}
