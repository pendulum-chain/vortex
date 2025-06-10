import { Networks, PriceEndpoints } from 'shared';
import { config } from '../../../config/vars';

const { priceProviders } = config;

/**
 * Payment method constants for Transak API
 */
const PAYMENT_METHODS = {
  CREDIT_CARD: 'credit_debit_card',
} as const;

/**
 * Type definition for request configuration
 */
type RequestConfig = {
  requestPath: string;
  params: URLSearchParams;
};

/**
 * Create a buy (onramp) quote request
 * @param cryptoCurrencyCode The cryptocurrency code
 * @param fiatCurrencyCode The fiat currency code
 * @param fiatAmount The fiat amount to convert
 * @param network The blockchain network
 * @returns Request configuration
 */
function createBuyQuoteRequest(
  cryptoCurrencyCode: string,
  fiatCurrencyCode: string,
  fiatAmount: string,
  network: Networks,
): RequestConfig {
  const requestPath = '/api/v1/pricing/public/quotes';

  const paramsObj: Record<string, string> = {
    partnerApiKey: priceProviders.transak.partnerApiKey || '',
    cryptoCurrency: cryptoCurrencyCode,
    fiatCurrency: fiatCurrencyCode,
    fiatAmount,
    network: network.toLowerCase(),
    isBuyOrSell: 'BUY',
    paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
  };

  return {
    requestPath,
    params: new URLSearchParams(paramsObj),
  };
}

/**
 * Create a sell (offramp) quote request
 * @param cryptoCurrencyCode The cryptocurrency code
 * @param fiatCurrencyCode The fiat currency code
 * @param cryptoAmount The crypto amount to convert
 * @param network The blockchain network
 * @returns Request configuration
 */
function createSellQuoteRequest(
  cryptoCurrencyCode: string,
  fiatCurrencyCode: string,
  cryptoAmount: string,
  network: Networks,
): RequestConfig {
  const requestPath = '/api/v1/pricing/public/quotes';

  const paramsObj: Record<string, string> = {
    partnerApiKey: priceProviders.transak.partnerApiKey || '',
    cryptoCurrency: cryptoCurrencyCode,
    fiatCurrency: fiatCurrencyCode,
    cryptoAmount,
    network: network.toLowerCase(),
    isBuyOrSell: 'SELL',
  };

  return {
    requestPath,
    params: new URLSearchParams(paramsObj),
  };
}

/**
 * Create a quote request based on direction
 * @param direction The direction of the conversion (onramp or offramp)
 * @param cryptoCurrencyCode The cryptocurrency code
 * @param fiatCurrencyCode The fiat currency code
 * @param amount The amount to convert
 * @param network The blockchain network
 * @returns Request configuration
 */
export function createQuoteRequest(
  direction: PriceEndpoints.Direction,
  cryptoCurrencyCode: string,
  fiatCurrencyCode: string,
  amount: string,
  network: Networks,
): RequestConfig {
  return direction === 'onramp'
    ? createBuyQuoteRequest(cryptoCurrencyCode, fiatCurrencyCode, amount, network)
    : createSellQuoteRequest(cryptoCurrencyCode, fiatCurrencyCode, amount, network);
}
