"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  createTranslator,
  type Language,
  resolveLanguage,
  translate,
  type Translator,
} from "@/lib/i18n";

export const LANGUAGE_STORAGE_KEY = "atlas-language";

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translator;
};

const defaultContext: LanguageContextValue = {
  language: "en",
  setLanguage: () => undefined,
  t: createTranslator("en"),
};

const LanguageContext = createContext<LanguageContextValue>(defaultContext);
const languageListeners = new Set<() => void>();
let cachedBrowserLanguage: Language | null = null;

export function readPreferredLanguage(
  storage: Pick<Storage, "getItem">,
  browserLanguage: string | null | undefined,
): Language {
  try {
    return resolveLanguage(storage.getItem(LANGUAGE_STORAGE_KEY), browserLanguage);
  } catch {
    return resolveLanguage(null, browserLanguage);
  }
}

export function persistLanguage(
  storage: Pick<Storage, "setItem">,
  language: Language,
) {
  try {
    storage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

function getBrowserLanguage(): Language {
  if (!cachedBrowserLanguage) {
    cachedBrowserLanguage = readPreferredLanguage(
      window.localStorage,
      window.navigator.language,
    );
  }
  return cachedBrowserLanguage;
}

function subscribeToLanguage(listener: () => void) {
  languageListeners.add(listener);

  function syncStoredLanguage(event: StorageEvent) {
    if (event.key !== null && event.key !== LANGUAGE_STORAGE_KEY) return;
    cachedBrowserLanguage = readPreferredLanguage(
      window.localStorage,
      window.navigator.language,
    );
    languageListeners.forEach((notify) => notify());
  }

  window.addEventListener("storage", syncStoredLanguage);
  return () => {
    languageListeners.delete(listener);
    window.removeEventListener("storage", syncStoredLanguage);
  };
}

function updateBrowserLanguage(language: Language) {
  cachedBrowserLanguage = language;
  persistLanguage(window.localStorage, language);
  languageListeners.forEach((notify) => notify());
}

export function LanguageProvider({
  children,
  initialLanguage,
}: {
  children?: ReactNode;
  initialLanguage?: Language;
}) {
  const language = useSyncExternalStore(
    subscribeToLanguage,
    getBrowserLanguage,
    () => initialLanguage ?? "en",
  );

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.title = translate(language, "meta.title");
  }, [language]);

  const setLanguage = useCallback((nextLanguage: Language) => {
    updateBrowserLanguage(nextLanguage);
  }, []);

  const value = useMemo(() => ({
    language,
    setLanguage,
    t: createTranslator(language),
  }), [language, setLanguage]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div
      aria-label={t("language.label")}
      className="atlas-language-switcher"
      role="group"
    >
      <button
        aria-label={t("language.chinese")}
        aria-pressed={language === "zh"}
        onClick={() => setLanguage("zh")}
        type="button"
      >
        中
      </button>
      <span aria-hidden="true">|</span>
      <button
        aria-label={t("language.english")}
        aria-pressed={language === "en"}
        onClick={() => setLanguage("en")}
        type="button"
      >
        EN
      </button>
    </div>
  );
}
