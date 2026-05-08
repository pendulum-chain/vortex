import { BuildingLibraryIcon, CreditCardIcon } from "@heroicons/react/24/outline";
import { GlobeAmericasIcon } from "@heroicons/react/24/solid";
import { AlfredpayFiatAccountType, FiatToken } from "@vortexfi/shared";

export type FiatAccountTypeKey = "SPEI" | "ACH" | "ACH_COL" | "WIRE";

export interface CountryFiatAccountConfig {
  country: string;
  countryName: string;
  currency: string;
  onramp: FiatAccountTypeKey[];
  offramp: FiatAccountTypeKey[];
}

export const ALFREDPAY_COUNTRY_METHODS: CountryFiatAccountConfig[] = [
  {
    country: "US",
    countryName: "United States",
    currency: "USD",
    offramp: ["WIRE"],
    onramp: ["WIRE"]
  },
  {
    country: "MX",
    countryName: "Mexico",
    currency: "MXN",
    offramp: ["SPEI"],
    onramp: ["SPEI"]
  },
  {
    country: "CO",
    countryName: "Colombia",
    currency: "COP",
    offramp: ["ACH_COL"],
    onramp: ["ACH_COL"]
  }
];

export const ACCOUNT_TYPE_ICONS: Record<FiatAccountTypeKey, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  ACH: BuildingLibraryIcon,
  ACH_COL: BuildingLibraryIcon,
  SPEI: CreditCardIcon,
  WIRE: GlobeAmericasIcon
};

export const ACCOUNT_TYPE_LABELS: Record<FiatAccountTypeKey, string> = {
  ACH: "components.fiatAccountMethods.labels.ACH",
  ACH_COL: "components.fiatAccountMethods.labels.ACH_COL",
  SPEI: "components.fiatAccountMethods.labels.SPEI",
  WIRE: "components.fiatAccountMethods.labels.WIRE"
};

export const ACCOUNT_TYPE_DESCRIPTIONS: Record<FiatAccountTypeKey, string> = {
  ACH: "components.fiatAccountMethods.descriptions.ACH",
  ACH_COL: "components.fiatAccountMethods.descriptions.ACH_COL",
  SPEI: "components.fiatAccountMethods.descriptions.SPEI",
  WIRE: "components.fiatAccountMethods.descriptions.WIRE"
};

export const ACCOUNT_TYPE_TO_ALFRED_TYPE: Record<FiatAccountTypeKey, AlfredpayFiatAccountType | null> = {
  ACH: AlfredpayFiatAccountType.ACH,
  ACH_COL: AlfredpayFiatAccountType.ACH,
  SPEI: AlfredpayFiatAccountType.SPEI,
  WIRE: AlfredpayFiatAccountType.BANK_USA
};

// ACH_COL and ACH both map to AlfredpayFiatAccountType.ACH on the API side.
// We prefer "ACH" as the display key for ACH accounts since it's the more general label.
export const ALFRED_TO_ACCOUNT_TYPE: Partial<Record<AlfredpayFiatAccountType, FiatAccountTypeKey>> = {
  [AlfredpayFiatAccountType.ACH]: "ACH",
  [AlfredpayFiatAccountType.SPEI]: "SPEI",
  [AlfredpayFiatAccountType.BANK_USA]: "WIRE"
};

// Resolves the display key for a fiat account, taking country into account.
// Colombia ACH accounts are stored as AlfredpayFiatAccountType.ACH but should display as "ACH_COL".
export function resolveAccountTypeKey(alfredType: AlfredpayFiatAccountType, country?: string): FiatAccountTypeKey | undefined {
  if (alfredType === AlfredpayFiatAccountType.ACH && country === "CO") return "ACH_COL";
  return ALFRED_TO_ACCOUNT_TYPE[alfredType];
}

export const ALFREDPAY_FIAT_TOKEN_TO_COUNTRY = Object.fromEntries(
  ALFREDPAY_COUNTRY_METHODS.map(c => [c.currency, c.country])
) as Partial<Record<FiatToken, string>>;
