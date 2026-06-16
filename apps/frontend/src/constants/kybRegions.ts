import { FiatToken } from "@vortexfi/shared";
import { Language } from "../translations/helpers";

export interface KybRegion {
  /** Region code used by the `?kyb=` / `?kybLocked=` deep-link param, e.g. "BR". */
  code: string;
  /** i18n key for the region's display name. */
  labelKey: string;
  /** Fiat token that determines which KYC/B provider the user is routed to. */
  fiatToken: FiatToken;
  /** Locale applied when a deep link pins this region (`?kybLocked=`) and the URL has no explicit locale. */
  defaultLocale?: Language;
}

/**
 * Regions offered in the KYB deep-link selector. Each maps to the fiat token
 * that determines the KYC/B provider (Brazil → Avenia, Mexico/Colombia/USA → Alfredpay).
 * Europe/Mykobo is intentionally excluded: it is individual KYC only and requires a connected
 * wallet, so it cannot complete a quote-less KYB deep link. Add or remove entries here.
 */
export const KYB_REGIONS: KybRegion[] = [
  {
    code: "BR",
    defaultLocale: Language.Portuguese_Brazil,
    fiatToken: FiatToken.BRL,
    labelKey: "components.regionSelectStep.regions.BR"
  },
  { code: "MX", fiatToken: FiatToken.MXN, labelKey: "components.regionSelectStep.regions.MX" },
  { code: "CO", fiatToken: FiatToken.COP, labelKey: "components.regionSelectStep.regions.CO" },
  { code: "US", fiatToken: FiatToken.USD, labelKey: "components.regionSelectStep.regions.US" }
];

export function findKybRegionByCode(code?: string): KybRegion | undefined {
  if (!code) return undefined;
  const normalized = code.toUpperCase();
  return KYB_REGIONS.find(region => region.code === normalized);
}
