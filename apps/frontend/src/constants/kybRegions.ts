import {
  type CorridorCountry,
  type CorridorCustomerType,
  FiatToken,
  isCorridorSupportedForCustomerType
} from "@vortexfi/shared";
import { isFiatTokenEnabled } from "../config/tokenAvailability";
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
 * that determines the KYC/B provider (Brazil → Avenia, Mexico/Colombia/Argentina/USA → Alfredpay).
 * Europe/Mykobo is intentionally excluded: it is individual KYC only and requires a connected
 * wallet, so it cannot complete a quote-less KYB deep link (the backend's eur recipient rail is
 * Monerium, which onboards in the dashboard, not the widget). Add or remove entries here.
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
  { code: "AR", fiatToken: FiatToken.ARS, labelKey: "components.regionSelectStep.regions.AR" },
  { code: "US", fiatToken: FiatToken.USD, labelKey: "components.regionSelectStep.regions.US" }
];

export function findKybRegionByCode(code?: string): KybRegion | undefined {
  if (!code) return undefined;
  const normalized = code.toUpperCase();
  return KYB_REGIONS.find(region => region.code === normalized);
}

/**
 * Regions offered in the selector: enabled fiat tokens, minus combinations the corridor's
 * provider cannot onboard (e.g. Alfredpay has no AR company KYB) once the invite's customer
 * type is known. Before redemption the type is undecided, so all enabled regions show.
 */
export function availableKybRegions(customerType?: CorridorCustomerType): KybRegion[] {
  return KYB_REGIONS.filter(
    region =>
      isFiatTokenEnabled(region.fiatToken) &&
      (!customerType || isCorridorSupportedForCustomerType(region.code as CorridorCountry, customerType))
  );
}
