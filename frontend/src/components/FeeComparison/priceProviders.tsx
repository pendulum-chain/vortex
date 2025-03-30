import alchemyPayIcon from '../../assets/offramp/alchemypay.svg';
import moonpayIcon from '../../assets/offramp/moonpay.svg';
import transakIcon from '../../assets/offramp/transak.svg';
import vortexIcon from '../../assets/logo/blue.svg';
import { JSX } from 'react';
import Big from 'big.js';
import { PriceEndpoints } from 'shared';
import { PriceService } from '../../services/api';

export interface PriceProvider {
  name: PriceEndpoints.Provider | 'vortex';
  icon?: JSX.Element;
  query: PriceQueryFn;
  href: string;
}

export type PriceQueryFn = (fromCrypto: string, toFiat: string, amount: Big, network: string) => Promise<Big>;

export function getQueryFnForService(priceService: PriceEndpoints.Provider): PriceQueryFn {
  return (fromCrypto, toFiat, amount, network) => {
    // Use lower case on all currency strings
    fromCrypto = fromCrypto.toLowerCase();
    toFiat = toFiat.toLowerCase();
    priceService = priceService.toLowerCase() as PriceEndpoints.Provider;
    if (!PriceEndpoints.isValidCryptoCurrency(fromCrypto)) {
      throw new Error(`Invalid crypto currency: ${fromCrypto}`);
    }
    if (!PriceEndpoints.isValidFiatCurrency(toFiat)) {
      throw new Error(`Invalid fiat currency: ${toFiat}`);
    }
    if (!PriceEndpoints.isValidProvider(priceService)) {
      throw new Error(`Invalid provider: ${priceService}`);
    }

    return PriceService.getPrice(priceService, fromCrypto, toFiat, amount.toFixed(2), network).then((response) =>
      response.fiatAmount ? Big(response.fiatAmount) : Big(0),
    );
  };
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
    query: () => Promise.resolve(new Big(0)),
    href: '',
  },
];
