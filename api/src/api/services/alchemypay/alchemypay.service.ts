import crypto from 'node:crypto';
import { config } from '../../../config/vars';
import { removeEmptyKeys, sortObject } from './helpers';
import {
  InvalidAmountError,
  InvalidParameterError,
  ProviderInternalError,
  UnsupportedPairError,
} from '../../errors/providerErrors';

const { priceProviders } = config;

export interface AlchemyPayPrice {
  cryptoPrice: number;
  cryptoAmount: number;
  fiatAmount: number;
  totalFee: number;
}

interface AlchemyPayResponse {
  success: boolean;
  returnMsg?: string;
  data: {
    cryptoPrice: string;
    rampFee: string;
    networkFee: string;
    fiatQuantity: string;
  };
}

function apiSign(timestamp: string, method: string, requestUrl: string, body: string, secretKey: string): string {
  const content = timestamp + method.toUpperCase() + getPath(requestUrl) + getJsonBody(body);
  return crypto.createHmac('sha256', secretKey).update(content).digest('base64');
}

function getPath(requestUrl: string): string {
  const uri = new URL(requestUrl);
  const path = uri.pathname;
  const params = Array.from(uri.searchParams.entries());

  if (params.length === 0) {
    return path;
  }
  const sortedParams = [...params].sort(([aKey], [bKey]) => aKey.localeCompare(bKey));
  const queryString = sortedParams.map(([key, value]) => `${key}=${value}`).join('&');
  return `${path}?${queryString}`;
}

function getJsonBody(body: string): string {
  let map: Record<string, unknown>;

  try {
    map = JSON.parse(body);
  } catch (error) {
    map = {};
    console.error("Couldn't parse JSON body", error);
  }

  if (Object.keys(map).length === 0) {
    return '';
  }

  map = removeEmptyKeys(map);
  map = sortObject(map) as Record<string, unknown>;

  return JSON.stringify(map);
}

// See https://alchemypay.readme.io/docs/price-query
async function priceQuery(
  crypto: string,
  fiat: string,
  amount: string,
  network: string,
  side: string,
): Promise<AlchemyPayPrice> {
  const { secretKey, baseUrl, appId } = priceProviders.alchemyPay;
  if (!secretKey || !appId) throw new Error('AlchemyPay configuration missing');

  const httpMethod = 'POST';
  const requestPath = '/open/api/v4/merchant/order/quote';
  const requestUrl = baseUrl + requestPath;
  const timestamp = String(Date.now());

  const bodyString = JSON.stringify({
    crypto,
    network,
    fiat,
    amount,
    side,
  });
  // It's important to sort the body before signing. It's also important for the POST request to have the body sorted.
  const sortedBody = getJsonBody(bodyString);

  const signature = apiSign(timestamp, httpMethod, requestUrl, sortedBody, secretKey.trim());

  const headers = {
    'Content-Type': 'application/json',
    appId,
    timestamp,
    sign: signature,
  } as const;

  const request = {
    method: 'POST',
    headers,
    body: sortedBody,
  } as const;

  let response: Response;
  try {
    response = await fetch(requestUrl, request);
  } catch (fetchError) {
    console.error('AlchemyPay fetch error:', fetchError);
    throw new ProviderInternalError(`Network error fetching price from AlchemyPay: ${(fetchError as Error).message}`);
  }

  let body: AlchemyPayResponse;
  try {
    body = (await response.json()) as AlchemyPayResponse;
  } catch (jsonError) {
    console.error('AlchemyPay JSON parse error:', jsonError);
    // If we can't parse the JSON, it's likely an unexpected response format or server issue
    throw new ProviderInternalError(
      `Failed to parse response from AlchemyPay (Status: ${response.status}): ${response.statusText}`,
    );
  }

  if (!response.ok) {
    // Handle HTTP errors (4xx, 5xx)
    const errorMessage = body?.returnMsg || `HTTP error ${response.status}: ${response.statusText}`;
    console.error(`AlchemyPay API Error (${response.status}): ${errorMessage}`);
    if (response.status >= 500) {
      throw new ProviderInternalError(`AlchemyPay server error: ${errorMessage}`);
    } else if (response.status >= 400) {
      // Try to map 4xx errors based on message
      if (errorMessage.toLowerCase().includes('minimum') || errorMessage.toLowerCase().includes('maximum')) {
        throw new InvalidAmountError(`AlchemyPay: ${errorMessage}`);
      }
      if (
        errorMessage.toLowerCase().includes('unsupported') ||
        errorMessage.toLowerCase().includes('invalid currency')
      ) {
        throw new UnsupportedPairError(`AlchemyPay: ${errorMessage}`);
      }
      // Default 4xx to InvalidParameterError
      throw new InvalidParameterError(`AlchemyPay API error: ${errorMessage}`);
    } else {
      // Other non-2xx errors
      throw new ProviderInternalError(`Unexpected HTTP status ${response.status} from AlchemyPay: ${errorMessage}`);
    }
  }

  // Handle cases where response is ok (2xx) but success flag is false
  if (!body.success) {
    const errorMessage = body.returnMsg || 'AlchemyPay API returned success=false with no message';
    console.error(`AlchemyPay API Logic Error: ${errorMessage}`);
    // Analyze returnMsg for specific errors
    if (errorMessage.toLowerCase().includes('minimum') || errorMessage.toLowerCase().includes('maximum')) {
      throw new InvalidAmountError(`AlchemyPay: ${errorMessage}`);
    }
    if (errorMessage.toLowerCase().includes('unsupported') || errorMessage.toLowerCase().includes('invalid currency')) {
      throw new UnsupportedPairError(`AlchemyPay: ${errorMessage}`);
    }
    if (errorMessage.toLowerCase().includes('invalid parameter')) {
      throw new InvalidParameterError(`AlchemyPay: ${errorMessage}`);
    }
    throw new ProviderInternalError(`AlchemyPay API logic error: ${errorMessage}`);
  }

  if (!body.data) {
    throw new ProviderInternalError('AlchemyPay API returned success=true but no data field');
  }

  const { cryptoPrice, rampFee, networkFee, fiatQuantity } = body.data;

  const totalFee = (Number(rampFee) || 0) + (Number(networkFee) || 0);
  // According to a comment in the response sample [here](https://alchemypay.readme.io/docs/price-query#response-sample)
  // the `fiatQuantity` does not yet include the fees so we need to subtract them.
  const fiatAmount = Math.max(0, (Number(fiatQuantity) || 0) - totalFee);

  return {
    cryptoPrice: Number(cryptoPrice),
    cryptoAmount: Number(amount),
    fiatAmount,
    totalFee,
  };
}

const NETWORK_MAP: Record<string, string> = {
  POLYGON: 'MATIC',
  BSC: 'BSC',
  ARBITRUM: 'ARBITRUM',
  AVALANCHE: 'AVAX',
  ETHEREUM: 'ETH',
};

const CRYPTO_MAP: Record<string, string> = {
  usdc: 'USDC',
  'usdc.e': 'USDC.e',
  usdce: 'USDC.e',
  usdt: 'USDT',
};

function getAlchemyPayNetworkCode(network: string): string {
  return NETWORK_MAP[network.toUpperCase()] ?? network;
}

function getCryptoCurrencyCode(fromCrypto: string): string {
  return CRYPTO_MAP[fromCrypto.toLowerCase()] ?? fromCrypto.toUpperCase();
}

function getFiatCode(toFiat: string): string {
  // The currencies need to be in uppercase
  return toFiat.toUpperCase();
}

export const getPriceFor = (
  fromCrypto: string,
  toFiat: string,
  amount: string,
  network?: string,
): Promise<AlchemyPayPrice> => {
  const DEFAULT_NETWORK = 'POLYGON';
  const networkCode = getAlchemyPayNetworkCode(network || DEFAULT_NETWORK);
  const side = 'SELL';

  return priceQuery(getCryptoCurrencyCode(fromCrypto), getFiatCode(toFiat), amount, networkCode, side);
};
