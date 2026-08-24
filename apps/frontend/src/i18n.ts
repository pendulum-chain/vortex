import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enTranslations from "./translations/en.json";
import { getBrowserLanguage, Language } from "./translations/helpers";
import ptTranslations from "./translations/pt.json";

// Initialize i18n with browser language as default (falls back to English during SSR,
// where there is no navigator). The actual language is set by the locale route's beforeLoad.
//
// This is a module singleton whose language the `{-$locale}` route switches on every
// navigation. Prerendering therefore runs with `concurrency: 1` (see vite.config.ts) so that
// pages cannot race over the active language — do not make either side concurrent alone.
i18n.use(initReactI18next).init({
  fallbackLng: "en",
  lng: getBrowserLanguage(),
  resources: {
    [Language.English]: {
      translation: enTranslations
    },
    [Language.Portuguese_Brazil]: {
      translation: ptTranslations
    }
  }
});

export default i18n;
