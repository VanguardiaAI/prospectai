"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { type Lang, getLang, translate, translateArray } from "./index";

interface LocaleContextValue {
  lang: Lang;
  t: (key: string, vars?: Record<string, string | number>) => string;
  tArray: (key: string) => string[];
  setLang: (lang: Lang) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  lang: "en",
  t: (key) => key,
  tArray: () => [],
  setLang: () => {},
});

export function useT() {
  return useContext(LocaleContext);
}

export function useLang(): Lang {
  return useContext(LocaleContext).lang;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    // A previously chosen language wins; otherwise auto-detect from the browser
    // (Spanish → "es", anything else → "en") and remember the resolved choice.
    try {
      const stored = localStorage.getItem("lang");
      if (stored === "en" || stored === "es") {
        setLangState(stored);
        return;
      }
      const detected = getLang(navigator.language || navigator.languages?.[0]);
      setLangState(detected);
      localStorage.setItem("lang", detected);
    } catch {
      setLangState(getLang(typeof navigator !== "undefined" ? navigator.language : null));
    }
  }, []);

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    try {
      localStorage.setItem("lang", newLang);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );

  const tArray = useCallback(
    (key: string) => translateArray(lang, key),
    [lang],
  );

  const value = useMemo(() => ({ lang, t, tArray, setLang }), [lang, t, tArray, setLang]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
