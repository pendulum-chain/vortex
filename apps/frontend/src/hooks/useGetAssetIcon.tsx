import ARS from "../assets/coins/ARS.png";
import BRL from "../assets/coins/BRL.png";
import EUR from "../assets/coins/EU.png";
import MX from "../assets/coins/MX.png";
import PLACEHOLDER from "../assets/coins/placeholder.svg";
import USD from "../assets/coins/USD.png";

const FIAT_ICONS: Record<string, string> = {
  ars: ARS,
  brl: BRL,
  eur: EUR,
  mx: MX,
  usd: USD
};

export type FiatIconType = keyof typeof FIAT_ICONS;

export function isValidFiatIcon(assetIcon: string): boolean {
  return assetIcon?.toLowerCase() in FIAT_ICONS;
}

export function useGetAssetIcon(assetIcon: string): string {
  return FIAT_ICONS[assetIcon?.toLowerCase()] ?? PLACEHOLDER;
}
