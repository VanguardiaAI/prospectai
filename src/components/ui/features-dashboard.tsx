import { Cpu, Lock, Sparkles, Zap } from "lucide-react";

export function FeaturesDashboard({ theme = "light" }: { theme?: string }) {
  const isDark = theme === "dark";
  const screenshot = isDark ? "/dashboard-screenshot-dark.png" : "/dashboard-screenshot.png";
  return (
    <section className="overflow-hidden py-16 md:py-32">
      <div className="mx-auto max-w-5xl space-y-8 px-6 md:space-y-12">
        <div className="relative z-10 max-w-2xl">
          <h2
            className="text-4xl font-semibold lg:text-5xl"
            style={{
              fontFamily: "var(--f-gothic)",
              color: "var(--c-dark)",
              letterSpacing: "-0.03em",
            }}
          >
            Construido para equipos que escalan
          </h2>
          <p
            className="mt-6 text-lg"
            style={{ color: "var(--c-text2)", lineHeight: 1.7 }}
          >
            Gestiona tu prospección desde un dashboard completo: métricas en
            tiempo real, funnel de conversión, campañas activas y envíos
            automatizados por email y WhatsApp.
          </p>
        </div>
        <div className="relative -mx-4 rounded-3xl p-3 md:-mx-12 lg:col-span-3">
          <div className="[perspective:800px]">
            <div className="[transform:skewY(-2deg)skewX(-2deg)rotateX(6deg)]">
              <div className="aspect-[88/36] relative overflow-visible">
                {/* Top fade */}
                <div
                  className="absolute left-0 right-0 top-0 z-20 pointer-events-none"
                  style={{
                    height: "25%",
                    background: "linear-gradient(to bottom, var(--c-cream) 0%, transparent 100%)",
                  }}
                />
                {/* Bottom fade */}
                <div
                  className="absolute left-0 right-0 bottom-0 z-20 pointer-events-none"
                  style={{
                    height: "30%",
                    background: "linear-gradient(to top, var(--c-cream) 0%, transparent 100%)",
                  }}
                />
                <img
                  src={screenshot}
                  className="absolute inset-0 z-10 rounded-xl shadow-2xl"
                  alt="ProspectAI dashboard con métricas de prospección"
                  width={2880}
                  height={1800}
                  style={{ objectFit: "cover" }}
                />
                <img
                  src={screenshot}
                  className="rounded-xl opacity-30"
                  alt=""
                  width={2880}
                  height={1800}
                  style={{ objectFit: "cover", filter: "blur(16px)" }}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="relative mx-auto grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-8 lg:grid-cols-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Zap
                className="size-4"
                style={{ color: "var(--c-orange)" }}
              />
              <h3
                className="text-sm font-medium"
                style={{
                  fontFamily: "var(--f-mono)",
                  color: "var(--c-dark)",
                  letterSpacing: "0.02em",
                }}
              >
                Autopilot
              </h3>
            </div>
            <p
              className="text-sm"
              style={{ color: "var(--c-text3)", lineHeight: 1.6 }}
            >
              Envío automático de emails y WhatsApp con límites diarios
              inteligentes.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Cpu
                className="size-4"
                style={{ color: "var(--c-orange)" }}
              />
              <h3
                className="text-sm font-medium"
                style={{
                  fontFamily: "var(--f-mono)",
                  color: "var(--c-dark)",
                  letterSpacing: "0.02em",
                }}
              >
                Análisis IA
              </h3>
            </div>
            <p
              className="text-sm"
              style={{ color: "var(--c-text3)", lineHeight: 1.6 }}
            >
              Cada web se audita automáticamente: velocidad, SEO, seguridad y
              oportunidades.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Lock
                className="size-4"
                style={{ color: "var(--c-orange)" }}
              />
              <h3
                className="text-sm font-medium"
                style={{
                  fontFamily: "var(--f-mono)",
                  color: "var(--c-dark)",
                  letterSpacing: "0.02em",
                }}
              >
                Privacidad
              </h3>
            </div>
            <p
              className="text-sm"
              style={{ color: "var(--c-text3)", lineHeight: 1.6 }}
            >
              Tus datos y los de tus leads, siempre protegidos con cifrado y
              acceso autenticado.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles
                className="size-4"
                style={{ color: "var(--c-orange)" }}
              />
              <h3
                className="text-sm font-medium"
                style={{
                  fontFamily: "var(--f-mono)",
                  color: "var(--c-dark)",
                  letterSpacing: "0.02em",
                }}
              >
                IA Generativa
              </h3>
            </div>
            <p
              className="text-sm"
              style={{ color: "var(--c-text3)", lineHeight: 1.6 }}
            >
              Mensajes personalizados basados en los problemas reales de cada
              negocio.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
