import { useAccount, useChainId } from 'wagmi';
import { polygon } from 'wagmi/chains';

import EURC from '../assets/coins/EURC.png';
import EUR from '../assets/coins/EUR.svg';
import USDC from '../assets/coins/USDC.png';
import USDC_POLYGON from '../assets/coins/USDC_POLYGON.svg';
import DefaultIcon from '../assets/coins/PEN.png';

const ICONS = {
  default: {
    eurc: EURC,
    eur: EUR,
    usdc: USDC,
    usdce: USDC,
  },
  [polygon.id]: {
    usdc: USDC_POLYGON,
    usdce: USDC_POLYGON,
  },
};

type TokenType = keyof typeof ICONS.default | keyof (typeof ICONS)[typeof polygon.id];

export function useGetIcon(token?: TokenType, defaultIcon = DefaultIcon) {
  const chainId = useChainId();
  const { isConnected } = useAccount();

  const iconMap = isConnected ? ICONS[chainId as keyof typeof ICONS] : ICONS.default;

  return token ? iconMap[token as keyof typeof iconMap] || ICONS.default[token] || defaultIcon : defaultIcon;
}
