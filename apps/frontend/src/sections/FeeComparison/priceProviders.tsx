import alchemyPayIcon from '../../assets/offramp/alchemypay.svg';
import moonpayIcon from '../../assets/offramp/moonpay.svg';
import transakIcon from '../../assets/offramp/transak.svg';
import vortexIcon from '../../assets/logo/blue.svg';

import { JSX } from 'react';
import { PriceEndpoints } from 'shared';

export interface PriceProvider {
  name: PriceEndpoints.Provider | 'vortex';
  icon?: JSX.Element;
  href: string;
}

export const priceProviders: PriceProvider[] = [
  {
    name: 'alchemypay',
    icon: <img src={alchemyPayIcon} className="w-40 ml-1" alt="AlchemyPay" />,
    href: 'https://alchemypay.org',
  },
  {
    name: 'moonpay',
    icon: <img src={moonpayIcon} className="w-40 ml-1" alt="Moonpay" />,
    href: 'https://moonpay.com',
  },
  {
    name: 'transak',
    icon: <img src={transakIcon} className="h-10 w-30" alt="Transak" />,
    href: 'https://transak.com',
  },
  {
    name: 'vortex',
    icon: <img src={vortexIcon} className="h-10 w-36" alt="Vortex" />,
    href: '',
  },
];
