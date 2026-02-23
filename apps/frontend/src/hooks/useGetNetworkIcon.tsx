import { Networks } from "@vortexfi/shared";
import DEFAULT_NETWORK from "../assets/chains/all-networks.svg";
import ARBITRUM from "../assets/chains/arbitrum.svg";
import ASSET_HUB from "../assets/chains/assethub.svg";
import AVALANCHE from "../assets/chains/avalanche.svg";
import BASE from "../assets/chains/base.svg";
import BSC from "../assets/chains/bsc.svg";
import ETHEREUM from "../assets/chains/ethereum.svg";
import POLYGON from "../assets/chains/polygon.svg";

type PresentNetworks =
  | Networks.AssetHub
  | Networks.Polygon
  | Networks.Ethereum
  | Networks.BSC
  | Networks.Arbitrum
  | Networks.Base
  | Networks.Avalanche;

export const NETWORK_ICONS: Record<PresentNetworks, string> = {
  [Networks.AssetHub]: ASSET_HUB,
  [Networks.Polygon]: POLYGON,
  [Networks.Ethereum]: ETHEREUM,
  [Networks.BSC]: BSC,
  [Networks.Arbitrum]: ARBITRUM,
  [Networks.Base]: BASE,
  [Networks.Avalanche]: AVALANCHE
};

export function isPresentNetwork(network: Networks): network is PresentNetworks {
  return network in NETWORK_ICONS;
}

export function useGetNetworkIcon(network: Networks): string {
  if (isPresentNetwork(network)) {
    return NETWORK_ICONS[network];
  }
  return DEFAULT_NETWORK;
}
