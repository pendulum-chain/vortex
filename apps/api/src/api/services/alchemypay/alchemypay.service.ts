import { PriceEndpoints } from '@packages/shared';
import { ProviderInternalError } from '../../errors/providerErrors';
import { createQuoteRequest } from './request-creator';
import { AlchemyPayResponse, processAlchemyPayResponse } from './response-handler';
import { getAlchemyPayNetworkCode, getCryptoCurrencyCode, getFiatCode } from './utils';

type FetchResult = {
  response: Response;
  body: AlchemyPayResponse;
};

/**
 * Fetch data from AlchemyPay API
 * @param url The URL to fetch
 * @param request The request options
 * @returns The response and parsed body
 */
async function fetchAlchemyPayData(url: string, request: RequestInit): Promise<FetchResult> {
  try {
    const response = await fetch(url, request);
    const body = (await response.json()) as AlchemyPayResponse;
    return { response, body };
  } catch (fetchError) {
    console.error('AlchemyPay fetch error:', fetchError);
    throw new ProviderInternalError(`Network error fetching price from AlchemyPay: ${(fetchError as Error).message}`);
  }
}

/**
 * Query the AlchemyPay API for price quotes
 * @param cryptoCurrencyCode The cryptocurrency code
 * @param fiatCurrencyCode The fiat currency code
 * @param amount The amount to convert
 * @param network The blockchain network
 * @param direction The direction of the conversion (onramp or offramp)
 * @returns Standardized price response
 */
async function priceQuery(
  cryptoCurrencyCode: string,
  fiatCurrencyCode: string,
  amount: string,
  network: string,
  direction: PriceEndpoints.Direction,
): Promise<PriceEndpoints.AlchemyPayPriceResponse> {
  const { requestUrl, request } = createQuoteRequest(direction, cryptoCurrencyCode, fiatCurrencyCode, amount, network);

  const { response, body } = await fetchAlchemyPayData(requestUrl, request);

  return processAlchemyPayResponse(response, body, amount, direction);
}

/**
 * Get price information from AlchemyPay
 * @param sourceCurrency The source currency (crypto for offramp, fiat for onramp)
 * @param targetCurrency The target currency (fiat for offramp, crypto for onramp)
 * @param amount The amount to convert
 * @param direction The direction of the conversion (onramp or offramp)
 * @param network Optional network name
 * @returns AlchemyPay price information in standardized format
 */
export const getPriceFor = (
  sourceCurrency: string,
  targetCurrency: string,
  amount: string | number,
  direction: PriceEndpoints.Direction,
  network?: string,
): Promise<PriceEndpoints.AlchemyPayPriceResponse> => {
  const DEFAULT_NETWORK = 'POLYGON';
  const networkCode = getAlchemyPayNetworkCode(network || DEFAULT_NETWORK);

  // For offramp: source is crypto, target is fiat
  // For onramp: source is fiat, target is crypto
  const cryptoCurrency = direction === 'onramp' ? targetCurrency : sourceCurrency;
  const fiatCurrency = direction === 'onramp' ? sourceCurrency : targetCurrency;

  return priceQuery(
    getCryptoCurrencyCode(cryptoCurrency),
    getFiatCode(fiatCurrency),
    amount.toString(),
    networkCode,
    direction,
  );
};
