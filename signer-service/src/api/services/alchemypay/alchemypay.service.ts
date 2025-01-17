import crypto from 'node:crypto';
import { config } from '../../../config/vars';
import { removeEmptyKeys, sortObject } from './helpers';

const { quoteProviders } = config;

interface AlchemyPayQuote {
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
  } else {
    const sortedParams = [...params].sort(([aKey], [bKey]) => aKey.localeCompare(bKey));
    const queryString = sortedParams.map(([key, value]) => `${key}=${value}`).join('&');
    return `${path}?${queryString}`;
  }
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
): Promise<AlchemyPayQuote> {
  const { secretKey, baseUrl, appId } = quoteProviders.alchemyPay;
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

  const response = await fetch(requestUrl, request);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const body = (await response.json()) as AlchemyPayResponse;
  if (!body.success) {
    throw new Error(
      `Could not get quote for ${crypto} to ${fiat} from AlchemyPay: ` + body.returnMsg || 'Unknown error',
    );
  }

  const { cryptoPrice, rampFee, networkFee, fiatQuantity } = body.data;

  const totalFee = (Number(rampFee) || 0) + (Number(networkFee) || 0);
  // According to a comment in the response sample [here](https://alchemypay.readme.io/docs/price-query#response-sample)
  // the `fiatQuantity` does not yet include the fees so we need to subtract them.
  const fiatAmount = Number(fiatQuantity) - totalFee;

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

export const getQuoteFor = (
  fromCrypto: string,
  toFiat: string,
  amount: string,
  network?: string,
): Promise<AlchemyPayQuote> => {
  const DEFAULT_NETWORK = 'POLYGON';
  const networkCode = getAlchemyPayNetworkCode(network || DEFAULT_NETWORK);
  const side = 'SELL';

  return priceQuery(getCryptoCurrencyCode(fromCrypto), getFiatCode(toFiat), amount, networkCode, side);
};
