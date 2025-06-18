import { Direction, TransakPriceResponse } from "@packages/shared";
import {
  InvalidAmountError,
  InvalidParameterError,
  ProviderInternalError,
  UnsupportedPairError
} from "../../errors/providerErrors";

/**
 * Transak API response interface
 */
export interface TransakApiResponse {
  response?: {
    conversionPrice: number;
    cryptoAmount: number;
    fiatAmount: number;
    totalFee: number;
    fiatCurrency?: string;
    cryptoCurrency?: string;
  };
  error?: {
    message: string;
  };
}

/**
 * Handle Transak API errors
 * @param response The HTTP response
 * @param body The response body
 * @returns Never returns, always throws an appropriate error
 */
function handleTransakError(response: Response, body: TransakApiResponse): never {
  const errorMessage = body?.error?.message || `HTTP error ${response.status}: ${response.statusText}`;

  console.error(`Transak API Error (${response.status}): ${errorMessage}`);

  const lowerErrorMessage = errorMessage.toLowerCase();

  // Classify errors based on message content
  if (
    lowerErrorMessage.includes("invalid fiat currency") ||
    lowerErrorMessage.includes("unsupported") ||
    lowerErrorMessage.includes("not available") ||
    lowerErrorMessage.includes("invalid crypto currency") ||
    lowerErrorMessage.includes("invalid network")
  ) {
    throw new UnsupportedPairError(`Transak: ${errorMessage}`);
  }

  if (
    lowerErrorMessage.includes("minimum") ||
    lowerErrorMessage.includes("maximum") ||
    lowerErrorMessage.includes("limit") ||
    lowerErrorMessage.includes("exceeds")
  ) {
    throw new InvalidAmountError(`Transak: ${errorMessage}`);
  }

  if (response.status === 400 || lowerErrorMessage.includes("invalid parameter")) {
    throw new InvalidParameterError(`Transak: ${errorMessage}`);
  }

  if (response.status >= 500) {
    throw new ProviderInternalError(`Transak server error: ${errorMessage}`);
  }

  // Default to InvalidParameterError for other 4xx or unexpected errors
  throw new InvalidParameterError(`Transak API error: ${errorMessage}`);
}

/**
 * Validate and transform Transak API response
 * @param body The response body
 * @param requestedAmount The amount that was requested
 * @param direction The direction of the conversion (onramp or offramp)
 * @returns Standardized price response
 */
function validateTransakResponse(
  body: TransakApiResponse,
  requestedAmount: string,
  direction: Direction
): TransakPriceResponse {
  if (
    !body.response ||
    body.response.conversionPrice === undefined ||
    body.response.cryptoAmount === undefined ||
    body.response.fiatAmount === undefined ||
    body.response.totalFee === undefined
  ) {
    throw new ProviderInternalError("Transak response missing essential data fields");
  }

  const {
    response: { cryptoAmount, fiatAmount, totalFee }
  } = body;

  const isBuy = direction === "onramp";

  return {
    direction,
    provider: "transak",
    quoteAmount: isBuy ? cryptoAmount : fiatAmount,
    requestedAmount: Number(requestedAmount),
    totalFee
  };
}

/**
 * Process Transak API response
 * @param response The HTTP response
 * @param body The response body
 * @param requestedAmount The amount that was requested
 * @param direction The direction of the conversion (onramp or offramp)
 * @returns Standardized price response
 */
export function processTransakResponse(
  response: Response,
  body: TransakApiResponse,
  requestedAmount: string,
  direction: Direction
): TransakPriceResponse {
  if (!response.ok || body.error) {
    return handleTransakError(response, body);
  }

  return validateTransakResponse(body, requestedAmount, direction);
}
