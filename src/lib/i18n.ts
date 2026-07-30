import { en, type TranslationKey } from "@/locales/en";
import { zh } from "@/locales/zh";

export const LANGUAGES = ["en", "zh"] as const;
export type Language = (typeof LANGUAGES)[number];
export type TranslationValues = Record<string, string | number>;
export type Translator = (
  key: TranslationKey,
  values?: TranslationValues,
) => string;

const dictionaries: Record<Language, Record<TranslationKey, string>> = {
  en,
  zh,
};
const translationKeys = new Set<string>(Object.keys(en));

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" &&
    (LANGUAGES as readonly string[]).includes(value);
}

export function isTranslationKey(value: string): value is TranslationKey {
  return translationKeys.has(value);
}

export function resolveLanguage(
  storedLanguage: string | null,
  browserLanguage: string | null | undefined,
): Language {
  if (isLanguage(storedLanguage)) return storedLanguage;
  return browserLanguage?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function translate(
  language: Language,
  key: TranslationKey,
  values: TranslationValues = {},
): string {
  return dictionaries[language][key].replace(
    /\{(\w+)\}/g,
    (placeholder, name: string) =>
      Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}

export function createTranslator(language: Language): Translator {
  return (key, values) => translate(language, key, values);
}

export function translateKnownText(value: string, t: Translator): string {
  return isTranslationKey(value) ? t(value) : value;
}

export function localeForLanguage(language: Language): string {
  return language === "zh" ? "zh-CN" : "en-US";
}

export type { TranslationKey };
