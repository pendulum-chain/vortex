import {
  type AccountMeta,
  getAnyFiatTokenDetails,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  isFiatToken,
  isOnChainToken
} from "@vortexfi/shared";
import type { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";

export function validateOfframpQuote(
  quote: QuoteTicketAttributes,
  signingAccounts: AccountMeta[],
  options: { requireSubstrateEphemeral?: boolean } = {}
) {
  const { requireSubstrateEphemeral = true } = options;
  const fromNetwork = getNetworkFromDestination(quote.from);
  if (!fromNetwork) {
    throw new Error(`Invalid network for destination ${quote.from}`);
  }
  if (!isOnChainToken(quote.inputCurrency)) {
    throw new Error(`Input currency must be on-chain token for offramp, got ${quote.inputCurrency}`);
  }
  const inputTokenDetails = getOnChainTokenDetails(fromNetwork, quote.inputCurrency);
  if (!inputTokenDetails) {
    throw new Error(`Input currency must be on-chain token for offramp, got ${quote.inputCurrency}`);
  }
  if (!isFiatToken(quote.outputCurrency)) {
    throw new Error(`Output currency must be fiat token for offramp, got ${quote.outputCurrency}`);
  }
  const outputTokenDetails = getAnyFiatTokenDetails(quote.outputCurrency);
  const substrateEphemeralEntry = signingAccounts.find(ephemeral => ephemeral.type === "Substrate");
  if (requireSubstrateEphemeral && !substrateEphemeralEntry) {
    throw new Error("Pendulum ephemeral not found");
  }
  return { fromNetwork, inputTokenDetails, outputTokenDetails, substrateEphemeralEntry };
}
