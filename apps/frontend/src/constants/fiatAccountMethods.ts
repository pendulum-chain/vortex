import { BuildingLibraryIcon, CreditCardIcon } from "@heroicons/react/24/outline";
import { GlobeAmericasIcon } from "@heroicons/react/24/solid";
import { AlfredpayFiatAccountType, FiatToken } from "@vortexfi/shared";

export type FiatAccountTypeKey = "SPEI" | "ACH" | "WIRE";

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
    offramp: ["ACH", "WIRE"],
    onramp: ["ACH", "WIRE"]
  },
  {
    country: "MX",
    countryName: "Mexico",
    currency: "MXN",
    offramp: ["SPEI"],
    onramp: ["SPEI"]
  }
];

export const ACCOUNT_TYPE_ICONS: Record<FiatAccountTypeKey, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  ACH: BuildingLibraryIcon,
  SPEI: CreditCardIcon,
  WIRE: GlobeAmericasIcon
};

export const ACCOUNT_TYPE_LABELS: Record<FiatAccountTypeKey, string> = {
  ACH: "components.fiatAccountMethods.labels.ACH",
  SPEI: "components.fiatAccountMethods.labels.SPEI",
  WIRE: "components.fiatAccountMethods.labels.WIRE"
};

export const ACCOUNT_TYPE_DESCRIPTIONS: Record<FiatAccountTypeKey, string> = {
  ACH: "components.fiatAccountMethods.descriptions.ACH",
  SPEI: "components.fiatAccountMethods.descriptions.SPEI",
  WIRE: "components.fiatAccountMethods.descriptions.WIRE"
};

export const ACCOUNT_TYPE_TO_ALFRED_TYPE: Record<FiatAccountTypeKey, AlfredpayFiatAccountType | null> = {
  ACH: AlfredpayFiatAccountType.ACH,
  SPEI: AlfredpayFiatAccountType.SPEI,
  WIRE: AlfredpayFiatAccountType.BANK_USA
};

export const ALFRED_TO_ACCOUNT_TYPE: Partial<Record<AlfredpayFiatAccountType, FiatAccountTypeKey>> = Object.entries(
  ACCOUNT_TYPE_TO_ALFRED_TYPE
).reduce<Partial<Record<AlfredpayFiatAccountType, FiatAccountTypeKey>>>((acc, [k, v]) => {
  if (v) acc[v] = k as FiatAccountTypeKey;
  return acc;
}, {});

export const ALFREDPAY_FIAT_TOKEN_TO_COUNTRY = Object.fromEntries(
  ALFREDPAY_COUNTRY_METHODS.map(c => [c.currency, c.country])
) as Partial<Record<FiatToken, string>>;
