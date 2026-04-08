# ProspectAI

**Open source B2B prospecting engine.** Find businesses, analyze their websites with AI, and send personalized cold emails and WhatsApp messages — all on autopilot.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)

---

## Features

- **Google Maps Scraping** — Search for businesses by keyword and location, import leads automatically
- **AI Website Analysis** — Analyze lead websites with Google Gemini to score quality and find opportunities
- **Personalized Email Generation** — AI-generated cold emails tailored to each lead's business
- **WhatsApp Outreach** — Send personalized WhatsApp messages via whatsapp-web.js
- **Automated Sequences** — Multi-step follow-up campaigns across email and WhatsApp
- **A/B Testing** — Test subject lines and email variants to optimize open/reply rates
- **Email Warmup** — Gradual sending limit increase to protect domain reputation
- **Visual Pipeline** — Kanban-style lead pipeline with drag-and-drop
- **Campaign Management** — Organize leads into campaigns with configurable settings
- **Analytics Dashboard** — Real-time metrics: opens, clicks, replies, conversion rates
- **Email Tracking** — Open and click tracking via Resend webhooks
- **Multi-language Support** — 16 regions supported with localized email generation
- **MCP Server** — 25+ tools for managing campaigns via natural language (Claude, etc.)
- **CSV/XLSX Import & Export** — Bulk lead management

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TailwindCSS 4 |
| Backend | Next.js API Routes, Node.js |
| Database | SQLite (better-sqlite3) + Drizzle ORM |
| AI | Google Gemini |
| Email | Resend |
| WhatsApp | whatsapp-web.js |
| Scraping | [google-maps-scraper](https://github.com/gosom/google-maps-scraper) (Docker) |

## Prerequisites

- **Node.js** >= 18
- **Docker** (optional — for Google Maps scraper)
- **Google Gemini API key** — [Get one here](https://aistudio.google.com/apikey)
- **Resend account** — [Sign up](https://resend.com) (free tier: 3,000 emails/month)

## Quick Start

```bash
# Clone the repository
git clone https://github.com/VanguardiaAI/ProspectAI.git
cd ProspectAI

# Install dependencies
npm install

# Copy environment file and fill in your values
cp .env.example .env.local

# Generate a password hash for login
node -e "require('bcryptjs').hash('your-password', 12).then(console.log)"
# Copy the output to AUTH_PASSWORD_HASH in .env.local

# Generate auth secret
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# Copy the output to AUTH_SECRET in .env.local

# Run database migrations
npm run db:migrate

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in with your configured credentials.

## Configuration

After first login, go to **Settings** to configure:

| Setting | Description |
|---------|------------|
| Agency Name | Your company/agency name (used in emails) |
| Agency URL | Your website URL |
| From Email | Sender email address (must be verified in Resend) |
| From Name | Sender display name |
| Target Country | Default country for prospecting |
| Locale / Currency | For localized email generation |
| Daily Send Limit | Maximum emails per day |
| Legal Footer | Compliance text appended to emails |

## Google Maps Scraper (Optional)

To enable business search via Google Maps:

```bash
# Start the scraper container
docker compose up -d

# The scraper runs on http://localhost:8081
# Configure the URL in Settings > Google Maps Scraper URL
```

## WhatsApp Integration

WhatsApp uses [whatsapp-web.js](https://github.com/nicochulo2023/whatsapp-web.js) which runs a headless browser session.

1. Go to **Settings > WhatsApp** in the dashboard
2. Scan the QR code with your WhatsApp mobile app
3. The session persists across restarts

> **Note:** Only one WhatsApp session is supported at a time. This is a limitation of the underlying library.

## MCP Server

ProspectAI includes a Model Context Protocol (MCP) server with 25+ tools for managing campaigns via AI assistants like Claude.

```bash
# Run the MCP server
npm run mcp

# Inspect with the MCP inspector
npm run mcp:inspect
```

Add to your Claude Code configuration:

```json
{
  "mcpServers": {
    "prospect-ai": {
      "command": "npx",
      "args": ["tsx", "src/mcp/index.ts"],
      "cwd": "/path/to/ProspectAI"
    }
  }
}
```

## Cron Jobs

Automated tasks (email sending, sequence progression, warmup, etc.) run via the `/api/cron` endpoint. Set up an external cron job to call it:

```bash
# Every 5 minutes
*/5 * * * * curl -s -X POST http://localhost:3000/api/cron \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## Production Deployment

```bash
# Build for production
npm run build

# Start with PM2
npx pm2 start ecosystem.config.cjs

# Or start directly
npm start
```

## Project Structure

```
src/
  app/
    (dashboard)/     # Protected dashboard pages
    api/             # API routes (campaigns, leads, emails, etc.)
    login/           # Authentication page
  components/        # React components
    ui/              # Reusable UI components
  db/                # Database schema, migrations, settings
  lib/               # Business logic
    ai/              # AI generation (email, WhatsApp, analysis)
    cron/            # Scheduled job handlers
  mcp/               # MCP server and tools
  types/             # TypeScript type definitions
data/                # SQLite database (created at runtime)
docs/                # Documentation
drizzle/             # Database migrations
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
