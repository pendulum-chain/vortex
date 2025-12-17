import { DestinationType, OnChainToken } from "@packages/shared";
import { Currency, EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { QuoteService } from "../quote";

/**
 * Query Vortex (internal quote service) for price quotes
 * @param sourceCurrency The source currency (crypto for offramp, fiat for onramp)
 * @param targetCurrency The target currency (fiat for offramp, crypto for onramp)
 * @param amount The amount to convert
 * @param direction The direction of the conversion (onramp or offramp)
 * @param network Optional network name
 * @returns Vortex price information
 */
export async function getPriceFor(
  sourceCurrency: Currency,
  targetCurrency: Currency,
  amount: string,
  direction: RampDirection,
  network?: Networks
) {
  // We hardcoded onramps only for now
  const sanitizedSourceCurrency = sourceCurrency.toUpperCase() as OnChainToken;
  const sanitizedTargetCurrency = targetCurrency.toUpperCase() as FiatToken;
  const quoteService = new QuoteService();

  const isBRL = sanitizedTargetCurrency === FiatToken.BRL;

  const quote = await quoteService.createQuote({
    from: isBRL ? ("pix" as DestinationType) : ("sepa" as DestinationType),
    inputAmount: amount,
    inputCurrency: sanitizedSourceCurrency,
    network: network || Networks.Base,
    outputCurrency: sanitizedTargetCurrency,
    rampType: direction,
    to: network || Networks.Base
  });

  // Convert quote response to price response format
  const requestedAmount = new Big(amount).toNumber();
  const quoteAmount = new Big(quote.outputAmount).toNumber();

  // Calculate total fee from quote flattened fee structure
  const totalFee = new Big(quote.totalFeeFiat).toNumber();

  return {
    direction,
    provider: "vortex" as const,
    quoteAmount,
    requestedAmount,
    totalFee
  };
}
