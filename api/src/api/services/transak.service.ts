import { config } from '../../config/vars';
import {
  InvalidAmountError,
  InvalidParameterError,
  ProviderInternalError,
  UnsupportedPairError,
} from '../errors/providerErrors';

const { priceProviders } = config;

interface TransakPriceResponse {
  response: {
    conversionPrice: number;
    cryptoAmount: number;
    fiatAmount: number;
    totalFee: number;
  };
  error?: {
    message: string;
  };
}

export interface TransakPriceResult {
  cryptoPrice: number;
  cryptoAmount: number;
  fiatAmount: number;
  totalFee: number;
}

type Network = 'POLYGON' | string;
type Side = 'BUY' | 'SELL';

// See https://docs.transak.com/reference/get-price
async function priceQuery(
  cryptoCurrency: string,
  fiatCurrency: string,
  cryptoAmount: number,
  network: Network,
  isBuyOrSell: Side,
  paymentMethod?: string,
): Promise<TransakPriceResult> {
  const { baseUrl, partnerApiKey } = priceProviders.transak;
  const requestPath = '/api/v1/pricing/public/quotes';
  const requestUrl = `${baseUrl}${requestPath}`;

  if (!partnerApiKey) {
    throw new Error('Transak partner API key is not defined');
  }

  const params = new URLSearchParams({
    partnerApiKey,
    cryptoCurrency,
    fiatCurrency,
    cryptoAmount: cryptoAmount.toString(),
    network,
    isBuyOrSell,
  });

  if (paymentMethod) {
    params.append('paymentMethod', paymentMethod);
  }

  const url = `${requestUrl}?${params.toString()}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (fetchError) {
    console.error('Transak fetch error:', fetchError);
    throw new ProviderInternalError(`Network error fetching price from Transak: ${(fetchError as Error).message}`);
  }

  let body: TransakPriceResponse;
  try {
    // We need the body content even for errors
    body = (await response.json()) as TransakPriceResponse;
  } catch (jsonError) {
    console.error('Transak JSON parse error:', jsonError);
    // If we can't parse the JSON, it's likely an unexpected response format or server issue
    throw new ProviderInternalError(
      `Failed to parse response from Transak (Status: ${response.status}): ${response.statusText}`,
    );
  }

  if (!response.ok || body.error) {
    const errorMessage = body?.error?.message || `HTTP error ${response.status}: ${response.statusText}`;
    console.error(`Transak API Error (${response.status}): ${errorMessage}`);

    const lowerErrorMessage = errorMessage.toLowerCase();
    if (
      lowerErrorMessage.includes('invalid fiat currency') ||
      lowerErrorMessage.includes('unsupported') ||
      lowerErrorMessage.includes('not available') ||
      lowerErrorMessage.includes('invalid crypto currency') || // Treat invalid crypto as unsupported pair
      lowerErrorMessage.includes('invalid network') // Treat invalid network as unsupported pair
    ) {
      throw new UnsupportedPairError(`Transak: ${errorMessage}`);
    }
    if (
      lowerErrorMessage.includes('minimum') ||
      lowerErrorMessage.includes('maximum') ||
      lowerErrorMessage.includes('limit') ||
      lowerErrorMessage.includes('exceeds')
    ) {
      throw new InvalidAmountError(`Transak: ${errorMessage}`);
    }
    if (response.status === 400 || lowerErrorMessage.includes('invalid parameter')) {
      throw new InvalidParameterError(`Transak: ${errorMessage}`);
    }
    if (response.status >= 500) {
      throw new ProviderInternalError(`Transak server error: ${errorMessage}`);
    }
    // Default to InvalidParameterError for other 4xx or unexpected errors
    throw new InvalidParameterError(`Transak API error: ${errorMessage}`);
  }

  if (
    !body.response ||
    body.response.conversionPrice === undefined ||
    body.response.cryptoAmount === undefined ||
    body.response.fiatAmount === undefined ||
    body.response.totalFee === undefined
  ) {
    throw new ProviderInternalError('Transak response missing essential data fields');
  }

  const {
    response: { conversionPrice, cryptoAmount: resultCryptoAmount, fiatAmount, totalFee },
  } = body;

  return {
    cryptoPrice: conversionPrice,
    cryptoAmount: resultCryptoAmount,
    // The fiatAmount we receive from Transak already includes the fees
    fiatAmount,
    totalFee,
  };
}

type SupportedCrypto = 'USDC' | 'USDC.E' | 'USDCE' | 'USDT' | string;

function getTransakNetworkCode(network: string): Network {
  return network.toLowerCase();
}

function getCryptoCode(fromCrypto: SupportedCrypto): string {
  const normalizedCrypto = fromCrypto.toLowerCase();
  if (['usdc', 'usdc.e', 'usdce'].includes(normalizedCrypto)) {
    return 'USDC';
  }
  if (normalizedCrypto === 'usdt') {
    return 'USDT';
  }
  return fromCrypto.toUpperCase();
}

function getFiatCode(toFiat: string): string {
  return toFiat.toUpperCase();
}

export const getPriceFor = (
  fromCrypto: SupportedCrypto,
  toFiat: string,
  amount: string | number,
  network?: string,
): Promise<TransakPriceResult> => {
  const DEFAULT_NETWORK = 'POLYGON';
  const networkCode = getTransakNetworkCode(network || DEFAULT_NETWORK);
  const side: Side = 'SELL'; // We always sell our crypto for fiat

  return priceQuery(getCryptoCode(fromCrypto), getFiatCode(toFiat), Number(amount), networkCode, side);
};
