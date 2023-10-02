import AMPE from '../../assets/coins/AMPE.png';
import BRL from '../../assets/coins/BRL.png';
import DOT from '../../assets/coins/DOT.png';
import KSM from '../../assets/coins/KSM.png';
import PEN from '../../assets/coins/PEN.png';
import TZS from '../../assets/coins/TZS.png';
import USDC from '../../assets/coins/USDC.png';
import USDT from '../../assets/coins/USDT.png';
import XLM from '../../assets/coins/XLM.png';
import DefaultIcon from '../../assets/coins/placeholder.png';

type IconMap = {
  [key: string]: string;
};

const icons: IconMap = {
  'BRL.s': BRL,
  'TZS.s': TZS,
  'XLM.s': XLM,
  'USDC.s': USDC,
  DOT,
  KSM,
  USDT,
  PEN,
  AMPE,
};

export function getIcon(token: string) {
  return Object.keys(icons).includes(token) ? icons[token] : DefaultIcon;
}
