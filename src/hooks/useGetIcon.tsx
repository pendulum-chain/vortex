import EURC from '../assets/coins/EURC.png';
import EUR from '../assets/coins/EUR.svg';
import USDC from '../assets/coins/USDC.png';
import USDC_POLYGON from '../assets/coins/USDC_POLYGON.svg';

const ICONS = {
  eurc: EURC,
  eur: EUR,
  usdc: USDC,
  polygonUSDC: USDC_POLYGON,
};

export type AssetIconType = keyof typeof ICONS;

export function useGetIcon(assetIcon: AssetIconType) {
  return ICONS[assetIcon];
}
