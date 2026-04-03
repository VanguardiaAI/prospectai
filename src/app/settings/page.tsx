"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, Button, Input, Select, Toggle, Spinner, Badge } from "@/components/ui";
import { Zap, TestTube, CheckCircle, XCircle, RefreshCw, MessageCircle, Wifi, WifiOff, Globe, Building, Shield, Clock, Link2, Webhook } from "lucide-react";

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSettings = useCallback(async () => {
    const res = await fetch("/api/settings");
    setSettings(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 nd-section">
        {/* Agency Identity */}
        <Card>
          <h3 className="nd-heading mb-6">
            <Building className="h-4 w-4 inline mr-2" strokeWidth={1.5} />
            Identidad de la Agencia
          </h3>
          <div className="space-y-5">
            <div>
              <label className="nd-label block mb-2">Nombre de la agencia</label>
              <Input value={settings.agency_name || ""} onChange={(e) => setSettings({ ...settings, agency_name: e.target.value })} />
            </div>
            <div>
              <label className="nd-label block mb-2">URL de la agencia</label>
              <Input value={settings.agency_url || ""} onChange={(e) => setSettings({ ...settings, agency_url: e.target.value })} placeholder="tuagencia.com" />
            </div>
            <div>
              <label className="nd-label block mb-2">Descripcion</label>
              <Input value={settings.agency_description || ""} onChange={(e) => setSettings({ ...settings, agency_description: e.target.value })} placeholder="Agencia de desarrollo web y..." />
            </div>
            <div>
              <label className="nd-label block mb-3">Servicios ofrecidos</label>
              <div className="space-y-2">
                {SERVICE_OPTIONS.map((svc) => (
                  <label key={svc.key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enabledServices.includes(svc.key)}
                      onChange={() => toggleService(svc.key)}
                      className="rounded border-border"
                    />
                    <span className="text-sm text-text-secondary">{svc.label}</span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-text-muted mt-2">Los servicios seleccionados se usan en el analisis y generacion de mensajes</p>
            </div>
          </div>
        </Card>

        {/* Country & Locale */}
        <Card>
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
              <p className="text-[11px] text-text-muted mt-1">Determina el idioma de los mensajes y formato de telefono</p>
            </div>
            <div>
              <label className="nd-label block mb-2">Codigo de pais (telefono)</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-muted">+</span>
                <Input value={settings.phone_country_code || ""} onChange={(e) => setSettings({ ...settings, phone_country_code: e.target.value })} className="w-20" />
                <span className="text-[11px] text-text-muted">({settings.phone_digits || "9"} digitos)</span>
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

        {/* Email Settings */}
        <Card>
          <h3 className="nd-heading mb-6">Configuracion de Email</h3>
          <div className="space-y-5">
            <div>
              <label className="nd-label block mb-2">Email remitente</label>
              <Input value={settings.from_email || ""} onChange={(e) => setSettings({ ...settings, from_email: e.target.value })} />
            </div>
            <div>
              <label className="nd-label block mb-2">Nombre remitente</label>
              <Input value={settings.from_name || ""} onChange={(e) => setSettings({ ...settings, from_name: e.target.value })} />
            </div>
            <div>
              <label className="nd-label block mb-2">Limite diario global</label>
              <Input type="number" value={settings.global_daily_limit || ""} onChange={(e) => setSettings({ ...settings, global_daily_limit: e.target.value })} />
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

        {/* WhatsApp Connection */}
        <Card>
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
                <p className="text-[10px] text-text-muted font-mono mt-2">Abre WhatsApp &gt; Dispositivos vinculados &gt; Vincular dispositivo</p>
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
          </div>
        </Card>

        {/* RGPD / Compliance */}
        <Card>
          <h3 className="nd-heading mb-6">
            <Shield className="h-4 w-4 inline mr-2" strokeWidth={1.5} />
            Compliance / RGPD
          </h3>
          <div className="space-y-5">
            <div>
              <label className="nd-label block mb-2">Footer legal (se anade a cada email)</label>
              <textarea
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-transparent text-text-primary focus:outline-none focus:ring-1 focus:ring-text-primary min-h-[80px]"
                value={settings.legal_footer || ""}
                onChange={(e) => setSettings({ ...settings, legal_footer: e.target.value })}
              />
            </div>
            <div>
              <label className="nd-label block mb-2">URL de baja personalizada (opcional)</label>
              <Input
                value={settings.unsubscribe_url || ""}
                onChange={(e) => setSettings({ ...settings, unsubscribe_url: e.target.value })}
                placeholder="Se usa /api/unsubscribe por defecto"
              />
              <p className="text-[11px] text-text-muted mt-1">Los destinatarios pueden darse de baja via link. Se anaden automaticamente al blacklist.</p>
            </div>
            <div>
              <label className="nd-label block mb-2">Reply-To (opcional)</label>
              <Input
                value={settings.reply_to_email || ""}
                onChange={(e) => setSettings({ ...settings, reply_to_email: e.target.value })}
                placeholder="respuestas@tudominio.com"
                type="email"
              />
              <p className="text-[11px] text-text-muted mt-1">Si se configura, las respuestas llegarán a este email en lugar de al remitente.</p>
            </div>
          </div>
        </Card>

        {/* Warmup & Send Window */}
        <Card>
          <h3 className="nd-heading mb-6">
            <Clock className="h-4 w-4 inline mr-2" strokeWidth={1.5} />
            Warmup y Ventana de Envio
          </h3>
          <div className="space-y-5">
            <div className="pt-1">
              <Toggle
                checked={settings.warmup_enabled === "true"}
                onChange={(v) => setSettings({ ...settings, warmup_enabled: String(v) })}
                label="Warmup progresivo"
              />
              <p className="text-[11px] text-text-muted mt-2">Incrementa gradualmente el volumen de envio para proteger la reputacion del dominio</p>
            </div>

            {settings.warmup_enabled === "true" && (
              <div className="space-y-4 pl-1 border-l-2 border-border ml-1 pl-4">
                <div className="flex items-center gap-3">
                  <div>
                    <label className="nd-label block mb-1">Dia actual</label>
                    <Input type="number" value={settings.warmup_day || "1"} onChange={(e) => setSettings({ ...settings, warmup_day: e.target.value })} className="w-20" />
                  </div>
                  <div>
                    <label className="nd-label block mb-1">Inicio</label>
                    <Input type="number" value={settings.warmup_start_limit || "5"} onChange={(e) => setSettings({ ...settings, warmup_start_limit: e.target.value })} className="w-20" />
                  </div>
                  <div>
                    <label className="nd-label block mb-1">+/dia</label>
                    <Input type="number" value={settings.warmup_increment || "5"} onChange={(e) => setSettings({ ...settings, warmup_increment: e.target.value })} className="w-20" />
                  </div>
                  <div>
                    <label className="nd-label block mb-1">Max</label>
                    <Input type="number" value={settings.warmup_max_limit || "50"} onChange={(e) => setSettings({ ...settings, warmup_max_limit: e.target.value })} className="w-20" />
                  </div>
                </div>
                <p className="text-[11px] text-text-muted">
                  Dia {settings.warmup_day || "1"}: limite efectivo = {Math.min(
                    parseInt(settings.warmup_start_limit || "5") + (parseInt(settings.warmup_day || "1") - 1) * parseInt(settings.warmup_increment || "5"),
                    parseInt(settings.warmup_max_limit || "50")
                  )} emails/dia
                </p>
              </div>
            )}

            <div className="flex items-center gap-3">
              <div>
                <label className="nd-label block mb-1">Enviar desde</label>
                <Input type="number" value={settings.send_window_start || "9"} onChange={(e) => setSettings({ ...settings, send_window_start: e.target.value })} className="w-20" />
              </div>
              <span className="text-text-muted mt-5">—</span>
              <div>
                <label className="nd-label block mb-1">Hasta</label>
                <Input type="number" value={settings.send_window_end || "18"} onChange={(e) => setSettings({ ...settings, send_window_end: e.target.value })} className="w-20" />
              </div>
              <span className="text-[11px] text-text-muted mt-5">hrs (horario local)</span>
            </div>
            <p className="text-[11px] text-text-muted">Los emails y WhatsApps solo se envian dentro de esta ventana horaria</p>
          </div>
        </Card>

        {/* Scraping Settings */}
        <Card>
          <h3 className="nd-heading mb-6">Scraping</h3>
          <div className="space-y-5">
            <div>
              <label className="nd-label block mb-2">Concurrencia</label>
              <Input type="number" value={settings.scrape_concurrency || ""} onChange={(e) => setSettings({ ...settings, scrape_concurrency: e.target.value })} />
            </div>
            <div>
              <label className="nd-label block mb-2">Delay entre scrapes (ms)</label>
              <Input type="number" value={settings.scrape_delay_ms || ""} onChange={(e) => setSettings({ ...settings, scrape_delay_ms: e.target.value })} />
            </div>
            <div className="pt-2">
              <Toggle
                checked={settings.autopilot_global === "true"}
                onChange={(v) => setSettings({ ...settings, autopilot_global: String(v) })}
                label="Autopilot global"
              />
              <p className="text-[11px] text-text-muted mt-2 leading-relaxed">Scraping, analisis, generacion y envio automatico</p>
            </div>
          </div>
        </Card>

        {/* Tracking */}
        <Card>
          <h3 className="nd-heading mb-6">
            <Link2 className="h-4 w-4 inline mr-2" strokeWidth={1.5} />
            Tracking de Emails
          </h3>
          <div className="space-y-5">
            <div>
              <label className="nd-label block mb-2">URL base de tracking</label>
              <Input
                value={settings.tracking_base_url || ""}
                onChange={(e) => setSettings({ ...settings, tracking_base_url: e.target.value })}
                placeholder="https://tudominio.com"
              />
              <p className="text-[11px] text-text-muted mt-1">Se usa para pixel de apertura y tracking de clicks. Debe ser accesible publicamente.</p>
            </div>
          </div>
        </Card>

        {/* CRM Webhook */}
        <Card>
          <h3 className="nd-heading mb-6">
            <Webhook className="h-4 w-4 inline mr-2" strokeWidth={1.5} />
            Integracion CRM
          </h3>
          <div className="space-y-5">
            <div>
              <label className="nd-label block mb-2">Webhook URL</label>
              <Input
                value={settings.crm_webhook_url || ""}
                onChange={(e) => setSettings({ ...settings, crm_webhook_url: e.target.value })}
                placeholder="https://hooks.zapier.com/..."
              />
              <p className="text-[11px] text-text-muted mt-1">Se envia un POST con datos del lead. Compatible con Zapier, Make, n8n.</p>
            </div>
            <div>
              <label className="nd-label block mb-2">Disparar cuando el lead</label>
              <Select
                value={settings.crm_webhook_on || "replied"}
                onChange={(e) => setSettings({ ...settings, crm_webhook_on: e.target.value })}
              >
                <option value="replied">Responde (replied)</option>
                <option value="contacted">Es contactado (contacted)</option>
                <option value="replied,contacted">Responde o es contactado</option>
              </Select>
            </div>
          </div>
        </Card>

        {/* Google Maps Scraper Settings */}
        <Card>
          <h3 className="nd-heading mb-6">Google Maps Scraper</h3>
          <div className="space-y-5">
            <div>
              <label className="nd-label block mb-2">URL del scraper</label>
              <Input
                value={settings.gmaps_scraper_url || ""}
                onChange={(e) => setSettings({ ...settings, gmaps_scraper_url: e.target.value })}
                placeholder="http://localhost:8080"
              />
              <p className="text-[11px] text-text-muted mt-1">URL donde corre el contenedor Docker de google-maps-scraper</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 nd-section">
        {/* Test Connections */}
        <Card>
          <h3 className="nd-heading mb-5">Probar conexiones</h3>
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

        {/* Manual Job Execution */}
        <Card>
          <h3 className="nd-heading mb-2">Ejecutar jobs</h3>
          <p className="nd-label text-text-muted mb-5">Ejecuta los procesos de background manualmente</p>
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
              <Zap className="h-3 w-3 text-accent" strokeWidth={1.5} /> Ejecutar todo
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
