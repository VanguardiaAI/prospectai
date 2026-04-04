"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import {
  Zap,
  Mail,
  MessageCircle,
  BarChart3,
  Target,
  Globe,
  ArrowRight,
  Search,
  Send,
  TrendingUp,
  Shield,
  Clock,
  Users,
  Sparkles,
  Eye,
  Reply,
} from "lucide-react";
import { GlobeCdn } from "@/components/ui/cobe-globe-cdn";
import MagnifiedBento from "@/components/ui/magnified-bento";

/* ─── Scroll-reveal hook ─── */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const children = el.querySelectorAll("[data-reveal]");
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add("l-fade-up");
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    children.forEach((c) => obs.observe(c));
    return () => obs.disconnect();
  }, []);
  return ref;
}

/* ─── SVG: Dot-matrix pipeline animation ─── */
function DotIcon({ dots, cx, cy, color }: { dots: [number, number][]; cx: number; cy: number; color: string }) {
  return (
    <g>
      {dots.map(([dx, dy], i) => (
        <circle key={i} cx={cx + dx * 3.5} cy={cy + dy * 3.5} r="1.3" fill={color} />
      ))}
    </g>
  );
}

/* Dot-matrix icon patterns (7x7 grid coordinates) */
const dotIcons = {
  /* Magnifying glass */
  search: [[1,0],[2,0],[3,0],[0,1],[4,1],[0,2],[4,2],[0,3],[4,3],[1,4],[2,4],[3,4],[4,4],[5,5],[6,6]] as [number,number][],
  /* Sparkle / analysis */
  sparkle: [[3,0],[1,1],[3,1],[5,1],[0,2],[2,2],[3,2],[4,2],[6,2],[1,3],[2,3],[3,3],[4,3],[5,3],[0,4],[2,4],[3,4],[4,4],[6,4],[1,5],[3,5],[5,5],[3,6]] as [number,number][],
  /* Envelope */
  mail: [[0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[0,2],[1,2],[5,2],[6,2],[0,3],[2,3],[4,3],[6,3],[0,4],[3,4],[6,4],[0,5],[1,5],[2,5],[3,5],[4,5],[5,5],[6,5]] as [number,number][],
  /* Lightning bolt */
  bolt: [[3,0],[4,0],[2,1],[3,1],[1,2],[2,2],[3,2],[4,2],[5,2],[3,3],[4,3],[2,4],[3,4],[1,5],[2,5],[2,6]] as [number,number][],
};

function PipelineSVG() {
  const steps = [
    { label: "BUSCAR", icon: dotIcons.search },
    { label: "ANALIZAR", icon: dotIcons.sparkle },
    { label: "GENERAR", icon: dotIcons.mail },
    { label: "ENVIAR", icon: dotIcons.bolt },
  ];

  const nodeW = 52;
  const gap = 120;
  const totalW = steps.length * nodeW + (steps.length - 1) * gap;
  const startX = 0;

  return (
    <svg viewBox={`0 0 ${totalW} 96`} fill="none" className="w-full" style={{ maxWidth: "620px" }}>
      {/* Connection lines between nodes */}
      {[0, 1, 2].map((i) => {
        const x1 = startX + i * (nodeW + gap) + nodeW;
        const x2 = startX + (i + 1) * (nodeW + gap);
        return (
          <g key={`conn-${i}`}>
            <line x1={x1} y1="26" x2={x2} y2="26" stroke="rgba(38,37,30,0.07)" strokeWidth="1" />
            <line
              x1={x1} y1="26" x2={x2} y2="26"
              stroke="rgba(38,37,30,0.18)"
              strokeWidth="1"
              strokeDasharray="3 5"
              style={{ animation: `l-dash-flow 2s linear infinite`, animationDelay: `${i * 0.4}s` }}
            />
            {/* Traveling dots — two per segment, staggered */}
            {[0, 1].map((d) => (
              <circle
                key={d}
                r="2"
                fill="#f54e00"
                style={{
                  offsetPath: `path('M ${x1} 26 L ${x2} 26')`,
                  animation: `l-data-flow 2.8s cubic-bezier(0.25,0.1,0.25,1) infinite`,
                  animationDelay: `${i * 0.5 + d * 1.4}s`,
                }}
              />
            ))}
          </g>
        );
      })}

      {/* Nodes */}
      {steps.map((step, i) => {
        const nx = startX + i * (nodeW + gap);
        const isAccent = i === 0 || i === 3;
        return (
          <g key={i}>
            {/* Node background */}
            <rect
              x={nx} y="0" width={nodeW} height={nodeW}
              rx="14"
              fill={isAccent ? "rgba(245,78,0,0.06)" : "var(--c-s100)"}
              stroke={isAccent ? "rgba(245,78,0,0.2)" : "rgba(38,37,30,0.1)"}
              strokeWidth="1"
            />
            {/* Dot-matrix icon — centered */}
            <DotIcon
              dots={step.icon}
              cx={nx + (nodeW - 6 * 3.5) / 2}
              cy={(nodeW - 6 * 3.5) / 2}
              color={isAccent ? "#f54e00" : "rgba(38,37,30,0.55)"}
            />
            {/* Step number */}
            <text
              x={nx + nodeW / 2} y="68"
              textAnchor="middle"
              fill="rgba(38,37,30,0.2)"
              fontSize="9"
              fontFamily="var(--f-mono)"
              letterSpacing="0.06em"
            >
              {String(i + 1).padStart(2, "0")}
            </text>
            {/* Label */}
            <text
              x={nx + nodeW / 2} y="82"
              textAnchor="middle"
              fill="rgba(38,37,30,0.5)"
              fontSize="9"
              fontFamily="var(--f-mono)"
              letterSpacing="0.06em"
            >
              {step.label}
            </text>
            {/* Segmented progress under label */}
            {Array.from({ length: 5 }).map((_, s) => (
              <rect
                key={s}
                x={nx + 8 + s * 8}
                y="88"
                width="5"
                height="2"
                rx="0.5"
                fill={s <= i ? (isAccent ? "#f54e00" : "rgba(38,37,30,0.3)") : "rgba(38,37,30,0.06)"}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/* ─── SVG: Segmented progress for metrics ─── */
function SegmentedBar({ filled, total }: { filled: number; total: number }) {
  return (
    <div className="l-segmented-bar" style={{ height: "6px" }}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          style={{
            background: i < filled ? "var(--c-orange)" : "var(--c-s500)",
            borderRadius: "1px",
            transition: `background 400ms ease ${i * 60}ms`,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Nav ─── */
function Nav() {
  return (
    <nav className="l-nav fixed top-0 left-0 right-0 z-50">
      <div className="max-w-[1200px] mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Zap size={18} strokeWidth={2.5} style={{ color: "var(--c-orange)" }} />
          <span style={{ fontFamily: "var(--f-gothic)", fontSize: "16px", fontWeight: 500, letterSpacing: "-0.02em", color: "var(--c-dark)" }}>
            ProspectAI
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {[
            { href: "#features", text: "FUNCIONALIDADES" },
            { href: "#process", text: "PROCESO" },
            { href: "#metrics", text: "RESULTADOS" },
          ].map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="l-label"
              style={{ transition: "color 150ms ease", cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--c-dark)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "")}
            >
              {l.text}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link href="/login" className="l-btn-secondary" style={{ padding: "8px 20px", fontSize: "11px" }}>
            ENTRAR
          </Link>
          <span className="hidden sm:inline-flex">
            <a href="#cta" className="l-btn-primary" style={{ padding: "8px 20px", fontSize: "11px" }}>
              EMPEZAR
              <ArrowRight size={12} />
            </a>
          </span>
        </div>
      </div>
    </nav>
  );
}

/* ─── Hero ─── */
function Hero() {
  const ref = useReveal();
  return (
    <section className="pt-28 pb-20 px-6 relative overflow-hidden" ref={ref}>
      <div className="absolute inset-0 l-dot-grid-dense" style={{ opacity: 0.4 }} />

      <div className="max-w-[1200px] mx-auto relative">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <div data-reveal style={{ opacity: 0 }}>
              <div className="l-pill mb-8">
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--c-orange)" }} />
                PROSPECTING ENGINE
              </div>
            </div>

            <h1 data-reveal className="l-display-hero mb-6" style={{ opacity: 0 }}>
              Encuentra clientes en cualquier rincón del mundo.
            </h1>

            <p data-reveal className="l-doto mb-8 l-delay-1" style={{ fontSize: "clamp(28px, 4vw, 48px)", color: "var(--c-orange)", opacity: 0 }}>
              La IA hace el resto.
            </p>

            <p data-reveal className="l-body max-w-[460px] mb-10 l-delay-2" style={{ opacity: 0 }}>
              ProspectAI rastrea negocios en todo el mundo, analiza sus webs,
              y les envía mensajes personalizados por email y WhatsApp.
              Prospección global en autopilot.
            </p>

            <div data-reveal className="flex flex-col sm:flex-row gap-4 mb-12 l-delay-3" style={{ opacity: 0 }}>
              <a href="#cta" className="l-btn-primary">
                EMPEZAR PROSPECCIÓN
                <ArrowRight size={14} />
              </a>
              <a href="#process" className="l-btn-secondary">
                VER PROCESO
              </a>
            </div>

            {/* Pipeline SVG */}
            <div data-reveal className="l-delay-4" style={{ opacity: 0 }}>
              <PipelineSVG />
            </div>
          </div>

          {/* Globe */}
          <div data-reveal className="hidden lg:block l-delay-2" style={{ opacity: 0 }}>
            <GlobeCdn className="w-full max-w-[600px] mx-auto scale-110 origin-center" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Search Showcase ─── */
function SearchShowcase() {
  const ref = useReveal();
  return (
    <section className="l-section-alt py-20 px-6" ref={ref}>
      <div className="max-w-[1200px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div data-reveal style={{ opacity: 0 }}>
            <span className="l-label block mb-4">MOTOR DE BÚSQUEDA</span>
            <h2 className="l-display-section max-w-[450px] mb-6">
              Encuentra los negocios que más necesitan tus servicios
            </h2>
            <p className="l-body max-w-[420px]">
              ProspectAI analiza miles de webs en tiempo real: detecta problemas de rendimiento,
              SEO, seguridad y diseño. Tú solo eliges la ciudad y el sector.
            </p>
          </div>
          <div data-reveal className="l-delay-2" style={{ opacity: 0 }}>
            <MagnifiedBento />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Features ─── */
function Features() {
  const ref = useReveal();
  const features = [
    { icon: Search, title: "Búsqueda inteligente", desc: "Encuentra negocios por ciudad, sector y tipo. Filtra por los que realmente necesitan tus servicios.", segments: 8 },
    { icon: Sparkles, title: "Análisis con IA", desc: "Cada web se analiza automáticamente: velocidad, SEO, seguridad, diseño responsivo y más.", segments: 6 },
    { icon: Mail, title: "Emails personalizados", desc: "La IA genera mensajes únicos basados en los problemas reales de cada negocio.", segments: 9 },
    { icon: MessageCircle, title: "WhatsApp integrado", desc: "Conecta directamente con el decisor. Seguimiento automático integrado.", segments: 7 },
    { icon: Target, title: "Pipeline visual", desc: "Kanban integrado para mover leads: nuevo, contactado, interesado, cliente.", segments: 5 },
    { icon: BarChart3, title: "Métricas en tiempo real", desc: "Tasas de apertura, clics, respuestas y conversión. Optimiza con datos reales.", segments: 10 },
  ];

  return (
    <section id="features" className="py-24 px-6" ref={ref}>
      <div className="max-w-[1200px] mx-auto">
        <div className="mb-16" data-reveal style={{ opacity: 0 }}>
          <span className="l-label block mb-4">FUNCIONALIDADES</span>
          <h2 className="l-display-section max-w-[500px]">
            Todo lo que necesitas para cerrar más clientes
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px" style={{ background: "var(--c-border)", borderRadius: "12px", overflow: "hidden" }}>
          {features.map((f, i) => (
            <div
              key={i}
              data-reveal
              className={`l-delay-${i + 1}`}
              style={{
                background: "var(--c-s100)",
                padding: "32px",
                opacity: 0,
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <f.icon size={20} strokeWidth={1.5} style={{ color: i % 2 === 0 ? "var(--c-orange)" : "var(--c-dark)" }} />
                <span className="l-label" style={{ fontSize: "10px", color: "var(--c-text3)" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="l-display-card mb-2">{f.title}</h3>
              <p className="l-body-sm mb-4">{f.desc}</p>
              <SegmentedBar filled={f.segments} total={10} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── How It Works ─── */
function Process() {
  const ref = useReveal();
  const steps = [
    { num: "01", title: "Define tu búsqueda", desc: "Ciudad, sector, tipo de negocio. ProspectAI busca en Google Maps, directorios y bases de datos.", icon: Globe },
    { num: "02", title: "La IA analiza cada web", desc: "Rendimiento, SEO, SSL, diseño responsivo, accesibilidad. Auditoría completa automática.", icon: Sparkles },
    { num: "03", title: "Mensajes personalizados", desc: "Un mensaje único para cada lead basado en los problemas reales detectados en su web.", icon: Send },
    { num: "04", title: "Envío en autopilot", desc: "Los emails y WhatsApps se envían automáticamente con límites diarios y seguimiento.", icon: Zap },
  ];

  return (
    <section id="process" className="l-section-alt py-24 px-6" ref={ref}>
      <div className="max-w-[1200px] mx-auto">
        <div className="mb-16" data-reveal style={{ opacity: 0 }}>
          <span className="l-label block mb-4">PROCESO</span>
          <h2 className="l-display-section max-w-[450px]">
            De la búsqueda al cliente en 4 pasos
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-0 relative">
          {/* Connecting line */}
          <div
            className="hidden md:block absolute top-[40px] left-[60px] right-[60px]"
            style={{ height: "1px", background: "var(--c-border-md)" }}
          />

          {steps.map((step, i) => (
            <div
              key={i}
              data-reveal
              className={`l-delay-${i + 1} relative`}
              style={{ opacity: 0, padding: "0 16px", textAlign: "center" }}
            >
              <div
                style={{
                  width: "80px",
                  height: "80px",
                  borderRadius: "50%",
                  background: "var(--c-cream)",
                  border: "1px solid var(--c-border-md)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 20px",
                  position: "relative",
                  zIndex: 1,
                }}
              >
                <span className="l-doto" style={{ fontSize: "28px", color: i === 0 || i === 3 ? "var(--c-orange)" : "var(--c-dark)" }}>
                  {step.num}
                </span>
              </div>

              <step.icon
                size={16}
                strokeWidth={1.5}
                style={{ color: "var(--c-orange)", margin: "0 auto 8px" }}
              />
              <h3 className="l-display-card mb-2" style={{ fontSize: "17px" }}>
                {step.title}
              </h3>
              <p className="l-body-sm" style={{ fontSize: "14px" }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Metrics ─── */
function Metrics() {
  const ref = useReveal();

  return (
    <section id="metrics" className="py-24 px-6 relative" ref={ref}>
      <div className="absolute inset-0 l-dot-grid" style={{ opacity: 0.3 }} />
      <div className="max-w-[1200px] mx-auto relative">
        <div className="mb-16" data-reveal style={{ opacity: 0 }}>
          <span className="l-label block mb-4">RESULTADOS</span>
          <h2 className="l-display-section max-w-[400px]">
            Números que hablan solos
          </h2>
        </div>

        {/* Large hero metric */}
        <div data-reveal className="mb-16" style={{ opacity: 0 }}>
          <div className="flex items-end gap-4 mb-2">
            <span className="l-doto" style={{ fontSize: "clamp(64px, 10vw, 96px)", lineHeight: 1, color: "var(--c-dark)" }}>
              10x
            </span>
            <span className="l-label mb-3" style={{ color: "var(--c-orange)" }}>
              MÁS RÁPIDO
            </span>
          </div>
          <p className="l-body" style={{ maxWidth: "380px" }}>
            Que la prospección manual. Automatiza lo repetitivo,
            dedica tu tiempo a cerrar.
          </p>
          <div className="mt-4" style={{ maxWidth: "400px" }}>
            <SegmentedBar filled={10} total={10} />
          </div>
        </div>

        {/* Secondary metrics grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px" style={{ background: "var(--c-border)", borderRadius: "12px", overflow: "hidden" }}>
          {[
            { value: "3,200+", label: "LEADS POR BÚSQUEDA", bar: 8, icon: Users },
            { value: "45%", label: "TASA DE APERTURA", bar: 5, icon: Eye },
            { value: "12%", label: "TASA DE RESPUESTA", bar: 4, icon: Reply },
          ].map((m, i) => (
            <div
              key={i}
              data-reveal
              className={`l-delay-${i + 1}`}
              style={{ background: "var(--c-s100)", padding: "32px", opacity: 0 }}
            >
              <div className="flex items-center justify-between mb-3">
                <m.icon size={16} strokeWidth={1.5} style={{ color: "var(--c-orange)" }} />
                <span className="l-label" style={{ color: "var(--c-text3)" }}>{m.label}</span>
              </div>
              <div className="l-doto mb-3" style={{ fontSize: "40px", color: "var(--c-dark)" }}>
                {m.value}
              </div>
              <SegmentedBar filled={m.bar} total={10} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Use Cases ─── */
function UseCases() {
  const ref = useReveal();
  const cases = [
    { title: "Agencias web", desc: "Encuentra negocios con webs obsoletas y ofrece rediseños con datos reales de auditoría.", metric: "85%", metricLabel: "WEBS NECESITAN MEJORA" },
    { title: "Agencias SEO", desc: "Detecta sitios sin optimización y contacta con propuestas basadas en sus métricas reales.", metric: "92%", metricLabel: "SIN SEO BÁSICO" },
    { title: "Freelancers", desc: "Automatiza tu prospección y dedica tu tiempo a lo que importa: entregar resultados.", metric: "4h", metricLabel: "AHORRADAS POR DÍA" },
  ];

  return (
    <section className="l-section-alt py-24 px-6" ref={ref}>
      <div className="max-w-[1200px] mx-auto">
        <div className="mb-16" data-reveal style={{ opacity: 0 }}>
          <span className="l-label block mb-4">CASOS DE USO</span>
          <h2 className="l-display-section max-w-[500px]">
            Diseñado para profesionales digitales
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cases.map((c, i) => (
            <div
              key={i}
              data-reveal
              className={`l-card l-delay-${i + 1}`}
              style={{ opacity: 0, background: "var(--c-cream)" }}
            >
              <div className="l-doto mb-1" style={{ fontSize: "36px", color: "var(--c-orange)" }}>
                {c.metric}
              </div>
              <span className="l-label block mb-6" style={{ color: "var(--c-text3)" }}>{c.metricLabel}</span>
              <h3 className="l-display-card mb-2">{c.title}</h3>
              <p className="l-body-sm">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── CTA ─── */
function CTA() {
  const ref = useReveal();
  return (
    <section id="cta" className="py-24 px-6" ref={ref}>
      <div
        data-reveal
        className="max-w-[900px] mx-auto relative overflow-hidden"
        style={{
          background: "var(--c-dark)",
          borderRadius: "16px",
          padding: "clamp(40px, 6vw, 80px)",
          opacity: 0,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(242,241,237,0.04) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />

        <div className="relative text-center">
          <span className="l-label block mb-6" style={{ color: "rgba(242,241,237,0.4)" }}>
            EMPIEZA HOY
          </span>
          <h2 className="l-display-section mb-4" style={{ color: "var(--c-cream)" }}>
            Tu primera campaña en menos de 5 minutos
          </h2>
          <p className="l-body mb-10" style={{ color: "rgba(242,241,237,0.5)", maxWidth: "420px", margin: "0 auto 40px" }}>
            Sin tarjeta de crédito. Sin compromisos. Configura,
            lanza y empieza a recibir respuestas.
          </p>
          <Link
            href="/login"
            className="l-btn-primary"
            style={{ background: "var(--c-orange)", color: "#fff", padding: "16px 36px", fontSize: "13px" }}
          >
            CREAR CUENTA GRATIS
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ─── Footer ─── */
function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--c-border)", padding: "24px" }}>
      <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Zap size={14} strokeWidth={2.5} style={{ color: "var(--c-orange)" }} />
          <span style={{ fontFamily: "var(--f-gothic)", fontSize: "14px", fontWeight: 500, color: "var(--c-dark)" }}>
            ProspectAI
          </span>
        </div>
        <span className="l-label" style={{ fontSize: "10px" }}>
          &copy; {new Date().getFullYear()} VANGUARDIA — PROSPECCIÓN INTELIGENTE PARA AGENCIAS DIGITALES
        </span>
      </div>
    </footer>
  );
}

/* ─── Page ─── */
export default function LandingPage() {
  return (
    <div className="landing">
      <Nav />
      <Hero />
      <SearchShowcase />
      <Features />
      <Process />
      <Metrics />
      <UseCases />
      <CTA />
      <Footer />
    </div>
  );
}
