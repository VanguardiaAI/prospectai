import en from "./en.json";
import es from "./es.json";

export type Lang = "en" | "es";

const dictionaries: Record<Lang, Record<string, unknown>> = { en, es };

export function getLang(locale: string | null | undefined): Lang {
  if (!locale) return "en";
  const prefix = locale.split(/[-_]/)[0].toLowerCase();
  if (prefix === "es") return "es";
  return "en";
}

function resolve(obj: unknown, path: string): string | undefined {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

export function translate(
  lang: Lang,
  key: string,
  vars?: Record<string, string | number>,
): string {
  let value = resolve(dictionaries[lang], key) ?? resolve(dictionaries.en, key) ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      value = value.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
    }
  }
  return value;
}

export function translateArray(lang: Lang, key: string): string[] {
  const parts = key.split(".");
  let current: unknown = dictionaries[lang];
  for (const part of parts) {
    if (current == null || typeof current !== "object") break;
    current = (current as Record<string, unknown>)[part];
  }
  if (Array.isArray(current)) return current as string[];
  // Fallback to English
  current = dictionaries.en;
  for (const part of parts) {
    if (current == null || typeof current !== "object") break;
    current = (current as Record<string, unknown>)[part];
  }
  return Array.isArray(current) ? (current as string[]) : [];
}
