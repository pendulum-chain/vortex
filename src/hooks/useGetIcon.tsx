import { useChainId } from 'wagmi';
import { polygon } from 'wagmi/chains';

import BRL from '../assets/coins/BRL.png';
import EURC from '../assets/coins/EURC.png';
import USDC from '../assets/coins/USDC.png';
import USDC_POLYGON from '../assets/coins/USDC_POLYGON.svg';
import DefaultIcon from '../assets/coins/PEN.png';
import { InputTokenType, OutputTokenType } from '../constants/tokenConfig';

type IconMap = Partial<Record<InputTokenType | OutputTokenType, string>>;

const icons: IconMap = {
  brl: BRL,
  eurc: EURC,
  usdce: USDC,
};

const polygonIcons: IconMap = {
  usdc: USDC_POLYGON,
  usdce: USDC_POLYGON,
};

const IconMaps: Record<string, IconMap> = {
  [polygon.id]: polygonIcons,
  default: icons,
};

export function useGetIcon(token?: 'usdc' | OutputTokenType, defaultIcon = DefaultIcon) {
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
