"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/LocaleProvider";

type Phase = "search" | "analysis" | "generation" | "sending" | "engagement";

export function PhaseLoader({ phase, visible }: { phase: Phase; visible: boolean }) {
  const { tArray } = useT();
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [fade, setFade] = useState(true);
  const phrases = tArray(`shortcuts.loading.${phase}`);

  useEffect(() => {
    if (!visible) {
      setPhraseIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setPhraseIndex((i) => (i + 1) % phrases.length);
        setFade(true);
      }, 200);
    }, 2500);
    return () => clearInterval(interval);
  }, [visible, phrases.length]);

  if (!visible || phrases.length === 0) return null;

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-bg/80 backdrop-blur-sm rounded-xl gap-3">
      {/* Pulsing dots */}
      <div className="flex gap-[3px]">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 bg-accent animate-pulse"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
      {/* Rotating phrase */}
      <span
        className="text-[11px] font-mono uppercase tracking-wide text-accent transition-opacity duration-200"
        style={{ opacity: fade ? 1 : 0 }}
      >
        {phrases[phraseIndex]}
      </span>
    </div>
  );
}
