import {
  AccountMeta,
  FiatToken,
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
  substrateEphemeralEntry: AccountMeta;
  evmEphemeralEntry: AccountMeta;
  inputTokenDetails: MoonbeamTokenDetails;
} {
  const toNetwork = getNetworkFromDestination(quote.to);
  if (!toNetwork) {
    throw new Error(`Invalid network for destination ${quote.to}`);
  }

  const substrateEphemeralEntry = signingAccounts.find(ephemeral => ephemeral.type === "Substrate");
  if (!substrateEphemeralEntry) {
    throw new Error("Pendulum ephemeral not found");
  }

  const evmEphemeralEntry = signingAccounts.find(ephemeral => ephemeral.type === "EVM");
  if (!evmEphemeralEntry) {
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

  return { evmEphemeralEntry, inputTokenDetails, outputTokenDetails, substrateEphemeralEntry, toNetwork };
}

export function validateMoneriumOnramp(
  quote: QuoteTicketAttributes,
  signingAccounts: AccountMeta[]
): {
  toNetwork: Networks;
  outputTokenDetails: OnChainTokenDetails;
  substrateEphemeralEntry: AccountMeta;
  evmEphemeralEntry: AccountMeta;
} {
  const toNetwork = getNetworkFromDestination(quote.to);
  if (!toNetwork) {
    throw new Error(`Invalid network for destination ${quote.to}`);
  }

  if (quote.inputCurrency !== FiatToken.EURC) {
    throw new Error(`Input currency must be EURC for onramp, got ${quote.inputCurrency}`);
  }

  if (!isOnChainToken(quote.outputCurrency)) {
    throw new Error(`Output currency cannot be fiat token ${quote.outputCurrency} for onramp.`);
  }
  const outputTokenDetails = getOnChainTokenDetails(toNetwork, quote.outputCurrency);
  if (!outputTokenDetails) {
    throw new Error(`Output token details not found for ${quote.outputCurrency} on network ${toNetwork}`);
  }

  if (!isOnChainTokenDetails(outputTokenDetails)) {
    throw new Error(`Output token must be on-chain token for onramp, got ${quote.outputCurrency}`);
  }

  const evmEphemeralEntry = signingAccounts.find(ephemeral => ephemeral.type === "EVM");
  if (!evmEphemeralEntry) {
    throw new Error("Polygon ephemeral not found");
  }

  const substrateEphemeralEntry = signingAccounts.find(ephemeral => ephemeral.type === "Substrate");
  if (!substrateEphemeralEntry) {
    throw new Error("Pendulum ephemeral not found");
  }

  return { evmEphemeralEntry, outputTokenDetails, substrateEphemeralEntry, toNetwork };
}
