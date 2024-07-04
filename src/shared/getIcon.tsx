import BRL from '../assets/coins/BRL.png';
import EURC from '../assets/coins/EURC.png';
import PEN from '../assets/coins/PEN.png';
import USDT from '../assets/coins/USDT.png';

import DefaultIcon from '../assets/coins/PEN.png';

type IconMap = {
  [key: string]: string;
};

const icons: IconMap = {
  BRL,
  EURC,
  PEN,
  USDT,
};

export function getIcon(token: string | undefined, defaultIcon = DefaultIcon) {
  return token && Object.keys(icons).includes(token) ? icons[token] : defaultIcon;
}
