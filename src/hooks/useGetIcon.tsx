import { useChainId } from 'wagmi';
import { polygon } from 'wagmi/chains';

import BRL from '../assets/coins/BRL.png';
import EURC from '../assets/coins/EURC.png';
import PEN from '../assets/coins/PEN.png';
import USDT from '../assets/coins/USDT.png';
import USDC from '../assets/coins/USDC.png';
import USDC_POLYGON from '../assets/coins/USDC_POLYGON.svg';

import DefaultIcon from '../assets/coins/PEN.png';
import { AssetCodes } from '../constants/tokenConfig';

type IconMap = {
  [key: string]: string;
};

const icons: IconMap = {
  [AssetCodes.BRL]: BRL,
  EURC,
  PEN,
  USDT,
  [AssetCodes.USDC]: USDC,
  [AssetCodes.USDCE]: USDC,
};

const polygonIcons: IconMap = {
  [AssetCodes.USDC]: USDC_POLYGON,
  [AssetCodes.USDCE]: USDC_POLYGON,
};

const IconMaps: Record<string, IconMap> = {
  [polygon.id]: polygonIcons,
  default: icons,
};

export function useGetIcon(token?: string, defaultIcon = DefaultIcon) {
  const currentChainId = useChainId();
  const currentIconMap = IconMaps[currentChainId] || IconMaps.default;

  if (!token) return defaultIcon;

  // map(key => key.toLowerCase()) is used to make the comparison case-insensitive
  const currentChainIconMapHasTokenIcon = Object.keys(currentIconMap)
    .map((key) => key.toLowerCase())
    .includes(token.toLowerCase());

  const defaultChainIconMapHasTokenIcon = Object.keys(IconMaps.default)
    .map((key) => key.toLowerCase())
    .includes(token.toLowerCase());

  return currentChainIconMapHasTokenIcon
    ? currentIconMap[token]
    : defaultChainIconMapHasTokenIcon
    ? IconMaps.default[token]
    : defaultIcon;
}
