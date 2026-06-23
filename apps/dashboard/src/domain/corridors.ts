import type { AccountType, Corridor, CorridorId, OnboardingKind } from "./types";

export const CORRIDORS: Record<CorridorId, Corridor> = {
  AR: {
    availability: "coming_soon",
    currency: "ARS",
    flag: "🇦🇷",
    id: "AR",
    name: "Argentina",
    provider: "alfredpay",
    recipientLabel: "CBU / CVU",
    recipientMethod: "ach",
    supportsKyb: false
  },
  BR: {
    availability: "live",
    currency: "BRL",
    flag: "🇧🇷",
    id: "BR",
    name: "Brazil",
    provider: "avenia",
    recipientLabel: "PIX key",
    recipientMethod: "pix",
    supportsKyb: true
  },
  CO: {
    availability: "coming_soon",
    currency: "COP",
    flag: "🇨🇴",
    id: "CO",
    name: "Colombia",
    provider: "alfredpay",
    recipientLabel: "Account number",
    recipientMethod: "ach",
    supportsKyb: false
  },
  EU: {
    availability: "live",
    currency: "EURC",
    flag: "🇪🇺",
    id: "EU",
    name: "Europe",
    provider: "mykobo",
    recipientLabel: "IBAN",
    recipientMethod: "iban",
    supportsKyb: false
  },
  MX: {
    availability: "coming_soon",
    currency: "MXN",
    flag: "🇲🇽",
    id: "MX",
    name: "Mexico",
    provider: "alfredpay",
    recipientLabel: "CLABE",
    recipientMethod: "spei",
    supportsKyb: false
  },
  US: {
    availability: "coming_soon",
    currency: "USD",
    flag: "🇺🇸",
    id: "US",
    name: "USA",
    provider: "alfredpay",
    recipientLabel: "ACH routing + account",
    recipientMethod: "ach",
    supportsKyb: false
  }
};

export const CORRIDOR_LIST: Corridor[] = [CORRIDORS.BR, CORRIDORS.EU, CORRIDORS.MX, CORRIDORS.CO, CORRIDORS.US, CORRIDORS.AR];

export const PROVIDER_LABEL: Record<Corridor["provider"], string> = {
  alfredpay: "Alfredpay",
  avenia: "Avenia",
  mykobo: "Mykobo"
};

/** Avenia runs company KYB; everyone else (and all individuals) is individual KYC. */
export function onboardingKindFor(corridor: Corridor, accountType: AccountType): OnboardingKind {
  return corridor.supportsKyb && accountType === "company" ? "kyb" : "kyc";
}

export function isLive(corridorId: CorridorId): boolean {
  return CORRIDORS[corridorId].availability === "live";
}
