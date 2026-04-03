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

Usar `vanguardia.dev` para cold outreach pone en riesgo la reputación del dominio principal.
Si acumula bounces o spam reports, afecta a todos los emails (transaccionales, facturas, clientes).

### Qué hacer

1. **Crear subdominio** `mail.vanguardia.dev` (o `outreach.vanguardia.dev`)
2. **Verificar en Resend** → Domain Settings → Add domain → `mail.vanguardia.dev`
3. **Añadir registros DNS** que Resend proporcione:
   - SPF: `mail.vanguardia.dev TXT "v=spf1 include:amazonses.com ~all"`
   - DKIM: el que Resend genere (registro CNAME o TXT)
   - MX: si quieres recibir respuestas en el subdominio
4. **Configurar DMARC** en el dominio raíz (si no existe):
   ```
   _dmarc.vanguardia.dev TXT "v=DMARC1; p=none; rua=mailto:dmarc@vanguardia.dev; pct=100"
   ```
   Empezar con `p=none` para monitorear, luego subir a `p=quarantine`.
5. **Actualizar sendingDomains** en la app: añadir `mail.vanguardia.dev` con su fromEmail y API key
6. **Warmup** el subdominio desde 5 emails/día incrementando gradualmente (ya soportado por el sistema)

### Estructura final

| Uso                      | Dominio              | From                          |
|--------------------------|----------------------|-------------------------------|
| Cold outreach            | mail.vanguardia.dev  | hola@mail.vanguardia.dev      |
| Transaccional / clientes | vanguardia.dev       | hola@vanguardia.dev           |

---

## Pendiente: Verificación de emails pre-envío

### Problema actual

Se envía a cualquier email encontrado por scraping o importación sin verificar si existe.
Emails inválidos generan hard bounces que dañan la reputación.

### Solución propuesta

- Integrar verificación de email (ZeroBounce, NeverBounce, o Reacher self-hosted)
- Verificar antes de generar el email, no antes de enviar
- Marcar emails no verificables como "risky" y excluir del envío automático
