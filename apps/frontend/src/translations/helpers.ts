// BCP 47 language codes
export enum Language {
  English = "en",
  Portuguese_Brazil = "pt-BR"
}

const DEFAULT_LANGUAGE = Language.English;

const LANGUAGE_FAMILIES: Record<string, Language> = {
  en: Language.English,
  pt: Language.Portuguese_Brazil
};

/**
 * Gets the global window object, works in both browser and test environments
 * @returns Window object or undefined if not available
 */
const getGlobalWindow = (): Window | undefined => {
  return typeof window !== "undefined" ? window : (global as unknown as { window?: Window })?.window;
};

const getBrowserLanguage = (): Language => {
  const globalWindow = getGlobalWindow();

  if (!globalWindow || !globalWindow.navigator) {
    return DEFAULT_LANGUAGE;
  }

  const navigator = globalWindow.navigator;
  const browserLanguages = navigator.languages || [navigator.language];

  for (const lang of browserLanguages) {
    if (!lang) continue;

    const languageCode = lang.toLowerCase().split("-")[0];
    const mappedLanguage = LANGUAGE_FAMILIES[languageCode];

    if (mappedLanguage) {
      return mappedLanguage;
    }
  }

  return DEFAULT_LANGUAGE;
};

const getLanguageFromPath = (): Language => {
  const globalWindow = getGlobalWindow();

  if (!globalWindow || !globalWindow.location) {
    return DEFAULT_LANGUAGE;
  }

  const path = globalWindow.location.pathname.toLowerCase();

  const languageValues = Object.values(Language);
  for (const lang of languageValues) {
    if (path.includes(`/${lang.toLowerCase()}`)) {
      return lang as Language;
    }
  }

  return getBrowserLanguage();
};

export { getLanguageFromPath, getBrowserLanguage, DEFAULT_LANGUAGE, LANGUAGE_FAMILIES };
