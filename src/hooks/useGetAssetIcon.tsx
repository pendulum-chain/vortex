import EURC from '../assets/coins/EURC.png';
import EUR from '../assets/coins/EUR.svg';
import USDC from '../assets/coins/USDC.png';
import USDT from '../assets/coins/USDT.svg';

import USDC_AVALANCHE from '../assets/coins/USDC_AVALANCHE.svg';
import USDT_AVALANCHE from '../assets/coins/USDT_AVALANCHE.svg';
import USDC_ARBITRUM from '../assets/coins/USDC_ARBITRUM.svg';
import USDT_ARBITRUM from '../assets/coins/USDT_ARBITRUM.svg';
import USDC_BASE from '../assets/coins/USDC_BASE.svg';
import USDT_BASE from '../assets/coins/USDT_BASE.svg';
import USDC_BSC from '../assets/coins/USDC_BSC.svg';
import USDT_BSC from '../assets/coins/USDT_BSC.svg';
import USDC_ETHEREUM from '../assets/coins/USDC_ETHEREUM.svg';
import USDT_ETHEREUM from '../assets/coins/USDT_ETHEREUM.svg';

import USDC_POLYGON from '../assets/coins/USDC_POLYGON.svg';
import USDT_POLYGON from '../assets/coins/USDT_POLYGON.svg';

import USDC_ASSETHUB from '../assets/coins/USDC_ASSETHUB.svg';

import ARS from '../assets/coins/ARS.png';

const ICONS = {
  eur: EUR,
  eurc: EURC,
  usdc: USDC,
  usdt: USDT,
  arbitrumUSDC: USDC_ARBITRUM,
  arbitrumUSDT: USDT_ARBITRUM,
  avalancheUSDC: USDC_AVALANCHE,
  avalancheUSDT: USDT_AVALANCHE,
  baseUSDC: USDC_BASE,
  baseUSDT: USDT_BASE,
  bscUSDC: USDC_BSC,
  bscUSDT: USDT_BSC,
  ethereumUSDC: USDC_ETHEREUM,
  ethereumUSDT: USDT_ETHEREUM,
  polygonUSDC: USDC_POLYGON,
  polygonUSDT: USDT_POLYGON,
  assethubUSDC: USDC_ASSETHUB,
  ars: ARS,
};

export type AssetIconType = keyof typeof ICONS;

export function useGetAssetIcon(assetIcon: AssetIconType) {
  return ICONS[assetIcon];
}
