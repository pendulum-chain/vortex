import { BuildingLibraryIcon, CreditCardIcon } from "@heroicons/react/24/outline";
import { GlobeAmericasIcon } from "@heroicons/react/24/solid";
import { AlfredpayFiatAccountType } from "@vortexfi/shared";

export type PaymentMethodKey = "SPEI" | "ACH" | "WIRE";

export interface CountryPaymentConfig {
  country: string;
  countryName: string;
  currency: string;
  onramp: PaymentMethodKey[];
  offramp: PaymentMethodKey[];
}

export const ALFRED_COUNTRY_METHODS: CountryPaymentConfig[] = [
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

export const METHOD_ICONS: Record<PaymentMethodKey, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  ACH: BuildingLibraryIcon,
  SPEI: CreditCardIcon,
  WIRE: GlobeAmericasIcon
};

export const METHOD_LABELS: Record<PaymentMethodKey, string> = {
  ACH: "ACH Transfer",
  SPEI: "SPEI",
  WIRE: "Wire Transfer"
};

export const METHOD_DESCRIPTIONS: Record<PaymentMethodKey, string> = {
  ACH: "1-2 business days",
  SPEI: "Instant interbank transfer via CLABE number",
  WIRE: "Same day"
};

export const METHOD_TO_ALFRED_TYPE: Record<PaymentMethodKey, AlfredpayFiatAccountType | null> = {
  ACH: AlfredpayFiatAccountType.ACH,
  SPEI: AlfredpayFiatAccountType.SPEI,
  WIRE: AlfredpayFiatAccountType.BANK_USA
};
