"use client";
import React from "react";
import {
  Search,
  Hotel,
  Stethoscope,
  Home,
  ShoppingCart,
  UtensilsCrossed,
  Gauge,
  ShieldOff,
  Smartphone,
  TrendingDown,
  BarChart3,
  PenTool,
  FileSearch,
  Megaphone,
  Mail,
  Share2,
} from "lucide-react";
import { motion, useMotionValue, useMotionTemplate } from "motion/react";
import { cn } from "@/lib/utils";

const TAG_ROWS = [
  [
    { id: "restaurantes", icon: UtensilsCrossed, label: "Restaurantes" },
    { id: "hoteles", icon: Hotel, label: "Hoteles" },
    { id: "clinicas", icon: Stethoscope, label: "Clínicas Dentales" },
    { id: "inmobiliarias", icon: Home, label: "Inmobiliarias" },
    { id: "ecommerce", icon: ShoppingCart, label: "E-commerce" },
  ],
  [
    { id: "web-lenta", icon: Gauge, label: "Web Lenta" },
    { id: "sin-ssl", icon: ShieldOff, label: "Sin SSL" },
    { id: "no-responsive", icon: Smartphone, label: "No Responsive" },
    { id: "seo-bajo", icon: TrendingDown, label: "SEO Bajo" },
    { id: "sin-analytics", icon: BarChart3, label: "Sin Analytics" },
  ],
  [
    { id: "rediseno", icon: PenTool, label: "Rediseño Web" },
    { id: "auditoria-seo", icon: FileSearch, label: "Auditoría SEO" },
    { id: "google-ads", icon: Megaphone, label: "Google Ads" },
    { id: "email-marketing", icon: Mail, label: "Email Marketing" },
    { id: "redes-sociales", icon: Share2, label: "Redes Sociales" },
  ],
];

const CONFIG = {
  title: "Búsqueda Inteligente",
  description:
    "Rastrea miles de negocios, analiza sus webs y encuentra automáticamente los que más necesitan tus servicios.",
  containerHeight: "h-[200px] sm:h-[240px]",
  lensSize: 92,
};

const MagnifiedBento = () => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const lensX = useMotionValue(0);
  const lensY = useMotionValue(0);

  const clipPath = useMotionTemplate`circle(30px at calc(50% + ${lensX}px - 10px) calc(50% + ${lensY}px - 10px))`;
  const inverseMask = useMotionTemplate`radial-gradient(circle 30px at calc(50% + ${lensX}px - 10px) calc(50% + ${lensY}px - 10px), transparent 100%, black 100%)`;

  return (
    <div className="flex items-center justify-center p-4 sm:p-6 w-full">
      <div
        className="group relative w-full max-w-[420px] overflow-hidden p-1.5 sm:p-2 transition-all duration-500 hover:-translate-y-1"
        style={{
          borderRadius: "2rem",
          border: "1px solid var(--c-border)",
          background: "var(--c-s100)",
          boxShadow: "0 25px 50px -12px rgba(245, 78, 0, 0.05)",
        }}
      >
        <div
          ref={containerRef}
          className={cn(
            "relative w-full overflow-hidden",
            CONFIG.containerHeight
          )}
          style={{
            borderRadius: "1.6rem",
            background: "rgba(230, 229, 224, 0.3)",
          }}
        >
          <div className="relative h-full w-full flex flex-col items-center justify-center">
            {/* base layer */}
            <motion.div
              style={{ WebkitMaskImage: inverseMask, maskImage: inverseMask }}
              className="flex flex-col gap-4 w-full h-full justify-center"
            >
              {TAG_ROWS.map((row, rowIndex) => (
                <motion.div
                  key={`row-${rowIndex}`}
                  className="flex gap-4 w-max"
                  animate={{
                    x:
                      rowIndex % 2 === 0
                        ? ["0%", "-33.333%"]
                        : ["-33.333%", "0%"],
                  }}
                  transition={{
                    duration: 25,
                    ease: "linear",
                    repeat: Infinity,
                  }}
                >
                  {[...row, ...row, ...row].map((item, idx) => (
                    <div
                      key={`${item.id}-${idx}`}
                      className="flex gap-2 whitespace-nowrap w-fit items-center rounded-full text-xs"
                      style={{
                        padding: "8px 12px",
                        background: "rgba(242, 241, 237, 0.5)",
                        backdropFilter: "blur(4px)",
                        color: "var(--c-text2)",
                        border: "1px solid rgba(38, 37, 30, 0.05)",
                      }}
                    >
                      <item.icon size={14} strokeWidth={1.5} />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </motion.div>
              ))}
            </motion.div>

            {/* reveal layer */}
            <motion.div
              className="absolute inset-0 flex flex-col gap-4 justify-center pointer-events-none select-none z-10"
              style={{
                clipPath,
              }}
            >
              {TAG_ROWS.map((row, rowIndex) => (
                <motion.div
                  key={`row-reveal-${rowIndex}`}
                  className="flex gap-4 w-max"
                  animate={{
                    x:
                      rowIndex % 2 === 0
                        ? ["0%", "-33.333%"]
                        : ["-33.333%", "0%"],
                  }}
                  transition={{
                    duration: 25,
                    ease: "linear",
                    repeat: Infinity,
                  }}
                >
                  {[...row, ...row, ...row].map((item, idx) => (
                    <div
                      key={`${item.id}-${idx}-reveal`}
                      className="flex gap-2 whitespace-nowrap w-fit items-center rounded-full text-xs scale-125 ml-6"
                      style={{
                        padding: "8px 12px",
                        background: "var(--c-cream)",
                        color: "var(--c-orange)",
                        border: "1px solid rgba(245, 78, 0, 0.2)",
                        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                        fontWeight: 500,
                      }}
                    >
                      <item.icon
                        size={14}
                        strokeWidth={1.5}
                        style={{ color: "var(--c-orange)" }}
                      />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </motion.div>
              ))}
            </motion.div>

            {/* lens */}
            <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 cursor-grab active:cursor-grabbing"
              style={{ x: lensX, y: lensY, filter: "drop-shadow(0 10px 15px rgba(0,0,0,0.1))" }}
              drag
              dragMomentum={false}
              dragConstraints={containerRef}
            >
              <div className="relative">
                <MagnifyingLens size={CONFIG.lensSize} />
                <div
                  className="absolute top-[6px] left-[6px] w-[60px] h-[60px] rounded-full pointer-events-none"
                  style={{ background: "rgba(255, 255, 255, 0.1)" }}
                />
              </div>
            </motion.div>
          </div>

          {/* Edge fades */}
          <div
            className="pointer-events-none absolute inset-y-0 left-0 w-1/4 z-20"
            style={{ background: "linear-gradient(to right, var(--c-cream), transparent)" }}
          />
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-1/4 z-20"
            style={{ background: "linear-gradient(to left, var(--c-cream), transparent)" }}
          />
        </div>

        <div className="p-4 sm:p-6 px-4 pb-6 sm:pb-8">
          <h3
            className="text-xl tracking-tight"
            style={{
              fontFamily: "var(--f-gothic)",
              fontWeight: 400,
              color: "var(--c-dark)",
            }}
          >
            {CONFIG.title}
          </h3>
          <p
            className="mt-2 text-sm leading-relaxed"
            style={{
              fontFamily: "var(--f-serif)",
              color: "var(--c-text2)",
            }}
          >
            {CONFIG.description}
          </p>
        </div>
      </div>
    </div>
  );
};

export default MagnifiedBento;

const MagnifyingLens = ({ size = 92 }: { size?: number }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M365.424 335.392L342.24 312.192L311.68 342.736L334.88 365.936L365.424 335.392Z"
        fill="#B0BDC6"
      />
      <path
        d="M358.08 342.736L334.88 319.552L319.04 335.392L342.24 358.584L358.08 342.736Z"
        fill="#DFE9EF"
      />
      <path
        d="M352.368 321.808L342.752 312.192L312.208 342.752L321.824 352.36L352.368 321.808Z"
        fill="#B0BDC6"
      />
      <path
        d="M332 332C260 404 142.4 404 69.6001 332C-2.3999 260 -2.3999 142.4 69.6001 69.6C141.6 -3.20003 259.2 -2.40002 332 69.6C404.8 142.4 404.8 260 332 332ZM315.2 87.2C252 24 150.4 24 88.0001 87.2C24.8001 150.4 24.8001 252 88.0001 314.4C151.2 377.6 252.8 377.6 315.2 314.4C377.6 252 377.6 150.4 315.2 87.2Z"
        fill="#DFE9EF"
      />
      <path
        d="M319.2 319.2C254.4 384 148.8 384 83.2001 319.2C18.4001 254.4 18.4001 148.8 83.2001 83.2C148 18.4 253.6 18.4 319.2 83.2C384 148.8 384 254.4 319.2 319.2ZM310.4 92C250.4 32 152 32 92.0001 92C32.0001 152 32.0001 250.4 92.0001 310.4C152 370.4 250.4 370.4 310.4 310.4C370.4 250.4 370.4 152 310.4 92Z"
        fill="#7A858C"
      />
      <path
        d="M484.104 428.784L373.8 318.472L318.36 373.912L428.672 484.216L484.104 428.784Z"
        fill="#333333"
      />
      <path
        d="M471.664 441.224L361.344 330.928L330.8 361.48L441.12 471.76L471.664 441.224Z"
        fill="#575B5E"
      />
      <path
        d="M495.2 423.2C504 432 432.8 504 423.2 495.2L417.6 489.6C408.8 480.8 480 408.8 489.6 417.6L495.2 423.2Z"
        fill="#B0BDC6"
      />
      <path
        d="M483.2 435.2C492 444 444.8 492 435.2 483.2L429.6 477.6C420.8 468.8 468 420.8 477.6 429.6L483.2 435.2Z"
        fill="#DFE9EF"
      />
    </svg>
  );
};
