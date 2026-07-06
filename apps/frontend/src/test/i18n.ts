import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enTranslations from "../translations/en.json";

// Mirrors the production init in src/main.tsx, restricted to English.
if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    fallbackLng: "en",
    lng: "en",
    resources: {
      en: {
        translation: enTranslations
      }
    }
  });
}

export default i18n;
