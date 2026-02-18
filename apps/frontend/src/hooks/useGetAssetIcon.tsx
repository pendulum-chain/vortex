import ARS from "../assets/coins/ARS.png";
import BRL from "../assets/coins/BRL.png";
import EUR from "../assets/coins/EUR.svg";
import EURC from "../assets/coins/EURC.png";
import PLACEHOLDER from "../assets/coins/placeholder.svg";

const FIAT_ICONS: Record<string, string> = {
  ars: ARS,
  brl: BRL,
  eur: EUR,
  eurc: EURC
};

export type FiatIconType = keyof typeof FIAT_ICONS;

export function isValidFiatIcon(assetIcon: string): boolean {
  return assetIcon?.toLowerCase() in FIAT_ICONS;
}

export function useGetAssetIcon(assetIcon: string): string {
  return FIAT_ICONS[assetIcon?.toLowerCase()] ?? PLACEHOLDER;
}
