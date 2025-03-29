import { polygon } from 'wagmi/chains';
import Big from 'big.js';

import { SIGNING_SERVICE_URL } from '../../constants/constants';
import { isNetworkEVM, Networks } from 'shared';

const PRICE_ENDPOINT = `${SIGNING_SERVICE_URL}/v1/prices`;

export type PriceService = 'moonpay' | 'transak' | 'alchemypay' | 'vortex';

export type SupportedNetworks = typeof polygon.name;

interface Price {
  // The price of crypto -> fiat, i.e. cryptoAmount * cryptoPrice = fiatAmount + totalFee
  cryptoPrice: number;
  // The amount of sent crypto
  cryptoAmount: number;
  // The amount in received fiat _after_ fees.
  fiatAmount: number;
  // The total fee in fiat (e.g. ramp fee + network fee)
  totalFee: number;
}

async function getPriceFromService(
  provider: PriceService,
  fromCrypto: string,
  toFiat: string,
  amount: Big,
  network: Networks,
): Promise<Big> {
  if (provider === 'vortex') return new Big(0);
  let compatibleNetwork = network;
  if (!isNetworkEVM(network)) {
    console.error(`Network ${network} is not supported`);
    compatibleNetwork = Networks.Polygon;
  }

  // Fetch the price from the service with a GET request
  const params = new URLSearchParams({
    provider,
    fromCrypto,
    toFiat,
    amount: amount.toFixed(2),
    network: compatibleNetwork,
  });
  const response = await fetch(`${PRICE_ENDPOINT}?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Error while fetching price from ${provider}`);
  }

  const price: Price = await response.json();
  return new Big(price.fiatAmount);
}

export type PriceQuery = (fromCrypto: string, toFiat: string, amount: Big, network: Networks) => Promise<Big>;

export function getQueryFnForService(priceService: PriceService): PriceQuery {
  return (fromCrypto, toFiat, amount, network) =>
    getPriceFromService(priceService, fromCrypto, toFiat, amount, network);
}
