import { PriceEndpoints } from 'shared';
import {
  InvalidAmountError,
  InvalidParameterError,
  ProviderInternalError,
  UnsupportedPairError,
} from '../../errors/providerErrors';
import { MoonpayResponse } from './moonpay.service';

type MoonpayErrorResponse = {
  message?: string;
  type?: string;
};

function handleMoonpayError(response: Response, body: MoonpayErrorResponse): never {
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

function validateMoonpayResponse(
  body: MoonpayResponse,
  requestedAmount: string,
  direction: PriceEndpoints.Direction,
): PriceEndpoints.MoonpayPriceResponse {
  if (body.baseCurrencyAmount === undefined || body.quoteCurrencyAmount === undefined || body.feeAmount === undefined) {
    throw new ProviderInternalError('Moonpay response missing essential data fields');
  }

  const {
    baseCurrencyAmount: receivedBaseCurrencyAmount,
    quoteCurrencyAmount,
    feeAmount,
    baseCurrency: { minAmount, code },
  } = body;

  if (minAmount > Number(requestedAmount)) {
    throw new InvalidAmountError(`Moonpay: ${minAmount} ${code} is the minimum amount for this pair`);
  }

  if (Number(requestedAmount) !== receivedBaseCurrencyAmount) {
    console.warn(
      `Moonpay Warning: Requested base amount ${requestedAmount} differs from received ${receivedBaseCurrencyAmount}`,
    );
    throw new ProviderInternalError(
      `Moonpay response discrepancy: Requested base amount ${requestedAmount}, received ${receivedBaseCurrencyAmount}`,
    );
  }

  return {
    requestedAmount: Number(requestedAmount),
    quoteAmount: quoteCurrencyAmount,
    totalFee: feeAmount,
    direction,
    provider: 'moonpay',
  };
}

export async function processMoonpayResponse(
  response: Response,
  body: MoonpayResponse,
  requestedAmount: string,
  direction: PriceEndpoints.Direction,
): Promise<PriceEndpoints.MoonpayPriceResponse> {
  if (!response.ok) {
    return handleMoonpayError(response, body);
  }

  return validateMoonpayResponse(body, requestedAmount, direction);
}
