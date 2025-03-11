import { polygon } from 'wagmi/chains';
import Big from 'big.js';

import { SIGNING_SERVICE_URL } from '../../constants/constants';
import { isNetworkEVM, Networks } from '../../helpers/networks';

const QUOTE_ENDPOINT = `${SIGNING_SERVICE_URL}/v1/quotes`;

export type QuoteService = 'moonpay' | 'transak' | 'alchemypay' | 'vortex';

export type SupportedNetworks = typeof polygon.name;

interface Quote {
  // The price of crypto -> fiat, i.e. cryptoAmount * cryptoPrice = fiatAmount + totalFee
  cryptoPrice: number;
  // The amount of sent crypto
  cryptoAmount: number;
  // The amount in received fiat _after_ fees.
  fiatAmount: number;
  // The total fee in fiat (e.g. ramp fee + network fee)
  totalFee: number;
}

async function getQuoteFromService(
  provider: QuoteService,
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

  // Fetch the quote from the service with a GET request
  const params = new URLSearchParams({
    provider,
    fromCrypto,
    toFiat,
    amount: amount.toFixed(2),
    network: compatibleNetwork,
  });
  const response = await fetch(`${QUOTE_ENDPOINT}?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Error while fetching quote from ${provider}`);
  }

  const quote: Quote = await response.json();
  return new Big(quote.fiatAmount);
}

export type QuoteQuery = (fromCrypto: string, toFiat: string, amount: Big, network: Networks) => Promise<Big>;

export function getQueryFnForService(quoteService: QuoteService): QuoteQuery {
  return (fromCrypto, toFiat, amount, network) =>
    getQuoteFromService(quoteService, fromCrypto, toFiat, amount, network);
}
