import {
  AccountMeta,
  getAnyFiatTokenDetails,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  isFiatToken,
  isMoonbeamTokenDetails,
  isOnChainToken,
  isOnChainTokenDetails,
  MoonbeamTokenDetails,
  Networks,
  OnChainTokenDetails
} from "@packages/shared";
import { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";

export function validateAveniaOnramp(
  quote: QuoteTicketAttributes,
  signingAccounts: AccountMeta[]
): {
  toNetwork: Networks;
  outputTokenDetails: OnChainTokenDetails;
  pendulumEphemeralEntry: AccountMeta;
  moonbeamEphemeralEntry: AccountMeta;
  inputTokenDetails: MoonbeamTokenDetails;
} {
  const toNetwork = getNetworkFromDestination(quote.to);
  if (!toNetwork) {
    throw new Error(`Invalid network for destination ${quote.to}`);
  }

  const pendulumEphemeralEntry = signingAccounts.find(ephemeral => ephemeral.network === Networks.Pendulum);
  if (!pendulumEphemeralEntry) {
    throw new Error("Pendulum ephemeral not found");
  }

  const moonbeamEphemeralEntry = signingAccounts.find(ephemeral => ephemeral.network === Networks.Moonbeam);
  if (!moonbeamEphemeralEntry) {
    throw new Error("Moonbeam ephemeral not found");
  }

  if (!isFiatToken(quote.inputCurrency)) {
    throw new Error(`Input currency must be fiat token for onramp, got ${quote.inputCurrency}`);
  }
  const inputTokenDetails = getAnyFiatTokenDetails(quote.inputCurrency);

  if (!isMoonbeamTokenDetails(inputTokenDetails)) {
    throw new Error(`Input token must be Moonbeam token for onramp, got ${quote.inputCurrency}`);
  }

  if (!isOnChainToken(quote.outputCurrency)) {
    throw new Error(`Output currency cannot be fiat token ${quote.outputCurrency} for onramp.`);
  }
  const outputTokenDetails = getOnChainTokenDetails(toNetwork, quote.outputCurrency);

  if (!outputTokenDetails || !isOnChainTokenDetails(outputTokenDetails)) {
    throw new Error(`Output token must be on-chain token for onramp, got ${quote.outputCurrency}`);
  }

  return { inputTokenDetails, moonbeamEphemeralEntry, outputTokenDetails, pendulumEphemeralEntry, toNetwork };
}
