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

/**
 * Creates a query function for a specific price provider
 * @param priceService The provider name
 * @returns A function that fetches the price from the specified provider
 */
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

/**
 * Creates a query function that fetches prices from all providers in a single request
 * @param priceService The provider to get the price for
 * @returns A function that fetches the price from the specified provider using the bundled endpoint
 */
export function getQueryFnForBundledService(priceService: PriceEndpoints.Provider): PriceQueryFn {
  return async (fromCrypto, toFiat, amount, network) => {
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

    try {
      // Fetch all prices in a single request
      const allPrices = await PriceService.getAllPricesBundled(
        fromCrypto as PriceEndpoints.CryptoCurrency,
        toFiat as PriceEndpoints.FiatCurrency,
        amount.toFixed(2),
        network
      );

      // Get the result for the requested provider
      const providerResult = allPrices[priceService];
      
      if (!providerResult) {
        throw new Error(`No price data returned for provider: ${priceService}`);
      }

      if (providerResult.status === 'rejected') {
        throw new Error(providerResult.reason.message || 'Failed to fetch price');
      }

      return providerResult.value.fiatAmount ? Big(providerResult.value.fiatAmount) : Big(0);
    } catch (error) {
      console.error(`Error fetching bundled price for ${priceService}:`, error);
      throw error;
    }
  };
}

export const priceProviders: PriceProvider[] = [
  {
    name: 'alchemypay',
    icon: <img src={alchemyPayIcon} className="w-40 ml-1" alt="AlchemyPay" />,
    query: getQueryFnForBundledService('alchemypay'),
    href: 'https://alchemypay.org',
  },
  {
    name: 'moonpay',
    icon: <img src={moonpayIcon} className="w-40 ml-1" alt="Moonpay" />,
    query: getQueryFnForBundledService('moonpay'),
    href: 'https://moonpay.com',
  },
  {
    name: 'transak',
    icon: <img src={transakIcon} className="h-10 w-30" alt="Transak" />,
    query: getQueryFnForBundledService('transak'),
    href: 'https://transak.com',
  },
  {
    name: 'vortex',
    icon: <img src={vortexIcon} className="h-10 w-36" alt="Vortex" />,
    query: () => Promise.resolve(new Big(0)),
    href: '',
  },
];
