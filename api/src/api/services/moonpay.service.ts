import { config } from '../../config/vars';

const { priceProviders } = config;

export interface MoonpayPrice {
  cryptoPrice: number;
  cryptoAmount: number;
  fiatAmount: number;
  totalFee: number;
}

interface MoonpayResponse {
  baseCurrencyAmount: number;
  baseCurrencyPrice: number;
  quoteCurrencyAmount: number;
  feeAmount: number;
  message?: string;
  type?: string;
}

// See https://dev.moonpay.com/reference/getsellquote
async function priceQuery(
  currencyCode: string,
  quoteCurrencyCode: string,
  baseCurrencyAmount: string,
  extraFeePercentage: number,
  payoutMethod: string,
): Promise<MoonpayPrice> {
  const { baseUrl, apiKey } = priceProviders.moonpay;
  if (!apiKey) throw new Error('Moonpay API key not configured');

  const requestPath = `/v3/currencies/${currencyCode}/sell_quote`;
  const requestUrl = baseUrl + requestPath;
  const params = new URLSearchParams({
    apiKey,
    quoteCurrencyCode,
    baseCurrencyAmount,
    extraFeePercentage: extraFeePercentage.toString(),
  });
  if (payoutMethod) {
    params.append('payoutMethod', payoutMethod);
  }
  const paramsString = params.toString();
  const url = `${requestUrl}?${paramsString}`;

  const response = await fetch(url);
  if (!response.ok) {
    const body = (await response.json()) as MoonpayResponse;
    if (body.type === 'NotFoundError') {
      throw new Error('Token not supported');
    }
    throw new Error(`Could not get quote for ${currencyCode} to ${quoteCurrencyCode} from Moonpay: ${body.message}`);
  }
  const body = (await response.json()) as MoonpayResponse;
  const { baseCurrencyAmount: receivedBaseCurrencyAmount, baseCurrencyPrice, quoteCurrencyAmount, feeAmount } = body;

  if (Number(baseCurrencyAmount) !== receivedBaseCurrencyAmount) {
    throw new Error('Received baseCurrencyAmount does not match the requested baseCurrencyAmount');
  }

  return {
    cryptoPrice: baseCurrencyPrice,
    cryptoAmount: Number(baseCurrencyAmount),
    // The fiatAmount we receive from Moonpay already includes the fees
    fiatAmount: quoteCurrencyAmount,
    totalFee: feeAmount,
  };
}

function getCryptoCode(fromCrypto: string): string {
  // If fromCrypto is USDC, we need to convert it to USDC_Polygon
  if (
    fromCrypto.toLowerCase() === 'usdc' ||
    fromCrypto.toLowerCase() === 'usdc.e' ||
    fromCrypto.toLowerCase() === 'usdce'
  ) {
    return 'usdc_polygon';
  }
  if (fromCrypto.toLowerCase() === 'usdt') {
    return 'usdt';
  }

  return fromCrypto.toLowerCase();
}

function getFiatCode(toFiat: string): string {
  return toFiat.toLowerCase();
}

export const getPriceFor = (fromCrypto: string, toFiat: string, amount: string): Promise<MoonpayPrice> => {
  // We can specify a custom fee percentage here added on top of the Moonpay fee but we don't
  const extraFeePercentage = 0;
  // If the fiat currency is EUR we can use SEPA bank transfer, otherwise we assume credit_debit_card
  const paymentMethod = toFiat.toLowerCase() === 'eur' ? 'sepa_bank_transfer' : 'credit_debit_card';

  return priceQuery(getCryptoCode(fromCrypto), getFiatCode(toFiat), amount, extraFeePercentage, paymentMethod);
};
