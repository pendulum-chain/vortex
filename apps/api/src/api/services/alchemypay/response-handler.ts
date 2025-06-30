import { AlchemyPayPriceResponse, Direction } from "@packages/shared";
import {
  InvalidAmountError,
  InvalidParameterError,
  ProviderInternalError,
  UnsupportedPairError
} from "../../errors/providerErrors";

export interface AlchemyPayResponse {
  success: boolean;
  returnMsg?: string;
  data?: {
    cryptoPrice: string;
    rampFee: string;
    networkFee: string;
    fiatQuantity: string;
    cryptoQuantity: string;
  };
}

/**
 * Handle HTTP errors from AlchemyPay
 * @param response The HTTP response
 * @param body The response body
 * @returns Never returns, always throws an appropriate error
 */
function handleHttpError(response: Response, body: AlchemyPayResponse): never {
  const errorMessage = body?.returnMsg || `HTTP error ${response.status}: ${response.statusText}`;
  console.error(`AlchemyPay API Error (${response.status}): ${errorMessage}`);

  if (response.status >= 500) {
    throw new ProviderInternalError(`AlchemyPay server error: ${errorMessage}`);
  } else if (response.status >= 400) {
    // Try to map 4xx errors based on message
    const lowerErrorMessage = errorMessage.toLowerCase();
    if (lowerErrorMessage.includes("minimum") || lowerErrorMessage.includes("maximum")) {
      throw new InvalidAmountError(`AlchemyPay: ${errorMessage}`);
    }
    if (lowerErrorMessage.includes("unsupported") || lowerErrorMessage.includes("invalid currency")) {
      throw new UnsupportedPairError(`AlchemyPay: ${errorMessage}`);
    }
    // Default 4xx to InvalidParameterError
    throw new InvalidParameterError(`AlchemyPay API error: ${errorMessage}`);
  } else {
    // Other non-2xx errors
    throw new ProviderInternalError(`Unexpected HTTP status ${response.status} from AlchemyPay: ${errorMessage}`);
  }
}

/**
 * Handle logic errors from AlchemyPay (success=false)
 * @param body The response body
 * @returns Never returns, always throws an appropriate error
 */
function handleLogicError(body: AlchemyPayResponse): never {
  const errorMessage = body.returnMsg || "AlchemyPay API returned success=false with no message";
  console.error(`AlchemyPay API Logic Error: ${errorMessage}`);

  // Analyze returnMsg for specific errors
  const lowerErrorMessage = errorMessage.toLowerCase();
  if (lowerErrorMessage.includes("minimum") || lowerErrorMessage.includes("maximum")) {
    throw new InvalidAmountError(`AlchemyPay: ${errorMessage}`);
  }
  if (lowerErrorMessage.includes("unsupported") || lowerErrorMessage.includes("invalid currency")) {
    throw new UnsupportedPairError(`AlchemyPay: ${errorMessage}`);
  }
  if (lowerErrorMessage.includes("invalid parameter")) {
    throw new InvalidParameterError(`AlchemyPay: ${errorMessage}`);
  }
  throw new ProviderInternalError(`AlchemyPay API logic error: ${errorMessage}`);
}

/**
 * Parse successful response from AlchemyPay
 * @param data The response data
 * @param requestedAmount The amount that was requested
 * @param direction The direction of the conversion (onramp or offramp)
 * @returns Standardized price response
 */
function parseSuccessResponse(
  data: AlchemyPayResponse["data"],
  requestedAmount: string,
  direction: Direction
): AlchemyPayPriceResponse {
  if (!data) {
    throw new ProviderInternalError("AlchemyPay response data is undefined");
  }

  const { rampFee, networkFee, fiatQuantity, cryptoQuantity } = data;

  const totalFee = (Number(rampFee) || 0) + (Number(networkFee) || 0);
  // According to a comment in the response sample, the `fiatQuantity` does not yet include the fees
  // so we need to subtract them.
  const fiatAmount = direction === "onramp" ? Number(requestedAmount) : Math.max(0, (Number(fiatQuantity) || 0) - totalFee);
  const cryptoAmount = direction === "onramp" ? Number(cryptoQuantity) : Number(requestedAmount);

  return {
    direction,
    provider: "alchemypay",
    quoteAmount: direction === "onramp" ? cryptoAmount : fiatAmount,
    requestedAmount: Number(requestedAmount),
    totalFee
  };
}

/**
 * Process AlchemyPay API response
 * @param response The HTTP response
 * @param body The response body
 * @param requestedAmount The amount that was requested
 * @param direction The direction of the conversion (onramp or offramp)
 * @returns Standardized price response
 */
export function processAlchemyPayResponse(
  response: Response,
  body: AlchemyPayResponse,
  requestedAmount: string,
  direction: Direction
): AlchemyPayPriceResponse {
  if (!response.ok) {
    // Handle HTTP errors (4xx, 5xx)
    return handleHttpError(response, body);
  }

  // Handle cases where response is ok (2xx) but success flag is false
  if (!body.success) {
    return handleLogicError(body);
  }

  if (!body.data) {
    throw new ProviderInternalError("AlchemyPay API returned success=true but no data field");
  }

  return parseSuccessResponse(body.data, requestedAmount, direction);
}
