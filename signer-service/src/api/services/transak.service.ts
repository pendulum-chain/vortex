import { config } from '../../config/vars';

const { quoteProviders } = config;

interface TransakQuoteResponse {
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

export interface TransakQuoteResult {
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
): Promise<TransakQuoteResult> {
  const { baseUrl, partnerApiKey } = quoteProviders.transak;
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

  const response = await fetch(url);
  if (!response.ok) {
    const body = (await response.json()) as TransakQuoteResponse;
    if (body.error?.message === 'Invalid fiat currency') {
      throw new Error('Token not supported');
    }
    throw new Error(
      `Could not get quote for ${cryptoCurrency} to ${fiatCurrency} from Transak: ${body.error?.message}`,
    );
  }

  const {
    response: { conversionPrice, cryptoAmount: resultCryptoAmount, fiatAmount, totalFee },
  } = (await response.json()) as TransakQuoteResponse;

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

export const getQuoteFor = (
  fromCrypto: SupportedCrypto,
  toFiat: string,
  amount: string | number,
  network?: string,
): Promise<TransakQuoteResult> => {
  const DEFAULT_NETWORK = 'POLYGON';
  const networkCode = getTransakNetworkCode(network || DEFAULT_NETWORK);
  const side: Side = 'SELL'; // We always sell our crypto for fiat

  return priceQuery(getCryptoCode(fromCrypto), getFiatCode(toFiat), Number(amount), networkCode, side);
};
