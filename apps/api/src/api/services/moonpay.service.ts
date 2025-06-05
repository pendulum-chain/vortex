import { config } from '../../config/vars';
import {
  InvalidAmountError,
  InvalidParameterError,
  ProviderInternalError,
  UnsupportedPairError,
} from '../errors/providerErrors';

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

  let response: Response;
  try {
    response = await fetch(url);
  } catch (fetchError) {
    console.error('Moonpay fetch error:', fetchError);
    throw new ProviderInternalError(`Network error fetching price from Moonpay: ${(fetchError as Error).message}`);
  }

  let body: MoonpayResponse;
  try {
    // We need the body content even for errors
    body = (await response.json()) as MoonpayResponse;
  } catch (jsonError) {
    console.error('Moonpay JSON parse error:', jsonError);
    // If we can't parse the JSON, it's likely an unexpected response format or server issue
    throw new ProviderInternalError(
      `Failed to parse response from Moonpay (Status: ${response.status}): ${response.statusText}`,
    );
  }

  if (!response.ok) {
    const errorMessage = body?.message || `HTTP error ${response.status}: ${response.statusText}`;
    const errorType = body?.type;
    console.error(`Moonpay API Error (${response.status}): Type: ${errorType}, Message: ${errorMessage}`);

    if (errorType === 'NotFoundError' || errorMessage.toLowerCase().includes('unsupported')) {
      throw new UnsupportedPairError(`Moonpay: ${errorMessage}`);
    }
    if (
      errorMessage.toLowerCase().includes('minimum') ||
      errorMessage.toLowerCase().includes('maximum') ||
      errorMessage.toLowerCase().includes('limit')
    ) {
      throw new InvalidAmountError(`Moonpay: ${errorMessage}`);
    }
    if (errorType === 'BadRequestError' || response.status === 400) {
      throw new InvalidParameterError(`Moonpay: ${errorMessage}`);
    }
    if (response.status >= 500) {
      throw new ProviderInternalError(`Moonpay server error: ${errorMessage}`);
    }
    throw new InvalidParameterError(`Moonpay API error: ${errorMessage}`);
  }

  if (
    body.baseCurrencyAmount === undefined ||
    body.baseCurrencyPrice === undefined ||
    body.quoteCurrencyAmount === undefined ||
    body.feeAmount === undefined
  ) {
    throw new ProviderInternalError('Moonpay response missing essential data fields');
  }

  const { baseCurrencyAmount: receivedBaseCurrencyAmount, baseCurrencyPrice, quoteCurrencyAmount, feeAmount } = body;

  // This check might indicate an issue on Moonpay's side or our request logic
  if (Number(baseCurrencyAmount) !== receivedBaseCurrencyAmount) {
    console.warn(
      `Moonpay Warning: Requested base amount ${baseCurrencyAmount} differs from received ${receivedBaseCurrencyAmount}`,
    );
    throw new ProviderInternalError(
      `Moonpay response discrepancy: Requested base amount ${baseCurrencyAmount}, received ${receivedBaseCurrencyAmount}`,
    );
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
