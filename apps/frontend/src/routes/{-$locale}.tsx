import { createFileRoute, redirect } from "@tanstack/react-router";
import i18n from "i18next";
import { Language } from "../translations/helpers";

// Define valid locales
const VALID_LOCALES = [Language.English, Language.Portuguese_Brazil];

export const Route = createFileRoute("/{-$locale}")({
  beforeLoad: async ({ params }) => {
    const { locale } = params;

    // Normalize locale to handle case-insensitivity (pt-br vs pt-BR)
    const normalizedLocale = locale?.toLowerCase();
    const validLocale = VALID_LOCALES.find(lang => lang.toLowerCase() === normalizedLocale);

    // If locale provided but invalid, redirect to English version
    if (locale && !validLocale) {
      throw redirect({
        params: { locale: Language.English },
        to: "/{-$locale}"
      });
    }

    // Use matched locale or default to English
    const currentLocale = validLocale || Language.English;

    // Update i18n language
    await i18n.changeLanguage(currentLocale);

    return {
      isDefaultLocale: !locale || currentLocale === Language.English,
      locale: currentLocale
    };
  }
});
