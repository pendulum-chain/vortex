import ASSET_HUB from '../assets/chains/assetHub.svg';
import POLYGON from '../assets/chains/polygon.svg';
import ETHEREUM from '../assets/chains/ethereum.svg';
import BSC from '../assets/chains/bsc.svg';
import ARBITRUM from '../assets/chains/arbitrum.svg';
import BASE from '../assets/chains/base.svg';
import AVALANCHE from '../assets/chains/avalanche.svg';

import { Networks } from 'shared';

export const NETWORK_ICONS: Record<Networks, string> = {
  [Networks.AssetHub]: ASSET_HUB,
  [Networks.Polygon]: POLYGON,
  [Networks.Ethereum]: ETHEREUM,
  // [Networks.BSC]: BSC,
  [Networks.Arbitrum]: ARBITRUM,
  [Networks.Base]: BASE,
  [Networks.Avalanche]: AVALANCHE,
  [Networks.Moonbeam]: '',
  [Networks.Pendulum]: '',
  [Networks.Stellar]: '',
};

export function useGetNetworkIcon(network: Networks) {
  return NETWORK_ICONS[network];
}
