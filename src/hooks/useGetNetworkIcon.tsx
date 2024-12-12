import ASSET_HUB from '../assets/chains/assetHub.svg';
import POLYGON from '../assets/chains/polygon.svg';
import { Networks } from '../contexts/network';

export const NETWORK_ICONS = {
  [Networks.AssetHub]: ASSET_HUB,
  [Networks.Polygon]: POLYGON,
};

export type NetworkIconType = keyof typeof NETWORK_ICONS;

export function useGetNetworkIcon(networkIcon: NetworkIconType) {
  return NETWORK_ICONS[networkIcon];
}
