import { createFileRoute, redirect } from "@tanstack/react-router";
import i18n from "i18next";
import { Language } from "../translations/helpers";

// Define valid locales
const VALID_LOCALES = [Language.English, Language.Portuguese_Brazil];

export const Route = createFileRoute("/{-$locale}")({
  beforeLoad: async ({ params }) => {
    const { locale } = params;

    // Validate locale if provided
    if (locale && !VALID_LOCALES.includes(locale as Language)) {
      // Invalid locale - redirect to root without locale
      throw redirect({
        params: { locale: undefined },
        to: "/{-$locale}"
      });
    }

    // Use provided locale or default to English
    const currentLocale = (locale as Language) || Language.English;

    // Update i18n language
    await i18n.changeLanguage(currentLocale);

    return {
      isDefaultLocale: !locale || locale === Language.English,
      locale: currentLocale
    };
  }
});
