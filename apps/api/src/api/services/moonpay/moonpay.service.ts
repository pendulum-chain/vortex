import { FiatToken, MoonpayPriceResponse, RampDirection } from "@vortexfi/shared";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import {
  InvalidAmountError,
  InvalidParameterError,
  ProviderInternalError,
  UnsupportedPairError
} from "../../errors/providerErrors";
import { fetchProviderJson } from "../../helpers/fetchProviderJson";

interface MoonpayResponse {
  baseCurrencyAmount: number;
  baseCurrencyPrice: number;
  quoteCurrencyAmount: number;
  feeAmount: number;
  message?: string;
  type?: string;
  baseCurrency: {
    minAmount: number;
    code: string;
  };
}

const PAYMENT_METHODS = {
  CREDIT_CARD: "credit_debit_card",
  PIX: "pix_instant_payment",
  SEPA: "sepa_bank_transfer"
} as const;

/** Always throws: classifies a non-2xx response. */
function handleMoonpayError(response: Response, body: Pick<MoonpayResponse, "message" | "type">): never {
  const errorMessage = body?.message || `HTTP error ${response.status}: ${response.statusText}`;
  const errorType = body?.type;

  logger.error(`Moonpay API Error (${response.status}): Type: ${errorType}, Message: ${errorMessage}`);

  const lowerErrorMessage = errorMessage.toLowerCase();
  if (errorType === "NotFoundError" || lowerErrorMessage.includes("unsupported")) {
    throw new UnsupportedPairError(`Moonpay: ${errorMessage}`);
  }
  if (/minimum|maximum|limit/.test(lowerErrorMessage)) {
    throw new InvalidAmountError(`Moonpay: ${errorMessage}`);
  }
  if (errorType === "BadRequestError" || response.status === 400) {
    throw new InvalidParameterError(`Moonpay: ${errorMessage}`);
  }
  if (response.status >= 500) {
    throw new ProviderInternalError(`Moonpay server error: ${errorMessage}`);
  }
  throw new InvalidParameterError(`Moonpay API error: ${errorMessage}`);
}

/**
 * Get price information from Moonpay
 *  https://dev.moonpay.com/reference/getbuyquote
 *  https://dev.moonpay.com/reference/getsellquote
 * @param sourceCurrency The source currency (crypto for offramp, fiat for onramp)
 * @param targetCurrency The target currency (fiat for offramp, crypto for onramp)
 * @param amount The amount to convert
 * @param direction The direction of the conversion (onramp or offramp)
 */
export async function getPriceFor(
  sourceCurrency: string,
  targetCurrency: string,
  amount: string,
  direction: RampDirection
): Promise<MoonpayPriceResponse> {
  const isBuy = direction === RampDirection.BUY;
  const cryptoCode = (isBuy ? targetCurrency : sourceCurrency).toLowerCase();
  const fiatCode = (isBuy ? sourceCurrency : targetCurrency).toLowerCase();
  // Moonpay lists USDC on Polygon as its own currency
  const moonpayCrypto = ["usdc", "usdc.e", "usdce"].includes(cryptoCode) ? "usdc_polygon" : cryptoCode;

  const { baseUrl, apiKey } = config.priceProviders.moonpay;
  if (!apiKey) throw new Error("Moonpay API key not configured");

  // We can specify a custom fee percentage on top of the Moonpay fee for SELL quotes but we don't
  const params = isBuy
    ? new URLSearchParams({
        apiKey,
        baseCurrencyAmount: amount,
        baseCurrencyCode: fiatCode,
        paymentMethod: fiatCode === "brl" ? PAYMENT_METHODS.PIX : PAYMENT_METHODS.CREDIT_CARD
      })
    : new URLSearchParams({
        apiKey,
        baseCurrencyAmount: amount,
        extraFeePercentage: "0",
        payoutMethod: fiatCode.toUpperCase() === FiatToken.EURC ? PAYMENT_METHODS.SEPA : PAYMENT_METHODS.CREDIT_CARD,
        quoteCurrencyCode: fiatCode
      });
  const url = `${baseUrl}/v3/currencies/${moonpayCrypto}/${isBuy ? "buy" : "sell"}_quote?${params}`;

  const { response, body } = await fetchProviderJson<MoonpayResponse>("Moonpay", url, undefined, error =>
    error instanceof TypeError
      ? `Network error fetching price from Moonpay: ${error.message}`
      : `Failed to parse response from Moonpay (Status: ${(error as { response?: Response }).response?.status}): ${(error as { response?: Response }).response?.statusText}`
  );

  if (!response.ok) {
    return handleMoonpayError(response, body);
  }

  if (body.baseCurrencyAmount === undefined || body.quoteCurrencyAmount === undefined || body.feeAmount === undefined) {
    throw new ProviderInternalError("Moonpay response missing essential data fields");
  }

  const {
    baseCurrencyAmount: receivedBaseCurrencyAmount,
    quoteCurrencyAmount,
    feeAmount,
    baseCurrency: { minAmount, code }
  } = body;

  if (minAmount > Number(amount)) {
    throw new InvalidAmountError(`Moonpay: ${minAmount} ${code} is the minimum amount for this pair`);
  }

  if (Number(amount) !== receivedBaseCurrencyAmount) {
    logger.warn(`Moonpay Warning: Requested base amount ${amount} differs from received ${receivedBaseCurrencyAmount}`);
    throw new ProviderInternalError(
      `Moonpay response discrepancy: Requested base amount ${amount}, received ${receivedBaseCurrencyAmount}`
    );
  }

  return {
    direction,
    provider: "moonpay",
    quoteAmount: quoteCurrencyAmount,
    requestedAmount: Number(amount),
    totalFee: feeAmount
  };
}
