# Mejoras del sistema de email

Diagnóstico realizado: 2026-04-02

## Implementado

- [x] Header `List-Unsubscribe` + `List-Unsubscribe-Post` en cada email enviado
- [x] URL de unsubscribe absoluta
- [x] Enlace de baja clicable inyectado en el HTML del email
- [x] Texto de baja añadido a la versión plaintext
- [x] Soporte de headers personalizados y reply-to en resend-client
- [x] **Tracking silencioso**: `console.warn` cuando `tracking_base_url` está vacía (`tracking.ts`)
- [x] **Footer legal**: eliminada la instrucción de footer del prompt de Gemini — se inyecta automáticamente por el sistema. Default `legal_footer` actualizado (sin "responde con BAJA")
- [x] **Reply-To configurable**: setting `reply_to_email` + pasado en `sendEmail()` del cron
- [x] **Warmup por dominio**: campos `warmup_start_limit` / `warmup_increment` en `sending_domains`. El cron calcula límite efectivo por dominio e incrementa `warmup_day` individualmente
- [x] **Bounce rate monitoring**: calculado en dashboard API (7d window). Warning visual ≥2%, banner crítico + pausa automática ≥5%

---

## Pendiente: Subdominio de envío

### Por qué

Using your main domain for cold outreach risks its reputation.
If you accumulate bounces or spam reports, it affects all emails (transactional, invoices, clients).

### What to do

1. **Create subdomain** `mail.yourdomain.com` (or `outreach.yourdomain.com`)
2. **Verify in Resend** → Domain Settings → Add domain → `mail.yourdomain.com`
3. **Add DNS records** provided by Resend:
   - SPF: `mail.yourdomain.com TXT "v=spf1 include:amazonses.com ~all"`
   - DKIM: the one Resend generates (CNAME or TXT record)
   - MX: if you want to receive replies on the subdomain
4. **Configure DMARC** on root domain (if not exists):
   ```
   _dmarc.yourdomain.com TXT "v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com; pct=100"
   ```
   Start with `p=none` to monitor, then upgrade to `p=quarantine`.
5. **Update sendingDomains** in the app: add `mail.yourdomain.com` with its fromEmail and API key
6. **Warmup** the subdomain from 5 emails/day increasing gradually (already supported by the system)

### Target structure

| Use                      | Domain               | From                           |
|--------------------------|----------------------|--------------------------------|
| Cold outreach            | mail.yourdomain.com  | hello@mail.yourdomain.com      |
| Transactional / clients  | yourdomain.com       | hello@yourdomain.com           |

---

## Pendiente: Verificación de emails pre-envío

### Problema actual

Se envía a cualquier email encontrado por scraping o importación sin verificar si existe.
Emails inválidos generan hard bounces que dañan la reputación.

### Solución propuesta

- Integrar verificación de email (ZeroBounce, NeverBounce, o Reacher self-hosted)
- Verificar antes de generar el email, no antes de enviar
- Marcar emails no verificables como "risky" y excluir del envío automático
