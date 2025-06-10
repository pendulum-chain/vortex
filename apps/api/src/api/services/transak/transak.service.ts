import { Networks } from 'shared';
import { PriceEndpoints } from 'shared';
import { config } from '../../../config/vars';
import { ProviderInternalError } from '../../errors/providerErrors';
import { createQuoteRequest } from './request-creator';
import { processTransakResponse, TransakApiResponse } from './response-handler';
import { getCryptoCode, getFiatCode } from './utils';

const { priceProviders } = config;

/**
 * Type for fetch result
 */
type FetchResult = {
  response: Response;
  body: TransakApiResponse;
};

/**
 * Fetch data from Transak API
 * @param url The URL to fetch
 * @returns The response and parsed body
 */
async function fetchTransakData(url: string): Promise<FetchResult> {
  try {
    const response = await fetch(url);
    const body = (await response.json()) as TransakApiResponse;
    return { response, body };
  } catch (fetchError) {
    console.error('Transak fetch error:', fetchError);
    throw new ProviderInternalError(`Network error fetching price from Transak: ${(fetchError as Error).message}`);
  }
}

/**
 * Query the Transak API for price quotes
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
  network: Networks,
  direction: PriceEndpoints.Direction,
): Promise<PriceEndpoints.TransakPriceResponse> {
  const { baseUrl, partnerApiKey } = priceProviders.transak;

  if (!partnerApiKey) {
    throw new Error('Transak partner API key is not defined');
  }

  const { requestPath, params } = createQuoteRequest(direction, cryptoCurrencyCode, fiatCurrencyCode, amount, network);

  const url = `${baseUrl}${requestPath}?${params.toString()}`;

  const { response, body } = await fetchTransakData(url);

  return processTransakResponse(response, body, amount, direction);
}

/**
 * Get price information from Transak
 * @param sourceCurrency The source currency (crypto for offramp, fiat for onramp)
 * @param targetCurrency The target currency (fiat for offramp, crypto for onramp)
 * @param amount The amount to convert
 * @param direction The direction of the conversion (onramp or offramp)
 * @param network Optional network name
 * @returns Transak price information in standardized format
 */
export const getPriceFor = (
  sourceCurrency: string,
  targetCurrency: string,
  amount: string | number,
  direction: PriceEndpoints.Direction,
  network?: Networks,
): Promise<PriceEndpoints.TransakPriceResponse> => {
  const DEFAULT_NETWORK = 'polygon';
  const networkCode = network?.toLowerCase() || DEFAULT_NETWORK;

  // For offramp: source is crypto, target is fiat
  // For onramp: source is fiat, target is crypto
  const cryptoCurrency = direction === 'onramp' ? targetCurrency : sourceCurrency;
  const fiatCurrency = direction === 'onramp' ? sourceCurrency : targetCurrency;

  return priceQuery(
    getCryptoCode(cryptoCurrency),
    getFiatCode(fiatCurrency),
    amount.toString(),
    networkCode as Networks,
    direction,
  );
};
