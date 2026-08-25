import { BuildingLibraryIcon, CreditCardIcon } from "@heroicons/react/24/outline";
import { GlobeAmericasIcon } from "@heroicons/react/24/solid";
import { DomesticFiatAccountType, FiatToken } from "@vortexfi/shared";

export type FiatAccountTypeKey = "SPEI" | "ACH" | "ACH_COL" | "WIRE" | "COELSA";

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
  },
  {
    country: "AR",
    countryName: "Argentina",
    currency: "ARS",
    offramp: ["COELSA"],
    onramp: ["COELSA"]
  }
];

export const ACCOUNT_TYPE_ICONS: Record<FiatAccountTypeKey, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  ACH: BuildingLibraryIcon,
  ACH_COL: BuildingLibraryIcon,
  COELSA: BuildingLibraryIcon,
  SPEI: CreditCardIcon,
  WIRE: GlobeAmericasIcon
};

export const ACCOUNT_TYPE_LABELS: Record<FiatAccountTypeKey, string> = {
  ACH: "components.fiatAccountMethods.labels.ACH",
  ACH_COL: "components.fiatAccountMethods.labels.ACH_COL",
  COELSA: "components.fiatAccountMethods.labels.COELSA",
  SPEI: "components.fiatAccountMethods.labels.SPEI",
  WIRE: "components.fiatAccountMethods.labels.WIRE"
};

export const ACCOUNT_TYPE_DESCRIPTIONS: Record<FiatAccountTypeKey, string> = {
  ACH: "components.fiatAccountMethods.descriptions.ACH",
  ACH_COL: "components.fiatAccountMethods.descriptions.ACH_COL",
  COELSA: "components.fiatAccountMethods.descriptions.COELSA",
  SPEI: "components.fiatAccountMethods.descriptions.SPEI",
  WIRE: "components.fiatAccountMethods.descriptions.WIRE"
};

export const ACCOUNT_TYPE_TO_ALFRED_TYPE: Record<FiatAccountTypeKey, DomesticFiatAccountType | null> = {
  ACH: DomesticFiatAccountType.ACH,
  ACH_COL: DomesticFiatAccountType.ACH,
  COELSA: DomesticFiatAccountType.COELSA,
  SPEI: DomesticFiatAccountType.SPEI,
  WIRE: DomesticFiatAccountType.BANK_USA
};

export const ALFRED_TO_ACCOUNT_TYPE: Partial<Record<DomesticFiatAccountType, FiatAccountTypeKey>> = {
  [DomesticFiatAccountType.ACH]: "ACH",
  [DomesticFiatAccountType.SPEI]: "SPEI",
  [DomesticFiatAccountType.BANK_USA]: "WIRE",
  [DomesticFiatAccountType.COELSA]: "COELSA"
};

// Resolves the display key for a fiat account, taking country into account.
// Colombia ACH accounts are stored as DomesticFiatAccountType.ACH but should display as "ACH_COL".
export function resolveAccountTypeKey(alfredType: DomesticFiatAccountType, country?: string): FiatAccountTypeKey | undefined {
  if (alfredType === DomesticFiatAccountType.ACH && country === "CO") return "ACH_COL";
  return ALFRED_TO_ACCOUNT_TYPE[alfredType];
}

export const ALFREDPAY_FIAT_TOKEN_TO_COUNTRY = Object.fromEntries(
  ALFREDPAY_COUNTRY_METHODS.map(c => [c.currency, c.country])
) as Partial<Record<FiatToken, string>>;
