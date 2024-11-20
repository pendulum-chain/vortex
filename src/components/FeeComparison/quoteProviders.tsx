import { getQueryFnForService, QuoteQuery } from '../../services/quotes';
import alchemyPayIcon from '../../assets/offramp/alchemypay.svg';
import moonpayIcon from '../../assets/offramp/moonpay.svg';
import transakIcon from '../../assets/offramp/transak.svg';

export interface QuoteProvider {
  name: string;
  icon?: JSX.Element;
  query: QuoteQuery;
  href: string;
}

export const quoteProviders: QuoteProvider[] = [
  {
    name: 'AlchemyPay',
    icon: <img src={alchemyPayIcon} className="w-40 ml-1" alt="AlchemyPay" />,
    query: getQueryFnForService('alchemypay'),
    href: 'https://alchemypay.org',
  },
  {
    name: 'MoonPay',
    icon: <img src={moonpayIcon} className="w-40 ml-1" alt="Moonpay" />,
    query: getQueryFnForService('moonpay'),
    href: 'https://moonpay.com',
  },
  {
    name: 'Transak',
    icon: <img src={transakIcon} className="h-10 w-30" alt="Transak" />,
    query: getQueryFnForService('transak'),
    href: 'https://transak.com',
  },
];
