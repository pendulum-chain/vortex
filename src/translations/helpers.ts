// BCP 47 language codes
export enum Language {
  English = 'en',
  Portuguese_Brazil = 'pt-BR',
}

const DEFAULT_LANGUAGE = Language.English;

/**
 * Extracts language code from URL path
 * @returns The detected language code or default language
 */
const getLanguageFromPath = (): Language => {
  if (typeof window === 'undefined') {
    return DEFAULT_LANGUAGE;
  }

  const path = window.location.pathname;

  const languageValues = Object.values(Language);
  for (const lang of languageValues) {
    if (path.includes(`/${lang.toLocaleLowerCase()}`)) {
      return lang as Language;
    }
  }

  return DEFAULT_LANGUAGE;
};

export { getLanguageFromPath, DEFAULT_LANGUAGE };
