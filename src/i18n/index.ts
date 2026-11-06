import { de } from "./de";
import { en, type TranslationKey } from "./en";
import type { Language } from "../types";

export type { TranslationKey };

const dictionaries: Record<"en" | "de", Record<TranslationKey, string>> = { en, de };

let current: "en" | "de" = "en";

/** Obsidian stores its UI language in localStorage under "language" (empty = English). */
function obsidianLanguage(): string {
  try {
    return window.localStorage.getItem("language") ?? "en";
  } catch {
    return "en";
  }
}

export function setLanguage(lang: Language): void {
  const resolved = lang === "auto" ? obsidianLanguage() : lang;
  current = resolved.toLowerCase().startsWith("de") ? "de" : "en";
}

export function getLocale(): string {
  return current === "de" ? "de-DE" : "en-US";
}

export function t(key: TranslationKey, vars: Record<string, string | number> = {}): string {
  const template = dictionaries[current][key] ?? en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = vars[name];
    if (v === undefined) return `{${name}}`;
    return typeof v === "number" ? formatNumber(v) : v;
  });
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat(getLocale()).format(Math.round(n));
}

/** Like formatNumber, but keeps up to two decimals (e.g. 0.75 XP per word). */
export function formatDecimal(n: number): string {
  return new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 2 }).format(n);
}

export function formatDate(ts: number): string {
  return new Intl.DateTimeFormat(getLocale(), { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(ts));
}
