import { getQueryFnForService, PriceQuery, PriceService } from '../../services/prices';
import alchemyPayIcon from '../../assets/offramp/alchemypay.svg';
import moonpayIcon from '../../assets/offramp/moonpay.svg';
import transakIcon from '../../assets/offramp/transak.svg';
import vortexIcon from '../../assets/logo/blue.svg';
import { JSX } from 'react';

export interface PriceProvider {
  name: PriceService;
  icon?: JSX.Element;
  query: PriceQuery;
  href: string;
}

export const priceProviders: PriceProvider[] = [
  {
    name: 'alchemypay',
    icon: <img src={alchemyPayIcon} className="w-40 ml-1" alt="AlchemyPay" />,
    query: getQueryFnForService('alchemypay'),
    href: 'https://alchemypay.org',
  },
  {
    name: 'moonpay',
    icon: <img src={moonpayIcon} className="w-40 ml-1" alt="Moonpay" />,
    query: getQueryFnForService('moonpay'),
    href: 'https://moonpay.com',
  },
  {
    name: 'transak',
    icon: <img src={transakIcon} className="h-10 w-30" alt="Transak" />,
    query: getQueryFnForService('transak'),
    href: 'https://transak.com',
  },
  {
    name: 'vortex',
    icon: <img src={vortexIcon} className="h-10 w-36" alt="Vortex" />,
    query: getQueryFnForService('vortex'),
    href: '',
  },
];
