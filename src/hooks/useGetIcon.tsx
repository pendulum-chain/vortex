import { useChainId } from 'wagmi';
import { polygon } from 'wagmi/chains';

import BRL from '../assets/coins/BRL.png';
import EURC from '../assets/coins/EURC.png';
import PEN from '../assets/coins/PEN.png';
import USDT from '../assets/coins/USDT.png';
import USDC from '../assets/coins/USDC.png';
import USDC_POLYGON from '../assets/coins/USDC_POLYGON.png';

import DefaultIcon from '../assets/coins/PEN.png';

type IconMap = {
  [key: string]: string;
};

const icons: IconMap = {
  BRL,
  EURC,
  PEN,
  USDT,
  USDC,
};

const polygonIcons: IconMap = {
  USDC: USDC_POLYGON,
};

const IconMaps: Record<string, IconMap> = {
  [polygon.id]: polygonIcons,
  default: icons,
};

export function useGetIcon(token?: string, defaultIcon = DefaultIcon) {
  const currentChainId = useChainId();
  const currentIconMap = IconMaps[currentChainId] || IconMaps.default;

  return token && Object.keys(currentIconMap).includes(token) ? currentIconMap[token] : defaultIcon;
}
