import { createFileRoute, redirect } from "@tanstack/react-router";
import i18n from "i18next";
import { findKybRegionByCode } from "../constants/kybRegions";
import { Language } from "../translations/helpers";

// Define valid locales
const VALID_LOCALES = [Language.English, Language.Portuguese_Brazil];

export const Route = createFileRoute("/{-$locale}")({
  beforeLoad: async ({ params, location }) => {
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

    // A region-pinned KYB deep link (e.g. `?kybLocked=BR`) targets businesses in that region — fall back
    // to the region's default locale. An explicit locale in the path still wins.
    const { kybLocked } = location.search as { kybLocked?: unknown };
    const kybRegion = typeof kybLocked === "string" ? findKybRegionByCode(kybLocked) : undefined;

    // Use matched locale or default to English
    const currentLocale = validLocale || kybRegion?.defaultLocale || Language.English;

    // Update i18n language
    await i18n.changeLanguage(currentLocale);

    return {
      isDefaultLocale: !locale || currentLocale === Language.English,
      locale: currentLocale
    };
  }
});
