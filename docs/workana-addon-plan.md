# Workana add-on — plan de implementación

Add-on **opcional** (opt-in) para ProspectAI: postulación asistida a proyectos de
Workana. La IA entiende cada proyecto, decide si conviene postular según el perfil,
y genera un borrador (mensaje + presupuesto + plazo) que el usuario revisa, edita y
aprueba antes de enviar. Sin API oficial de Workana → automatización con Playwright
sobre una sesión iniciada por el usuario.

> **Aviso ToS:** automatizar Workana puede infringir sus Términos (prohíben
> robots/scraping y el spam de propuestas). Por eso el add-on es opt-in, mantiene
> **aprobación manual obligatoria** (sin autopilot), usa pacing humano y nunca
> incluye contacto fuera de plataforma. Uso personal, una sola cuenta, bajo riesgo
> propio del usuario.

## Principio rector: desacoplar IA del navegador

- **Playwright determinista** hace el navegador (login, leer ofertas, postear). No usa IA.
- **`generateStructured`** hace solo el razonamiento sobre **texto plano** extraído.
  Como el paso IA es "string → JSON", entra directo en el `ai_provider` actual
  (claude_cli / gemini / anthropic) sin tocar el navegador → no queda atado a un proveedor.
- Lo único "personal" (no portable) es la sesión logueada + browser local, lo que
  encaja con el modelo self-hosted de un usuario.

```
[cron workana_scan] → Playwright.scrapeFeed(search) → dedup
   → IA.evaluateProject() {shouldBid, fitScore, reason}        (filtro barato)
   → si shouldBid && quedan conexiones → IA.draftProposal()    (Opus 4.8)
        {coverLetter, bidAmount, deliveryDays, screeningAnswers}
   → guarda workana_proposals status='draft'
[UI /workana] → revisas/editas monto+plazo+carta → Approve / Reject
[cron workana_submit] → Playwright.submitProposal() con pacing + chequeo de conexiones → 'submitted'
[cron workana_replies] → Playwright.scrapeInbox() → classifyReply(body,'workana') → workana_replies (inbox accionable)
```

## Modelo de datos (4 tablas nuevas; reusa `agency_profile`)

- **`workana_searches`** — búsquedas guardadas (A/B de 2 perfiles): `label`,
  `agency_profile_id`, `strategy`, `filters` (JSON), `language`, `active`.
- **`workana_projects`** — proyectos scrapeados (equivale a "lead"):
  `workana_project_id` UNIQUE (dedup), `url`, `title`, `description`, `skills`,
  `budget_type/min/max`, `currency`, `client_info` (JSON), `bids_count`,
  `language`, `fit_score`, `should_bid`, `reason`, `status`
  (new/evaluated/skipped/drafted/submitted/replied/closed/error), `published_at`,
  `scanned_at`.
- **`workana_proposals`** — borradores/propuestas (espejo de `whatsapp_messages`):
  `project_id`, `agency_profile_id`, `cover_letter`, `bid_amount`, `currency`,
  `delivery_days`, `screening_answers` (JSON), `confidence`, `status`
  (draft/approved/rejected/submitted/failed), `submitted_at`,
  `workana_proposal_ref`, `error_message`.
- **`workana_replies`** — mensajes de clientes (espejo de `replies`): `project_id`,
  `proposal_id`, `from_name`, `body`, `status` (unread/handled), `intent`
  (reusa enum de `replies`), `handled_at`, `received_at`.

Nota SQLite: `replies.lead_id` es `NOT NULL` y SQLite no permite quitar el NOT NULL
con ALTER, por eso Workana usa una tabla `workana_replies` separada (en vez de
añadir `channel='workana'` a `replies`). Reusa los helpers puros
`classifyReply` / `reply-intent` (`INTENT_TONE`), que son agnósticos de canal.

## Módulos nuevos

- **`src/lib/workana/`**
  - `browser.ts` — `launchPersistentContext(userDataDir)` + playwright-extra/stealth,
    locale/timezone, `assertLoggedIn(page)`, `getRemainingConnections(page)`.
  - `auth.ts` — login headful interactivo (botón en UI), estado `NEEDS_REAUTH`.
  - `scraper.ts` — `scrapeFeed`, `scrapeProjectDetail`, `scrapeProfile`, `scrapeInbox`.
  - `submit.ts` — `submitProposal()` (monto + plazo + carta + respuestas screening,
    "Enviar propuesta", pacing humano).
  - `ai.ts` — `evaluateProject()` y `draftProposal()` (con `model: "claude-opus-4-8"`);
    reusa `classifyReply` para respuestas.
- **`src/lib/cron/`** — `workana-scan.ts`, `workana-submit.ts`, `workana-replies.ts`
  (+ 3 if-blocks en el dispatch de `src/app/api/cron/route.ts`).
- **API + UI** — `src/app/api/workana/*` y `src/app/(dashboard)/workana/page.tsx`
  (4ª entrada de sidebar, gated por `workana_enabled`).

## Guardrails

- **Precisión > volumen**: las Conexiones de Workana son una bolsa semanal escasa
  (~10–100/sem según plan, reset lunes). Setting `workana_weekly_connections` +
  conteo de enviadas desde el lunes; el scan **prioriza por `fit_score`** y nunca
  genera/postula más que el presupuesto. Idealmente lee el contador real de Workana.
- **Aprobación manual obligatoria** (sin autopilot).
- **Anti-duplicado**: guard que rechaza cartas casi idénticas (moderación de spam).
- **Doble re-auth**: estados separados para la sesión de Workana (`workana_auth_state`)
  y para el CLI de Claude (chequeo `is_error`), con banner + notificación + botón de
  re-login headful.
- **Pacing humano** + ventana horaria (reusa `isWithinSendWindow`).
- **Idioma**: draft en el idioma del proyecto (ES neutro / PT / EN).
- **Nunca** contacto fuera de plataforma en los mensajes.

## Decisiones tomadas

1. **Opus 4.8 solo en Workana** vía `model?` opcional en `generateStructured`
   (no toca el default global del resto). ✅ implementado en Fase 0.
2. **Browser headful local** (setup sin VPS; más seguro anti-detección). El scan
   diario requiere la máquina encendida, o se lanza manual desde `/workana`.
3. **`workana_replies` tabla aparte** y toda la superficie Workana bajo `/workana`
   (no se mezcla en `/review` por ahora).

## Revisión adversarial (post Fase 4)

Revisión multi-agente con verificación de cada hallazgo: 0 críticos, 0 high, 3 medium, 5 low.
Arreglados y verificados:
- Prompt-injection: `evaluateProject`/`draftProposal` ahora envuelven el texto scrapeado del
  proyecto en un fence guardado (helper `fenced`), igual que `draftReplyResponse`; se neutraliza
  el cierre `"""` y se sanea `projectTitle`.
- UI: la regeneración devuelve el borrador nuevo y la tarjeta lo aplica al estado local (+ key de
  remount con monto/plazo/confianza) → se elimina el riesgo de aprobar texto stale.
- `scrapeInbox` puebla `projectTitle` (heurístico) para que el match a proyecto pueda funcionar.
- Limpieza: comentario de `projectHasProposal`, índice duplicado en migraciones.

## Fases

- **Fase 0 — Fundaciones (sin navegador)** ✅
  - `model?` opcional en `generateStructured` (provider.ts + claude-cli/anthropic/gemini).
  - 4 tablas + migraciones (schema.ts + migrations.ts).
  - Settings opt-in: `workana_enabled`, `workana_weekly_connections`,
    `workana_profile_url`, `workana_auth_state`, `workana_last_scan_at`.
  - Entrada de sidebar gated + página `/workana` (activa/desactiva el add-on).
  - i18n (es/en).
- **Fase 1 — Sesión + scraping de lectura** 🔶 (núcleo hecho; falta afinar con login real)
  - `src/lib/workana/{config,types,browser,auth,scraper}.ts`: contexto persistente
    singleton (sobrevive HMR), stealth ligero inline, pacing, `assertLoggedIn`,
    `getRemainingConnections`; auth `connect` (headful, no-bloqueante) / `check` / `disconnect`;
    `scrapeFeed`/`scrapeProjectDetail`/`scrapeProfile`.
  - API `POST/GET /api/workana/auth` (connect/check/disconnect/status/test_scan) + UI en
    `/workana` (conectar, verificar, desconectar, prueba de lectura del feed).
  - `playwright` movido a `dependencies` + en `serverExternalPackages`; perfil del navegador
    gitignored. **Setup:** requiere `npx playwright install chromium` (rev. 1217 para PW 1.59.1).
  - Verificado en vivo: chromium headless → feed público → 9 proyectos extraídos,
    `navigator.webdriver` enmascarado. **Pendiente (necesita login real una vez):** afinar
    selectores autenticados (`assertLoggedIn` redirect, perfil, contador de conexiones) y
    probar el flujo headful de login end-to-end.
- **Fase 2 — Evaluación + borradores (IA)** ✅
  - `src/lib/workana/ai.ts`: `evaluateProject` (filtro barato, modelo default) +
    `draftProposal` (Opus 4.8 vía `model` override, env `WORKANA_DRAFT_MODEL`).
  - `src/db/workana.ts`: dedup por `workana_project_id`, upsert de proyectos,
    inserción de borradores, listados, conteo de enviadas (budget).
  - `src/lib/cron/workana-scan.ts`: `processWorkanaScans` (scrape → dedup →
    evaluar capado → redactar top-N por fitScore, enriquecido con el detalle),
    time-gate por `workana_scan_interval_hours`. Cron action `workana_scan`.
  - API `POST/GET /api/workana/scan` (escaneo manual + listados) + UI en `/workana`
    (botón "Escanear ahora", lista de borradores y de proyectos evaluados).
  - Settings: `workana_scan_interval_hours` (12), `workana_max_eval_per_scan` (15),
    `workana_max_drafts_per_scan` (5).
  - Verificado en vivo: scan real (22 leídos → 3 evaluados → 1 borrador Opus 4.8);
    filtro estricto correcto (solo el proyecto que encaja → shouldBid) y borrador
    personalizado de alta calidad, sin contacto fuera de plataforma.
- **Fase 3 — Review/aprobación (SIN envío real)** ✅
  - Prompt humanizado en `draftProposal`: reusa `ANTI_AI_RULES` + prohibición explícita
    de em-dash (—) y de lenguaje que delate automatización + self-check. Verificado:
    regeneración con 0 em-dashes y tono natural.
  - UI de revisión en `/workana`: tarjeta editable por borrador con la carta COMPLETA
    (textarea), monto y plazo editables, y botones Guardar / Aprobar / Rechazar /
    Regenerar / Reabrir. API `GET/PUT /api/workana/proposals` (editar, cambiar estado,
    regenerar). DB: `getProposalsDetailed`, `updateProposal`, `getProjectRowForProposal`.
  - `src/lib/workana/submit.ts`: `submitProposal` (Playwright form-fill) CONSTRUIDO pero
    INERTE — hard-gated tras `workana_allow_submit` (default "false") y SIN ningún caller.
    Selectores del bid form a afinar contra el form real antes de habilitar envío.
  - Pendiente para activar envío (futuro): afinar selectores del form, cron `workana_submit`,
    tope de conexiones al enviar, y poner `workana_allow_submit=true`.
- **Fase 4 — Respuestas (bandeja accionable)** ✅
  - `scrapeInbox` (best-effort, A AFINAR contra el inbox real) + cron `workana_replies`
    (`processWorkanaReplies`) + cron action `workana_replies`.
  - Reusa `classifyReply` (canal extendido a "workana") + `INTENT_TONE`. Para intents
    interested/question genera una respuesta sugerida con `draftReplyResponse` (Opus,
    con guard anti prompt-injection: el mensaje del cliente es dato, no instrucciones).
    NO se envía nada: la sugerencia es para copiar/usar a mano.
  - `workana_replies`: `project_id` nullable + `external_id` (dedup) + `suggested_reply`.
    API `GET/POST/PUT /api/workana/replies` + sección "Respuestas" en `/workana` con
    badge de intención, respuesta sugerida y marcar gestionada / reabrir.
  - Verificado en vivo: chequeo real del inbox (scanned 1, clasificado `auto_reply`,
    sin gastar IA), dedup en re-escaneo (added 0), triage PUT (handled + timestamp).
    Pendiente: afinar selectores de `scrapeInbox` (ahora capta avisos de Workana, no
    conversaciones reales) cuando haya hilos de clientes de verdad.
- **Fase 5 — Robustez/OSS** ✅
  - Re-auth: `probeLoggedIn` (reusa el contexto) + el cron `workana_replies` marca
    `needs_reauth` si la sesión caducó; banner de reconexión visible en `/workana`.
  - Panel de configuración en `/workana` (conexiones/semana, intervalo de escaneo,
    máx. evaluados, máx. borradores, headless, URL de perfil) — guardado vía `/api/settings`.
    (Se decidió ponerlo en `/workana`, no en la página de Settings principal, por cohesión.)
  - Disclaimer de ToS en la UI (estado activado y desactivado) + secciones opt-in en
    README.md y README.es.md (setup `npx playwright install chromium`, aviso de ToS).
  - `playwright` ya es dependencia de runtime; el add-on queda gated por `workana_enabled`.
  - El camino de envío sigue inerte (`workana_allow_submit` no se expone en la UI todavía).
  - Verificado: persistencia de config, re-auth probe sin falso positivo, sin rebuild de :3000.

## Fase 6 — Selectores reales + envío activado ✅

Inspeccionado el DOM real autenticado y afinado:
- **Inbox**: `/users/messages` → `/inbox`; hilos = `a[href*="/messages/index/<slug>/<user>"]`. `scrapeInbox`
  extrae slug + título + preview; enlaza a `workana_projects` por slug (`matchProjectBySlug`).
  Verificado: 10 hilos reales capturados, clasificados, el del MVP ligado a su proyecto.
- **Form de bid** (`/messages/bid/<slug>`, confirmado): `textarea[name="bid[content]"]`,
  `input[name="bid[amount]"]`, `input[name="bid[hours]"]`; CSRF en hidden inputs (van con el submit).
- **Envío**: `submitProposal` rellena el form real (pacing humano), envío acotado al form del bid.
  Verificado con **dry-run** (rellena sin enviar). Wiring: acción `submit`/`submit_dry` en
  `/api/workana/proposals` + botones "Enviar a Workana" / "Probar relleno" en propuestas aprobadas.
- **Activación**: toggle "Activar envío real" en Configuración (`workana_allow_submit`, default
  false en código por seguridad OSS). El dry-run no requiere el candado; el envío real sí.
  **NO hay envío automático**: postular solo ocurre al pulsar el botón en una propuesta aprobada.

> **Estado: Fases 0–6 completas, revisadas y verificadas en vivo.** El add-on está funcional de
> punta a punta. El primer envío real es una acción manual del usuario (botón "Enviar a Workana").
