import { getQueryFnForService, QuoteQuery, QuoteService } from '../../services/quotes';
import alchemyPayIcon from '../../assets/alchemypay.svg';
import moonpayIcon from '../../assets/moonpay.svg';
import transakIcon from '../../assets/transak.svg';

export interface QuoteProvider {
  name: QuoteService;
  icon?: JSX.Element;
  query: QuoteQuery;
  href: string;
}

export const quoteProviders: QuoteProvider[] = [
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
    icon: <img src={transakIcon} className="w-30 h-10" alt="Transak" />,
    query: getQueryFnForService('transak'),
    href: 'https://transak.com',
  },
];
