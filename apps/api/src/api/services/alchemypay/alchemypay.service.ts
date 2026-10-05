import { createHmac } from "node:crypto";
import { AlchemyPayPriceResponse, RampDirection } from "@vortexfi/shared";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import {
  InvalidAmountError,
  InvalidParameterError,
  ProviderInternalError,
  UnsupportedPairError
} from "../../errors/providerErrors";
import { fetchProviderJson } from "../../helpers/fetchProviderJson";

interface AlchemyPayResponse {
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

const QUOTE_PATH = "/open/api/v4/merchant/order/quote";
const DEBIT_CARD_PAY_WAY_CODE = "10001";
const DEFAULT_NETWORK = "POLYGON";

const NETWORK_MAP: Record<string, string> = {
  ARBITRUM: "ARBITRUM",
  AVALANCHE: "AVAX",
  BSC: "BSC",
  ETHEREUM: "ETH",
  POLYGON: "MATIC"
};

/**
 * Builds the signed quote request. AlchemyPay's signature is
 * base64(HMAC-SHA256(timestamp + METHOD + path + JSON body with empty values dropped and keys sorted)).
 */
function createQuoteRequest(direction: RampDirection, crypto: string, fiat: string, amount: string, network: string) {
  const { secretKey, baseUrl, appId } = config.priceProviders.alchemyPay;
  if (!secretKey || !appId) throw new Error("AlchemyPay configuration missing");

  const isBuy = direction === RampDirection.BUY;
  const requestUrl = baseUrl + QUOTE_PATH;
  const timestamp = String(Date.now());

  const requestBody: Record<string, string> = {
    amount,
    crypto,
    fiat,
    network,
    ...(isBuy ? { payWayCode: DEBIT_CARD_PAY_WAY_CODE } : {}),
    side: isBuy ? "BUY" : "SELL"
  };
  const body = JSON.stringify(
    Object.fromEntries(
      Object.entries(requestBody)
        .filter(([, value]) => value !== "")
        .sort(([aKey], [bKey]) => aKey.localeCompare(bKey))
    )
  );

  const sign = createHmac("sha256", secretKey.trim())
    .update(`${timestamp}POST${new URL(requestUrl).pathname}${body}`)
    .digest("base64");

  return {
    request: { body, headers: { appId, "Content-Type": "application/json", sign, timestamp }, method: "POST" },
    requestUrl
  };
}

/** Always throws: classifies a non-2xx response. */
function handleHttpError(response: Response, body: AlchemyPayResponse): never {
  const errorMessage = body?.returnMsg || `HTTP error ${response.status}: ${response.statusText}`;
  logger.error(`AlchemyPay API Error (${response.status}): ${errorMessage}`);

  if (response.status >= 500) {
    throw new ProviderInternalError(`AlchemyPay server error: ${errorMessage}`);
  }
  if (response.status >= 400) {
    const lowerErrorMessage = errorMessage.toLowerCase();
    if (/minimum|maximum/.test(lowerErrorMessage)) {
      throw new InvalidAmountError(`AlchemyPay: ${errorMessage}`);
    }
    if (/unsupported|invalid currency/.test(lowerErrorMessage)) {
      throw new UnsupportedPairError(`AlchemyPay: ${errorMessage}`);
    }
    throw new InvalidParameterError(`AlchemyPay API error: ${errorMessage}`);
  }
  throw new ProviderInternalError(`Unexpected HTTP status ${response.status} from AlchemyPay: ${errorMessage}`);
}

/** Always throws: classifies a 2xx response with success=false. */
function handleLogicError(body: AlchemyPayResponse): never {
  const errorMessage = body.returnMsg || "AlchemyPay API returned success=false with no message";
  logger.error(`AlchemyPay API Logic Error: ${errorMessage}`);

  const lowerErrorMessage = errorMessage.toLowerCase();
  if (/minimum|maximum/.test(lowerErrorMessage)) {
    throw new InvalidAmountError(`AlchemyPay: ${errorMessage}`);
  }
  if (/unsupported|invalid currency/.test(lowerErrorMessage)) {
    throw new UnsupportedPairError(`AlchemyPay: ${errorMessage}`);
  }
  if (lowerErrorMessage.includes("invalid parameter")) {
    throw new InvalidParameterError(`AlchemyPay: ${errorMessage}`);
  }
  throw new ProviderInternalError(`AlchemyPay API logic error: ${errorMessage}`);
}

/**
 * Get price information from AlchemyPay
 * @param sourceCurrency The source currency (crypto for offramp, fiat for onramp)
 * @param targetCurrency The target currency (fiat for offramp, crypto for onramp)
 * @param amount The amount to convert
 * @param direction The direction of the conversion (onramp or offramp)
 * @param network Optional network name
 */
export async function getPriceFor(
  sourceCurrency: string,
  targetCurrency: string,
  amount: string | number,
  direction: RampDirection,
  network?: string
): Promise<AlchemyPayPriceResponse> {
  const requestedNetwork = network || DEFAULT_NETWORK;
  const networkCode = NETWORK_MAP[requestedNetwork.toUpperCase()] ?? requestedNetwork;

  // For offramp: source is crypto, target is fiat. For onramp: source is fiat, target is crypto.
  const isBuy = direction === RampDirection.BUY;
  const requestedAmount = amount.toString();

  const { requestUrl, request } = createQuoteRequest(
    direction,
    (isBuy ? targetCurrency : sourceCurrency).toUpperCase(),
    (isBuy ? sourceCurrency : targetCurrency).toUpperCase(),
    requestedAmount,
    networkCode
  );
  const { response, body } = await fetchProviderJson<AlchemyPayResponse>("AlchemyPay", requestUrl, request);

  if (!response.ok) {
    return handleHttpError(response, body);
  }
  if (!body.success) {
    return handleLogicError(body);
  }
  if (!body.data) {
    throw new ProviderInternalError("AlchemyPay API returned success=true but no data field");
  }

  const { rampFee, networkFee, fiatQuantity, cryptoQuantity } = body.data;
  const totalFee = (Number(rampFee) || 0) + (Number(networkFee) || 0);
  return {
    direction,
    provider: "alchemypay",
    // `fiatQuantity` does not include the fees (per the response sample), so they are subtracted for SELL.
    quoteAmount: isBuy ? Number(cryptoQuantity) : Math.max(0, (Number(fiatQuantity) || 0) - totalFee),
    requestedAmount: Number(requestedAmount),
    totalFee
  };
}
