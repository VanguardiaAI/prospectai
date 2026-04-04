"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import createGlobe, { COBEOptions } from "cobe";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export default function GlobeFeatureSection() {
  return (
    <section
      id="cta"
      className="relative w-full max-w-[1200px] mx-auto overflow-hidden px-6 py-16 md:px-16 md:py-24"
      style={{
        background: "var(--c-dark)",
        borderRadius: "16px",
      }}
    >
      {/* Dot grid overlay */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(242,241,237,0.04) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />

      <div className="relative flex flex-col-reverse items-center justify-between gap-10 md:flex-row">
        <div className="z-10 max-w-xl text-left">
          <span
            className="l-label block mb-6"
            style={{ color: "rgba(242,241,237,0.4)" }}
          >
            EMPIEZA HOY
          </span>

          <h2 className="l-display-section mb-4" style={{ color: "var(--c-cream)" }}>
            Tu primera campaña en menos de{" "}
            <span style={{ color: "var(--c-orange)" }}>5 minutos</span>{" "}
            <span style={{ color: "rgba(242,241,237,0.5)" }}>
              Sin tarjeta de crédito. Sin compromisos. Configura, lanza y
              empieza a recibir respuestas.
            </span>
          </h2>

          <Link
            href="/login"
            className="l-btn-primary mt-6 inline-flex"
            style={{
              background: "var(--c-orange)",
              color: "#fff",
              padding: "16px 36px",
              fontSize: "13px",
            }}
          >
            CREAR CUENTA GRATIS
            <ArrowRight size={14} />
          </Link>
        </div>

        <div className="relative h-[340px] md:h-[560px] w-full max-w-[560px] flex-shrink-0">
          <Globe className="absolute -inset-16 md:-inset-28" />
        </div>
      </div>
    </section>
  );
}

const GLOBE_CONFIG: Partial<COBEOptions> & { width: number; height: number } = {
  width: 800,
  height: 800,
  devicePixelRatio: 2,
  phi: 0,
  theta: 0.3,
  dark: 1,
  diffuse: 2,
  mapSamples: 16000,
  mapBrightness: 12,
  baseColor: [0.4, 0.36, 0.3],
  markerColor: [245 / 255, 78 / 255, 0],
  glowColor: [0.35, 0.32, 0.27],
  markers: [
    { location: [40.4168, -3.7038], size: 0.1 },
    { location: [41.3874, 2.1686], size: 0.07 },
    { location: [48.8566, 2.3522], size: 0.06 },
    { location: [51.5074, -0.1278], size: 0.06 },
    { location: [52.52, 13.405], size: 0.05 },
    { location: [40.7128, -74.006], size: 0.08 },
    { location: [19.4326, -99.1332], size: 0.08 },
    { location: [-23.5505, -46.6333], size: 0.07 },
    { location: [35.6762, 139.6503], size: 0.05 },
    { location: [1.3521, 103.8198], size: 0.04 },
  ],
};

export function Globe({
  className,
  config = GLOBE_CONFIG,
}: {
  className?: string;
  config?: Partial<COBEOptions>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phiRef = useRef(0);
  const widthRef = useRef(0);
  const pointerInteracting = useRef<number | null>(null);
  const pointerInteractionMovement = useRef(0);
  const rRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onResize = () => {
      widthRef.current = canvas.offsetWidth;
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerInteracting.current = e.clientX - pointerInteractionMovement.current;
      canvas.style.cursor = "grabbing";
    };

    const onPointerUp = () => {
      pointerInteracting.current = null;
      canvas.style.cursor = "grab";
    };

    const onMouseMove = (e: MouseEvent) => {
      if (pointerInteracting.current !== null) {
        const delta = e.clientX - pointerInteracting.current;
        pointerInteractionMovement.current = delta;
        rRef.current = delta / 200;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (pointerInteracting.current !== null && e.touches[0]) {
        const delta = e.touches[0].clientX - pointerInteracting.current;
        pointerInteractionMovement.current = delta;
        rRef.current = delta / 200;
      }
    };

    window.addEventListener("resize", onResize);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerout", onPointerUp);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("touchmove", onTouchMove);
    onResize();

    const fullConfig: COBEOptions = {
      phi: 0,
      theta: 0.3,
      mapSamples: 16000,
      mapBrightness: 12,
      baseColor: [0.4, 0.36, 0.3] as [number, number, number],
      markerColor: [245 / 255, 78 / 255, 0] as [number, number, number],
      glowColor: [0.35, 0.32, 0.27] as [number, number, number],
      diffuse: 2,
      devicePixelRatio: 2,
      dark: 1,
      ...config,
      width: widthRef.current * 2,
      height: widthRef.current * 2,
    };

    const globe = createGlobe(canvas, fullConfig);

    let animFrame: number;
    const animate = () => {
      if (!pointerInteracting.current) phiRef.current += 0.005;
      globe.update({
        phi: phiRef.current + rRef.current,
        width: widthRef.current * 2,
        height: widthRef.current * 2,
      });
      animFrame = requestAnimationFrame(animate);
    };
    animFrame = requestAnimationFrame(animate);

    setTimeout(() => {
      canvas.style.opacity = "1";
    });

    return () => {
      cancelAnimationFrame(animFrame);
      globe.destroy();
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerout", onPointerUp);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("touchmove", onTouchMove);
    };
  }, [config]);

  return (
    <div
      className={cn(
        "absolute inset-0 mx-auto aspect-[1/1] w-full max-w-[600px]",
        className
      )}
    >
      <canvas
        className="size-full opacity-0 transition-opacity duration-500 [contain:layout_paint_size]"
        ref={canvasRef}
        style={{ cursor: "grab" }}
      />
    </div>
  );
}
