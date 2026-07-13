import type { AccountType, Corridor, CorridorId, OnboardingKind, OnboardingRoute } from "./types";

export const CORRIDORS: Record<CorridorId, Corridor> = {
  AR: {
    availability: "live",
    currency: "ARS",
    flag: "🇦🇷",
    id: "AR",
    name: "Argentina",
    provider: "alfredpay",
    recipientLabel: "CBU / CVU",
    recipientMethod: "ach"
  },
  BR: {
    availability: "live",
    currency: "BRL",
    flag: "🇧🇷",
    id: "BR",
    name: "Brazil",
    provider: "avenia",
    recipientLabel: "PIX key",
    recipientMethod: "pix"
  },
  CO: {
    availability: "live",
    currency: "COP",
    flag: "🇨🇴",
    id: "CO",
    name: "Colombia",
    provider: "alfredpay",
    recipientLabel: "Account number",
    recipientMethod: "ach"
  },
  EU: {
    availability: "live",
    currency: "EURC",
    flag: "🇪🇺",
    id: "EU",
    name: "Europe",
    provider: "monerium",
    recipientLabel: "IBAN",
    recipientMethod: "iban"
  },
  MX: {
    availability: "live",
    currency: "MXN",
    flag: "🇲🇽",
    id: "MX",
    name: "Mexico",
    provider: "alfredpay",
    recipientLabel: "CLABE",
    recipientMethod: "spei"
  },
  US: {
    availability: "live",
    currency: "USD",
    flag: "🇺🇸",
    id: "US",
    name: "USA",
    provider: "alfredpay",
    recipientLabel: "ACH routing + account",
    recipientMethod: "ach"
  }
};

export const CORRIDOR_LIST: Corridor[] = [CORRIDORS.BR, CORRIDORS.EU, CORRIDORS.MX, CORRIDORS.CO, CORRIDORS.US, CORRIDORS.AR];

export const PROVIDER_LABEL: Record<Corridor["provider"], string> = {
  alfredpay: "Alfredpay",
  avenia: "Avenia",
  monerium: "Monerium",
  mykobo: "Mykobo"
};

/** Companies run KYB, individuals run KYC — in every supported corridor. */
export function onboardingKindFor(_corridor: Corridor, accountType: AccountType): OnboardingKind {
  return accountType === "company" ? "kyb" : "kyc";
}

/**
 * Routing method per the supported-onboarding matrix (§2): USA always redirects to a
 * partner, while every other supported corridor uses its provider flow.
 */
export function routeFor(corridorId: CorridorId, kind: OnboardingKind): OnboardingRoute {
  if (corridorId === "US") {
    return "redirect";
  }
  return "headless";
}
