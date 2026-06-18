<div align="center">

🌐 [English](README.md) | **Español**

# ProspectAI

**Motor de prospecting B2B open source.**
Encuentra negocios, analiza sus sitios web con IA y envia emails y mensajes de WhatsApp personalizados — todo en autopiloto.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Demo en vivo](https://leads.vanguardia.dev) &bull; [Documentacion](#inicio-rapido) &bull; [Contribuir](CONTRIBUTING.md) &bull; [Roadmap](ROADMAP.md)

<br />

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/dashboard-screenshot-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="public/dashboard-screenshot.png">
  <img alt="ProspectAI Dashboard" src="public/dashboard-screenshot-dark.png" width="100%">
</picture>

</div>

<br />

## Por que ProspectAI?

La mayoria de herramientas de outreach B2B son plataformas SaaS caras que cobran por usuario, por lead o por email. ProspectAI es una **alternativa gratuita y self-hosted** que te da control total sobre tus datos y tu pipeline de prospecting. Sin cuotas mensuales, sin dependencia de proveedores — solo clona, configura y empieza a prospectar.

## Funcionalidades

| | Funcionalidad | Descripcion |
|---|---|---|
| :mag: | **Scraping de Google Maps** | Busca negocios por palabra clave + ubicacion, importa leads automaticamente |
| :brain: | **Analisis web con IA** | Analiza sitios web de leads con Google Gemini para puntuar calidad y encontrar oportunidades |
| :envelope: | **Emails personalizados** | Cold emails generados por IA adaptados al negocio de cada lead |
| :speech_balloon: | **Outreach por WhatsApp** | Envia mensajes personalizados de WhatsApp via whatsapp-web.js |
| :repeat: | **Secuencias automatizadas** | Campanas de seguimiento multi-paso por email y WhatsApp |
| :bar_chart: | **A/B Testing** | Prueba asuntos y variantes de email para optimizar tasas de apertura/respuesta |
| :fire: | **Warmup de email** | Incremento gradual del limite de envio para proteger la reputacion del dominio |
| :kanban: | **Pipeline visual** | Pipeline de leads estilo Kanban con drag-and-drop |
| :chart_with_upwards_trend: | **Dashboard de analitica** | Metricas en tiempo real: aperturas, clics, respuestas, tasas de conversion |
| :dart: | **Tracking de emails** | Seguimiento de aperturas y clics via webhooks de Resend |
| :globe_with_meridians: | **16 idiomas** | Generacion de emails localizados para prospecting internacional |
| :robot: | **Servidor MCP** | 25+ herramientas para gestionar campanas con lenguaje natural (Claude, etc.) |
| :file_folder: | **Importacion/Exportacion CSV/XLSX** | Gestion masiva de leads |
| :calendar: | **Calendario de campanas** | Vista de calendario de todas las campanas programadas |

## Stack tecnologico

| Capa | Tecnologia |
|------|-----------|
| Frontend | Next.js 16, React 19, TailwindCSS 4 |
| Backend | Next.js API Routes, Node.js |
| Base de datos | SQLite (better-sqlite3) + Drizzle ORM |
| IA | Google Gemini |
| Email | Resend |
| WhatsApp | whatsapp-web.js |
| Scraping | [google-maps-scraper](https://github.com/gosom/google-maps-scraper) (Docker) |

## Inicio rapido

### Requisitos previos

- **Node.js** >= 18
- **Docker** (opcional — para el scraper de Google Maps)
- **API key de Google Gemini** — [Obtenla gratis](https://aistudio.google.com/apikey)
- **Cuenta de Resend** — [Registrate](https://resend.com) (tier gratuito: 3,000 emails/mes)

### 1. Clonar e instalar

```bash
git clone https://github.com/VanguardiaAI/ProspectAI.git
cd ProspectAI
npm install
```

### 2. Configurar entorno

```bash
cp .env.example .env.local
```

Edita `.env.local` con tus valores:

```env
# Requerido
GEMINI_API_KEY=tu_api_key_de_gemini
RESEND_API_KEY=tu_api_key_de_resend

# Autenticacion — elige un usuario y contrasena
AUTH_USERNAME=admin
AUTH_PASSWORD_HASH=          # Generar abajo
AUTH_SECRET=                 # Generar abajo

# Opcional
RESEND_WEBHOOK_SECRET=       # Para tracking de emails
CRON_SECRET=                 # Para tareas automatizadas
```

Genera tus credenciales de autenticacion:

```bash
# Generar hash de contrasena (reemplaza 'tu-contrasena' con la contrasena deseada)
node -e "require('bcryptjs').hash('tu-contrasena', 12).then(console.log)"

# Generar secreto de autenticacion
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# Generar secreto de cron (opcional)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Inicializar base de datos y ejecutar

```bash
# Ejecutar migraciones de base de datos
npm run db:migrate

# Iniciar el servidor de desarrollo
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) e inicia sesion con tus credenciales configuradas.

### 4. Configura tu agencia (primer inicio de sesion)

Ve a **Settings** para completar la configuracion:

| Ajuste | Descripcion |
|--------|------------|
| Agency Name | Nombre de tu empresa (usado en los emails generados) |
| Agency URL | URL de tu sitio web |
| From Email | Email del remitente (debe estar verificado en Resend) |
| From Name | Nombre visible del remitente |
| Target Country | Pais predeterminado para prospecting |
| Daily Send Limit | Maximo de emails por dia |
| Legal Footer | Texto legal anadido al final de los emails |

## Scraper de Google Maps

Para habilitar la busqueda de negocios via Google Maps:

```bash
# Iniciar el contenedor del scraper
docker compose up -d

# Verificar que esta corriendo (debe responder en el puerto 8081)
curl http://localhost:8081
```

Luego en **Settings > Google Maps Scraper URL**, configura `http://localhost:8081`.

## Integracion de WhatsApp

WhatsApp usa [whatsapp-web.js](https://github.com/nicochulo2023/whatsapp-web.js) que ejecuta una sesion de navegador headless.

1. Ve a **Settings > WhatsApp** en el dashboard
2. Escanea el codigo QR con tu app de WhatsApp
3. La sesion persiste entre reinicios

> **Nota:** Solo se soporta una sesion de WhatsApp a la vez.

## Add-on de Workana (opcional)

Modulo opt-in para **postulacion asistida en proyectos de [Workana](https://www.workana.com)**:
lee el feed de proyectos con Playwright, usa IA para decidir si un proyecto encaja con tu perfil,
redacta una propuesta a medida y te deja revisarla/editarla/aprobarla. Un escaneo aparte clasifica
los mensajes entrantes de clientes en una bandeja accionable.

- **Desactivado por defecto.** Actívalo en **`/workana`** dentro del dashboard.
- **Navegador:** requiere Chromium para Playwright — ejecuta `npx playwright install chromium` una vez.
- **IA:** reutiliza tu `ai_provider` (Claude CLI / Anthropic / Gemini). La redacción usa Opus 4.8
  por defecto (configurable con `WORKANA_DRAFT_MODEL`).
- **Login único:** pulsa *Conectar* en `/workana`; se abre un navegador real para iniciar sesión
  en Workana una vez. La sesión se guarda localmente (gitignored).
- **Aún sin envío real.** Aprobar una propuesta solo la deja lista; el envío está bloqueado tras
  `workana_allow_submit` (por defecto `false`) y no tiene llamador.

> ⚠️ **Términos de servicio:** automatizar Workana puede infringir sus Términos (el scraping y
> las propuestas masivas están prohibidos). El add-on mantiene a una persona en el circuito
> (aprobación manual, sin autoenvío) y es para uso personal de una sola cuenta, **bajo tu propia
> responsabilidad**.

## Servidor MCP

ProspectAI incluye un servidor [Model Context Protocol](https://modelcontextprotocol.io) con 25+ herramientas para gestionar campanas via asistentes de IA como Claude.

```bash
# Ejecutar el servidor MCP directamente
npm run mcp

# O inspeccionar con el inspector de MCP
npm run mcp:inspect
```

Agrega a tu configuracion de Claude Code o Claude Desktop (`.mcp.json` o `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "prospect-ai": {
      "command": "npx",
      "args": ["tsx", "src/mcp/index.ts"],
      "cwd": "/ruta/a/ProspectAI"
    }
  }
}
```

## Tareas programadas (Cron)

Las tareas automatizadas (envio de emails, progresion de secuencias, warmup, scraping) se ejecutan via el endpoint `/api/cron`. Configura un cron externo para llamarlo:

```bash
# Cada 5 minutos
*/5 * * * * curl -s -X POST http://localhost:3000/api/cron \
  -H "Authorization: Bearer TU_CRON_SECRET"
```

## Despliegue en produccion

```bash
# Compilar
npm run build

# Opcion A: Iniciar con PM2 (recomendado)
npx pm2 start ecosystem.config.cjs

# Opcion B: Iniciar directamente
npm start
```

La app corre en el puerto 3000 por defecto. Usa un reverse proxy (nginx, Caddy) para HTTPS en produccion.

## Estructura del proyecto

```
src/
  app/
    (dashboard)/        # 14 paginas del dashboard (resumen, campanas, leads, pipeline, etc.)
    api/                # 27 rutas de API
    login/              # Autenticacion
  components/
    ui/                 # 18 componentes UI reutilizables
  db/                   # Schema SQLite, migraciones, 18 tablas
  lib/
    ai/                 # Generacion con Gemini (email, WhatsApp, analisis)
    cron/               # Handlers de tareas programadas
  mcp/                  # Servidor MCP — 25+ herramientas en 8 modulos
  types/                # Definiciones de TypeScript
data/                   # Base de datos SQLite (se crea en runtime)
docs/                   # Documentacion adicional
```

## Contribuir

Las contribuciones son bienvenidas! Consulta [CONTRIBUTING.md](CONTRIBUTING.md) para las guias.

## Licencia

[MIT](LICENSE) — libre para uso personal y comercial.

## Creditos

Creado por [VanguardIA](https://vanguardia.dev) — agencia de automatizacion con IA.

Visita [leads.vanguardia.dev](https://leads.vanguardia.dev) para saber mas sobre ProspectAI.
