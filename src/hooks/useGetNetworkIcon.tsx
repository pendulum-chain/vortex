import ASSET_HUB from '../assets/chains/assetHub.svg';
import POLYGON from '../assets/chains/polygon.svg';

export enum NetworkIcons {
  assetHub = 'assetHub',
  polygon = 'polygon',
}

export const NETWORK_ICONS = {
  [NetworkIcons.assetHub]: ASSET_HUB,
  [NetworkIcons.polygon]: POLYGON,
};

export type NetworkIconType = keyof typeof NETWORK_ICONS;

export function useGetNetworkIcon(networkIcon: NetworkIconType) {
  return NETWORK_ICONS[networkIcon];
}
