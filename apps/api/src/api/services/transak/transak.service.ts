import { Networks, RampDirection, TransakPriceResponse } from "@vortexfi/shared";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import {
  InvalidAmountError,
  InvalidParameterError,
  ProviderInternalError,
  UnsupportedPairError
} from "../../errors/providerErrors";
import { fetchProviderJson } from "../../helpers/fetchProviderJson";

interface TransakApiResponse {
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

const QUOTE_PATH = "/api/v1/pricing/public/quotes";
const DEFAULT_NETWORK = "polygon";

/** Always throws: classifies a non-2xx response or an error object in the body. */
function handleTransakError(response: Response, body: TransakApiResponse): never {
  const errorMessage = body?.error?.message || `HTTP error ${response.status}: ${response.statusText}`;

  logger.error(`Transak API Error (${response.status}): ${errorMessage}`);

  const lowerErrorMessage = errorMessage.toLowerCase();

  if (/invalid fiat currency|unsupported|not available|invalid crypto currency|invalid network/.test(lowerErrorMessage)) {
    throw new UnsupportedPairError(`Transak: ${errorMessage}`);
  }
  if (/minimum|maximum|limit|exceeds/.test(lowerErrorMessage)) {
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
 * Get price information from Transak
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
  network?: Networks
): Promise<TransakPriceResponse> {
  const isBuy = direction === RampDirection.BUY;
  const networkCode = network?.toLowerCase() || DEFAULT_NETWORK;
  // For offramp: source is crypto, target is fiat. For onramp: source is fiat, target is crypto.
  const cryptoCode = (isBuy ? targetCurrency : sourceCurrency).toUpperCase();
  const fiatCode = (isBuy ? sourceCurrency : targetCurrency).toUpperCase();
  // Transak lists the bridged USDC.e as plain USDC
  const transakCrypto = ["USDC.E", "USDCE"].includes(cryptoCode) ? "USDC" : cryptoCode;
  const requestedAmount = amount.toString();

  const { baseUrl, partnerApiKey } = config.priceProviders.transak;
  if (!partnerApiKey) {
    throw new Error("Transak partner API key is not defined");
  }

  const params = new URLSearchParams(
    isBuy
      ? {
          cryptoCurrency: transakCrypto,
          fiatAmount: requestedAmount,
          fiatCurrency: fiatCode,
          isBuyOrSell: "BUY",
          network: networkCode,
          partnerApiKey,
          paymentMethod: "credit_debit_card"
        }
      : {
          cryptoAmount: requestedAmount,
          cryptoCurrency: transakCrypto,
          fiatCurrency: fiatCode,
          isBuyOrSell: "SELL",
          network: networkCode,
          partnerApiKey
        }
  );

  const { response, body } = await fetchProviderJson<TransakApiResponse>("Transak", `${baseUrl}${QUOTE_PATH}?${params}`);

  if (!response.ok || body.error) {
    return handleTransakError(response, body);
  }

  if (
    !body.response ||
    body.response.conversionPrice === undefined ||
    body.response.cryptoAmount === undefined ||
    body.response.fiatAmount === undefined ||
    body.response.totalFee === undefined
  ) {
    throw new ProviderInternalError("Transak response missing essential data fields");
  }

  const { cryptoAmount, fiatAmount, totalFee } = body.response;
  return {
    direction,
    provider: "transak",
    quoteAmount: isBuy ? cryptoAmount : fiatAmount,
    requestedAmount: Number(requestedAmount),
    totalFee
  };
}
