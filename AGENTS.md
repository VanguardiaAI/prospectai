<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Design system (use these — do not invent new styles)

The app has ONE visual language: **flat, near-black surfaces on a pure-black canvas, an orange accent, and grayscale gradients** (the Nothing aesthetic). New pages and components MUST reuse the resources below instead of hand-rolling colors/spacing.

**Palette (CSS vars in `src/app/globals.css`, light + `[data-theme="dark"]`):**
- `--accent` (orange, hero) + `--accent-2` (lighter orange, for gradients); `--accent-rgb` for `rgba(var(--accent-rgb), …)`.
- Grayscale: `--text-display / --text-primary / --text-secondary / --text-disabled`, surfaces `--black` (canvas) / `--surface` (cards) / `--surface-raised`, borders `--border / --border-visible`.
- `--success` (green) is for STATUS only (delta-up, "configured"). Do NOT add new hues. The aliases `--butter/--mint/--sky/--coral/--violet` are remapped onto orange/gray — don't treat them as distinct colors.
- Data-viz = orange→gray monochrome scale (see `DONUT_PALETTE` / `CHART_COLORS` in `src/components/charts/Charts.tsx`).
- Tailwind exposes `text-accent`, `bg-surface-raised`, `border-border`, etc. via `@theme inline`. Prefer these tokens over raw hex.

**Components (`@/components/ui`):** `Card` (props: `title`, `dots` = in-card dot texture, `interactive`, `feature` = accent rail, `meta`), `Button`, `Badge`/`StatusBadge` (`dot` prop), `Segment` (white-pill tabs/filters — THE toggle), `DeltaBadge` (↗/↓ trend pill), `ValueChip` (rounded pill w/ color dot), `Input`/`Select`/`Textarea`, `Modal`, `EmptyState`, `Spinner`, `Toggle`, `ProgressBar`, `MetricRing`, `Tooltip`. Charts: `@/components/charts/Charts` (`AreaTrend`, `RadialGauge`, `Donut`, `BarWeek`, `BarList`). Brand logos: `@/components/icons/Brands` (`AnthropicIcon`, `GeminiIcon`, `WhatsAppIcon`, `GoogleIcon`, `ResendIcon`).

**Fine-detail CSS utilities:** `.nd-card`, `.nd-dots`/`.nd-dots-fade` (dot texture inside containers), `.nd-chip` + `.nd-chip-dot`, `.nd-delta`/`.nd-delta-up`/`.nd-delta-down`, `.nd-row` (pill list row), `.nd-bar`/`.nd-bar-idle` + `.nd-hatch` (diagonal hatch for idle bars), `.nd-segment`/`.nd-segment-item`, `.nd-label`/`.nd-heading`/`.nd-display` (mono type), `.nd-page-header`, `.nd-enter*` + `.nd-stagger-*` (entrance motion). These details (dot texture, chips, hatched bars, delta badges, pill rows) are the agreed "fine detail" — keep them; do not flatten cards into plain boxes. Avoid: glassmorphism, saturated multi-color palettes, corner-ticks/diagonal "separation bands", full-page dot/diagonal backgrounds.
