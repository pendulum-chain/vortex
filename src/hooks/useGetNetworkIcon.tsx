import ASSET_HUB from '../assets/chains/assetHub.svg';
import POLYGON from '../assets/chains/polygon.svg';

export enum Networks {
  assetHub = 'assetHub',
  polygon = 'polygon',
}

export const NETWORK_ICONS = {
  [Networks.assetHub]: ASSET_HUB,
  [Networks.polygon]: POLYGON,
};

export type NetworkIconType = keyof typeof NETWORK_ICONS;

export function useGetNetworkIcon(networkIcon: NetworkIconType) {
  return NETWORK_ICONS[networkIcon];
}
