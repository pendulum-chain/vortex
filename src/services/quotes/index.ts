import Big from 'big.js';
import { SIGNING_SERVICE_URL } from '../../constants/constants';

const QUOTE_ENDPOINT = `${SIGNING_SERVICE_URL}/v1/quotes`;

type QuoteService = 'moonpay' | 'transak' | 'alchemypay';

interface Quote {
  cryptoPrice: number;
  cryptoAmount: number;
  fiatAmount: number;
  totalFee: number;
}

async function getQuoteFromService(
  provider: QuoteService,
  fromCrypto: string,
  toFiat: string,
  amount: Big,
): Promise<Big> {
  // Fetch the quote from the service with a GET request
  const params = new URLSearchParams({ provider, fromCrypto, toFiat, amount: amount.toFixed(2) });
  const response = await fetch(`${QUOTE_ENDPOINT}?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Error while fetching quote from ${provider}`);
  }

  const quote: Quote = await response.json();
  return new Big(quote.fiatAmount);
}

export type QuoteQuery = (fromCrypto: string, toFiat: string, amount: Big) => Promise<Big>;

export function getQueryFnForService(quoteService: QuoteService): QuoteQuery {
  return (fromCrypto, toFiat, amount) => getQuoteFromService(quoteService, fromCrypto, toFiat, amount);
}
