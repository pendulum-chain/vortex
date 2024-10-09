import EURC from '../assets/coins/EURC.png';
import EUR from '../assets/coins/EUR.svg';
import USDC from '../assets/coins/USDC.png';
import USDC_POLYGON from '../assets/coins/USDC_POLYGON.svg';
import ARS from '../assets/coins/ARS.png';

const ICONS = {
  eurc: EURC,
  eur: EUR,
  usdc: USDC,
  polygonUSDC: USDC_POLYGON,
  ars: ARS,
};

export type AssetIconType = keyof typeof ICONS;

export function useGetIcon(assetIcon: AssetIconType) {
  return ICONS[assetIcon];
}
