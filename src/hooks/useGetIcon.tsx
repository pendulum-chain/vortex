import EURC from '../assets/coins/EURC.png';
import EUR from '../assets/coins/EUR.svg';
import USDC from '../assets/coins/USDC.png';
import USDT from '../assets/coins/USDT.svg';
import USDC_POLYGON from '../assets/coins/USDC_POLYGON.svg';
import USDT_POLYGON from '../assets/coins/USDT_POLYGON.svg';

const ICONS = {
  eur: EUR,
  eurc: EURC,
  usdc: USDC,
  usdt: USDT,
  polygonUSDC: USDC_POLYGON,
  polygonUSDT: USDT_POLYGON,
};

export type AssetIconType = keyof typeof ICONS;

export function useGetIcon(assetIcon: AssetIconType) {
  return ICONS[assetIcon];
}
