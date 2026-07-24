import { Networks } from "@vortexfi/shared";
import ALL_NETWORKS from "@/assets/chains/all-networks.svg";
import ARBITRUM from "@/assets/chains/arbitrum.svg";
import AVALANCHE from "@/assets/chains/avalanche.svg";
import BASE from "@/assets/chains/base.svg";
import BSC from "@/assets/chains/bsc.svg";
import ETHEREUM from "@/assets/chains/ethereum.svg";
import POLYGON from "@/assets/chains/polygon.svg";
import ARS from "@/assets/coins/ARS.png";
import BRL from "@/assets/coins/BRL.png";
import COP from "@/assets/coins/COP.png";
import EUR from "@/assets/coins/EU.png";
import MXN from "@/assets/coins/MXN.png";
import PLACEHOLDER from "@/assets/coins/placeholder.svg";
import USD from "@/assets/coins/USD.png";

export const PLACEHOLDER_ICON = PLACEHOLDER;

// Keyed on the lowercased currency code. Both `eurc` and `eur` resolve to the euro coin: the
// dashboard corridor calls the currency EURC while the quote wire reports it as EUR.
const FIAT_ICONS: Record<string, string> = {
  ars: ARS,
  brl: BRL,
  cop: COP,
  eur: EUR,
  eurc: EUR,
  mxn: MXN,
  usd: USD
};

const NETWORK_ICONS: Partial<Record<Networks, string>> = {
  [Networks.Arbitrum]: ARBITRUM,
  [Networks.Avalanche]: AVALANCHE,
  [Networks.Base]: BASE,
  [Networks.BSC]: BSC,
  [Networks.Ethereum]: ETHEREUM,
  [Networks.Polygon]: POLYGON
};

export function fiatIconFor(currency: string): string {
  return FIAT_ICONS[currency.toLowerCase()] ?? PLACEHOLDER;
}

export function networkIconFor(network: Networks): string {
  return NETWORK_ICONS[network] ?? ALL_NETWORKS;
}
