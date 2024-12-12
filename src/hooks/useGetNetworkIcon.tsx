import ASSET_HUB from '../assets/chains/assetHub.svg';
import POLYGON from '../assets/chains/polygon.svg';
import { Networks } from '../contexts/network';

export const NETWORK_ICONS = {
  [Networks.AssetHub]: ASSET_HUB,
  [Networks.Polygon]: POLYGON,
  [Networks.Ethereum]: POLYGON, // TODO get proper icons
  [Networks.BSC]: POLYGON,
  [Networks.Arbitrum]: POLYGON,
  [Networks.Base]: POLYGON,
  [Networks.Avalanche]: POLYGON,
};

export type NetworkIconType = keyof typeof NETWORK_ICONS;

export function useGetNetworkIcon(networkIcon: NetworkIconType) {
  return NETWORK_ICONS[networkIcon];
}
