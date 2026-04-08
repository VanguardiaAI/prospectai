# ProspectAI - Roadmap de Mejoras

Mejoras pendientes organizadas por prioridad. Cada sección incluye instrucciones concretas de implementación.

---

## 1. A/B Testing de Prompts y Tonos

**Objetivo**: Medir qué tono y estilo de mensaje genera más respuestas para optimizar continuamente.

**Implementación**:

1. Crear tabla `ab_variants`:
```sql
CREATE TABLE ab_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER REFERENCES campaigns(id),
  name TEXT NOT NULL, -- "Tono directo vs amigable"
  variant_a TEXT NOT NULL, -- JSON con config del prompt (tone, instructions)
  variant_b TEXT NOT NULL,
  status TEXT DEFAULT 'active', -- active, completed
  created_at TEXT DEFAULT (datetime('now'))
);
```

2. Crear tabla `ab_results`:
```sql
CREATE TABLE ab_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  variant_id INTEGER REFERENCES ab_variants(id),
  email_id INTEGER REFERENCES emails(id),
  variant_group TEXT NOT NULL, -- 'A' o 'B'
  opened INTEGER DEFAULT 0,
  clicked INTEGER DEFAULT 0,
  replied INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
```

3. En `processEmailGenerationJobs` del cron:
   - Antes de generar, verificar si la campaña tiene un A/B test activo
   - Asignar aleatoriamente al grupo A o B (50/50)
   - Usar la config del prompt correspondiente
   - Registrar en `ab_results`

4. Crear página `/ab-testing` con:
   - Crear nuevo test (seleccionar campaña, definir variantes)
   - Dashboard de resultados: tasa de apertura, clicks, replies por variante
   - Botón "Declarar ganador" que aplica la variante ganadora como default

5. Agregar métricas en el dashboard principal: "Mejor tono este mes", "Tasa de respuesta por tono"

---

## 2. Tracking de Opens, Clicks y Replies

**Objetivo**: Saber si los emails se abren, si hacen clic, y si responden.

### Open Tracking (pixel)

1. Crear endpoint `GET /api/track/open?id={emailId}`:
   - Devuelve un pixel 1x1 transparente GIF
   - Actualiza `emails.opened_at` con timestamp
   - Registra en `activityLog`

2. En `generateEmail` o al enviar, inyectar el pixel antes de `</body>`:
```html
<img src="https://tudominio.com/api/track/open?id=EMAIL_ID" width="1" height="1" style="display:none" />
```

3. Añadir columnas a `emails`: `opened_at TEXT`, `clicked_at TEXT`

### Click Tracking

1. Crear endpoint `GET /api/track/click?id={emailId}&url={encodedUrl}`:
   - Registra el click
   - Redirige al URL original con `302 redirect`

2. En el HTML del email, reemplazar URLs con URLs de tracking:
```
https://yourdomain.com/api/track/click?id=123&url=https%3A%2F%2Fexample.com
```

### Reply Tracking

**Opción A — Webhook de Resend**:
- Configurar webhook en Resend para eventos `email.opened`, `email.clicked`, `email.bounced`, `email.complained`
- Crear endpoint `POST /api/webhooks/resend` que procese estos eventos

**Opción B — Email dedicado + IMAP polling**:
- Usar dirección de reply-to tipo `reply+{leadId}@tudominio.com`
- Configurar IMAP polling cada 5 minutos para detectar respuestas
- Marcar lead como "replied" y parar secuencia automáticamente

### Dashboard de métricas

Agregar al dashboard:
- Tasa de apertura (opens / sent)
- Tasa de clicks (clicks / opens)
- Tasa de respuesta (replies / sent)
- Gráfico de funnel: Sent → Opened → Clicked → Replied

---

## 3. Migración a PostgreSQL

**Cuándo**: Cuando necesites múltiples usuarios simultáneos o desplegar en servidor.

**Pasos**:

1. Instalar dependencias:
```bash
npm install pg drizzle-orm/pg-core
```

2. Actualizar `drizzle.config.ts`:
```ts
export default {
  schema: "./src/db/schema.ts",
  driver: "pg",
  dbCredentials: {
    connectionString: process.env.DATABASE_URL,
  },
};
```

3. Cambiar imports en `schema.ts`:
   - `sqliteTable` → `pgTable`
   - `integer` → `integer` o `serial`
   - `text` → `text` o `varchar`
   - `real` → `doublePrecision`

4. Actualizar `db/index.ts`:
   - Cambiar de `better-sqlite3` a `pg`
   - Usar `drizzle(pool)` en vez de `drizzle(sqlite)`
   - Quitar el `sqlite.exec()` y usar Drizzle migrations

5. Generar y ejecutar migrations:
```bash
npx drizzle-kit generate
npx drizzle-kit push
```

6. Actualizar `docker-compose.yml` para incluir PostgreSQL:
```yaml
postgres:
  image: postgres:16
  environment:
    POSTGRES_DB: prospectai
    POSTGRES_USER: prospectai
    POSTGRES_PASSWORD: changeme
  volumes:
    - pgdata:/var/lib/postgresql/data
  ports:
    - "5432:5432"
```

---

## 4. Múltiples Dominios de Envío

**Objetivo**: Rotar dominios para distribuir riesgo y mejorar deliverability.

1. Crear tabla `sending_domains`:
```sql
CREATE TABLE sending_domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL, -- "prospeccion1.com"
  from_email TEXT NOT NULL, -- "hola@prospeccion1.com"
  from_name TEXT NOT NULL,
  daily_limit INTEGER DEFAULT 30,
  warmup_day INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active', -- active, warming, paused
  resend_api_key TEXT, -- API key específica si es diferente
  created_at TEXT DEFAULT (datetime('now'))
);
```

2. En `processEmailSending`:
   - Obtener todos los dominios activos
   - Para cada email, seleccionar el dominio con menos envíos hoy (round-robin)
   - Respetar el límite diario de cada dominio
   - Usar la API key específica del dominio si existe

3. UI en Settings:
   - Sección "Dominios de envío"
   - Añadir/editar/pausar dominios
   - Ver estado de warmup de cada dominio
   - Indicador de salud (bounces, complaints)

---

## 5. Vista "Cola del Día"

**Objetivo**: Una vista operativa de "qué tengo que hacer hoy".

1. Crear página `/today` o sección en el dashboard:
   - **Pendientes de revisión**: Emails/WA en draft que necesitan aprobación
   - **Listos para enviar**: Emails aprobados pendientes de envío
   - **Secuencias activas**: Enrollments que se ejecutan hoy
   - **Límite del día**: X/Y emails enviados, Z restantes
   - **Acciones rápidas**: Aprobar todo, Enviar todo, Pausar todo

2. Keyboard shortcuts:
   - `a` = aprobar email actual
   - `r` = rechazar
   - `n` = siguiente
   - `p` = anterior
   - `e` = editar
   - `Enter` = enviar

---

## 6. Detección de Respuestas para Parar Secuencias

**Objetivo**: Si un lead responde (email o WA), parar automáticamente la secuencia.

### Email replies

1. Configurar webhook de Resend o implementar IMAP polling (ver sección 2)
2. Al detectar respuesta:
```ts
// Parar secuencia
db.update(sequenceEnrollments)
  .set({ status: "replied", completedAt: new Date().toISOString() })
  .where(eq(sequenceEnrollments.leadId, leadId))
  .run();

// Actualizar lead
db.update(leads)
  .set({ status: "contacted" })
  .where(eq(leads.id, leadId))
  .run();
```

### WhatsApp replies

- `whatsapp-web.js` soporta `client.on("message", handler)` para mensajes entrantes
- Filtrar por números que coincidan con leads
- Parar secuencia y marcar como "replied"
- Guardar el mensaje de respuesta en una nueva tabla `replies`

---

## 7. Scoring de Respuesta Histórico

**Objetivo**: Aprender de qué negocios responden más para mejorar el targeting.

1. Después de acumular datos (50+ respuestas), analizar patrones:
   - ¿Qué categorías responden más?
   - ¿Qué ciudades?
   - ¿Qué rangos de rating/reviews?
   - ¿Qué quality score?

2. Usar esos insights para ajustar el opportunity scorer:
   - Crear función `getHistoricalBoost(lead)` que consulte estadísticas
   - Sumar bonus si el lead es similar a leads que han respondido antes

---

## 8. Integración con CRM

**Objetivo**: Cuando un lead responde, crear un deal en el CRM.

Opciones:
- **Notion**: API para crear items en una base de datos
- **HubSpot**: Free CRM con API REST
- **Pipedrive**: Enfocado en ventas
- **Google Sheets**: Simple pero efectivo

Implementación genérica:
1. Crear setting `crm_webhook_url` y `crm_webhook_on` (string: "replied", "contacted", etc.)
2. Al cambiar el status de un lead al configurado, hacer POST al webhook con los datos del lead
3. Esto funciona con Zapier/Make/n8n para conectar con cualquier CRM

---

## 9. Templates de Email Reutilizables

**Objetivo**: Guardar emails que funcionaron bien como templates para futuras campañas.

1. Crear tabla `email_templates`:
```sql
CREATE TABLE email_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT, -- "restaurantes", "clinicas", "general"
  subject_template TEXT NOT NULL,
  body_html_template TEXT NOT NULL,
  body_text_template TEXT NOT NULL,
  variables TEXT, -- JSON: ["business_name", "city", "issue"]
  usage_count INTEGER DEFAULT 0,
  avg_open_rate REAL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

2. UI para "Guardar como template" en la página de review
3. Al generar emails, opción de partir de un template en vez de generar desde cero
4. Los templates pueden tener variables tipo `{{business_name}}` que se reemplazan

---

## 10. Análisis de Competencia del Lead

**Objetivo**: Buscar competidores del lead en la misma ciudad/categoría y usar eso como argumento de venta.

1. Al analizar un lead, buscar en Google Maps otros negocios similares en la misma ciudad
2. Comparar sus webs con la del lead
3. Incluir en el prompt de generación de email: "3 de tus 5 competidores directos tienen mejor web que tú"
4. Esto genera urgencia sin ser agresivo

---

## 11. Dashboard de Rendimiento por Servicio

**Objetivo**: Ver qué servicios generan más interés.

- Gráfico: emails enviados por servicio recomendado
- Tasa de respuesta por servicio
- Permite ajustar la estrategia de qué servicios priorizar

---

## 12. Modo Multi-Idioma

**Objetivo**: Soportar inglés y otros idiomas para mercados no hispanohablantes.

1. Agregar setting `locale` con opciones: `es-ES`, `es-MX`, `en-US`, `en-UK`, `pt-BR`
2. Los prompts de Gemini ya usan `getLocaleLabel()` — agregar más idiomas al mapa
3. Traducir la UI (usar i18n o simple object map)
4. Considerar: los emails en inglés tienen mejor deliverability en UK/US

---

## Orden de Implementación Sugerido

| Prioridad | Mejora | Dependencias |
|-----------|--------|-------------|
| Alta | Open/Click tracking (#2) | Dominio público configurado |
| Alta | Reply detection (#6) | Webhook de Resend o IMAP |
| Alta | Vista "Cola del día" (#5) | Ninguna |
| Media | A/B Testing (#1) | Tracking de opens/clicks |
| Media | Múltiples dominios (#4) | Ninguna |
| Media | Templates reutilizables (#9) | Tracking de opens para avg_open_rate |
| Baja | PostgreSQL (#3) | Solo si necesitas escalar |
| Baja | CRM integration (#8) | Reply detection |
| Baja | Scoring histórico (#7) | Tracking + 50+ datos |
| Baja | Análisis de competencia (#10) | Google Maps scraper activo |
| Baja | Dashboard de servicios (#11) | Multi-servicio ya implementado |
| Baja | Multi-idioma (#12) | Ninguna |
